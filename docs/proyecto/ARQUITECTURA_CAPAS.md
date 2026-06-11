# Arquitectura por capas del motor de fusión

Documento vivo. Se actualiza al cerrar cada fase del refactor.

## Visión general

```
┌─────────────────────────────────────────────────────────────────┐
│  AGREGADOR: weatherAggregator                                   │
│  Punto único de entrada para el widget y rutas API              │
└──────┬──────────────┬──────────────┬────────────────────────────┘
       │              │              │
       ▼              ▼              ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────────────────┐
│ CAPA 1:      │ │ CAPA 2:      │ │ CAPA 3:                  │
│ Observación  │ │ Comarcal     │ │ Contexto geográfico      │
│ (horaria)    │ │ (diaria)     │ │ (semanal)                │
└──────┬───────┘ └──────┬───────┘ └────────┬─────────────────┘
       │                │                  │
       └────────────────┴──────────────────┘
                        │
                        ▼
                ┌───────────────────┐
                │ CAPA 0: Calibrac. │
                │ (cross-cutting)   │
                └───────────────────┘
```

## Reglas arquitectónicas

1. **Cada capa expone una única función pública** `getXxxLayer()`.
2. **Cada capa tiene su propia persistencia** (no se mezclan tablas).
3. **El agregador es read-only** sobre las capas; no las orquesta para escribir.
4. **La Capa 0 (calibración) es invocada** por Capa 1 y Capa 2 al calcular confianza.
5. **Capa 3 nunca bloquea a Capa 1**: si Sentinel/OSM falla, el widget sigue funcionando con `null` en `geographic` y warning visible.
6. **Capa 2 tampoco bloquea Capa 1**: si RIA/Archive fallan, el widget sigue funcionando con `comarca: null`.

## Responsabilidades

### Capa 0: Calibración (`src/services/calibration/`)

- Calcula tolerancias MAE combinando muestras de AEMET (vía `source_measurements`) y RIA (vía `external_calibration_measurements`).
- Calcula `effectiveRiaSamples` con la función `computeEffectiveRiaSamples(riaCount, period)`:
  - Fórmula: `Math.min(1, riaCount / 90)` → RIA diaria gana peso máximo tras 3 meses de operación.
- Provee `CalibrationProfile` con `tolerances`, `provenance`, `weighting`.
- **No invoca APIs externas**, solo lee de DB.

### Capa 1: Observación (`src/services/layers/layerObservation.ts`)

- Fusión AEMET (estación 5051X) + Open-Meteo forecast.
- Salida: `LayerObservation` con `current`, `hourly`, `daily`, `alerts`, `sources`, `sourceHealth`, `confidence`.
- Aplica corrección de altitud a AEMET (`0.006 °C/m`).
- Aplica media ponderada por `qualityScore × weights`.
- Cache en memoria 10s, persistencia en DB.
- **Es la única capa que puede bloquear el widget** (sin observación no hay nada que mostrar).

### Capa 2: Comarcal (`src/services/layers/layerComarca.ts`)

- Estima valores diarios para 6 localidades (Huéscar, Puebla de Don Fadrique, Castril, Galera, Orce, Castilléjar).
- RIA Puebla GR02 actúa como ancla diaria.
- Open-Meteo Archive aporta la diferencia espacial entre cada localidad y la estación RIA.
- Salida: `LayerComarca` con `estimates[]`, `reference`, `methodology`.
- Cliente unificado: `riaClient.ts` para evitar duplicación.

### Capa 3: Contexto geográfico (`src/services/layers/layerGeographic.ts`)

- Sentinel-2 L2A vía Copernicus Data Space Statistical API: NDVI, agua, nubes en 3 radios (1km, 5km, 15km).
- Overpass OSM: features de agua y bosque en 15km.
- Salida: `LayerGeographic` con `profiles[]`, `satelliteLastUpdate`, `fallback`.
- Actualización semanal vía CRON (`vercel.json`).
- **No modifica el consenso**, solo provee contexto para UI y notas de microclima.

### Agregador (`src/services/weatherAggregator.ts`)

- `getAggregatedWeather(opts): Promise<AggregatedWeather>`
- Ejecuta las 3 capas en paralelo con `Promise.allSettled`.
- Si Capa 1 falla → 502.
- Si Capa 2 o 3 fallan → devuelve con `null` + warning.
- Expone `availability` y `warnings` para diagnóstico en admin.

## Estado del refactor

| Fase | Descripción | Estado |
|------|-------------|--------|
| 0 | Preparación: tipos, baseline, fixtures | ✅ |
| 1 | Capa 1: extracción de `weatherService.ts` | Pendiente |
| 2 | Capa 2: unificar RIA + extracción de comarca | Pendiente |
| 3 | Capa 3: extracción de geographic + CRON semanal | Pendiente |
| 4 | Capa 0: extracción de calibration | Pendiente |
| 5 | Agregador | Pendiente |
| 6 | Migración de consumidores | Pendiente |
| 7 | Widget con sección comarcal | Pendiente |
| 8 | Limpieza legacy | Pendiente |

## Compatibilidad

Hasta Fase 6 incluida, `src/services/weatherService.ts` actúa como shim que delega a la Capa 1. Los consumidores existentes siguen funcionando sin cambios. La eliminación del shim se hace en Fase 8.
