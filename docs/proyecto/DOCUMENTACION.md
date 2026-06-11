# Meteo Huéscar — Documentación de la aplicación

## 1. Visión general

Meteo Huéscar es un dashboard meteorológico en tiempo real para la comarca de Huéscar (Granada, España). Combina datos de tres fuentes — AEMET (observación oficial), Open-Meteo (modelo forecast) y RIA/IFAPA (observación agrícola diaria) — mediante un motor de fusión por capas que produce una estimación unificada con confianza cuantificada y alertas automáticas.

El sistema funciona como una aplicación Next.js 16 serverless (Vercel), con persistencia en Neon PostgreSQL y CRONs horarios.

### URLs del widget

| Ruta | Descripción |
|------|-------------|
| `/` | Dashboard principal (neutro o `?skin=ayto`) |
| `/widget` | Widget embebible sin layout de página |
| `/widget?skin=ayto` | Widget con colores del Ayuntamiento de Huéscar |
| `/admin` | Consola técnica protegida por contraseña |
| `/api/weather/current` | API de tiempo actual (JSON) |
| `/api/weather/comarca` | API de estimaciones comarcales (JSON) |
| `/api/cron/weather-capture` | CRON horario (Bearer token) |
| `/api/weather/geographic-profiles` | CRON semanal de perfiles geográficos |

---

## 2. Arquitectura por capas

El motor de datos se organiza en **3 capas + 1 transversal**, unificadas por un agregador:

```
┌─────────────────────────────────────────────────────┐
│                  Agregador                           │
│  weatherAggregator.ts                              │
│  Promise.allSettled con timeouts por capa           │
│  Capa 1 obligatoria; Capas 2, 3 y 0 opcionales    │
├──────────┬──────────┬──────────┬───────────────────┤
│ Capa 1   │ Capa 2   │ Capa 3   │ Capa 0             │
│ Observa- │ Comarcal │ Geográf. │ Calibración        │
│ ción     │          │          │                     │
│ AEMET +  │ AEMET +  │ Sentinel │ MAE histórico      │
│ OpenMeteo│ RIA +    │ OpenData │ AEMET/OpenMeteo    │
│          │ OM Archive│          │ + RIA diaria        │
└──────────┴──────────┴──────────┴───────────────────┘
```

### Capa 1 — Observación (obligatoria)

**Fuente**: AEMET estación 5051X (Huéscar) + Open-Meteo Forecast por coordenadas.

**Propósito**: Producir una estimación instantánea del tiempo actual con la mayor calidad posible.

**Algoritmo**:

1. Se obtiene Open-Meteo Forecast (siempre disponible, modelo por coordenadas).
2. Se intenta obtener AEMET 5051X en vivo.
3. AEMET se almacena en caché en memoria (10 s) y en BD (Neon) para respetar límites de tasa.
4. Se aplica **corrección de altitud** a AEMET (estación a ~1100 m, Huéscar a ~953 m): gradiente de −0,006 °C/m.
5. Open-Meteo se alinea temporalmente con la marca horaria de AEMET.
6. Se produce un **consenso por fusión ponderada**: AEMET pesa más en temperatura (45% vs 35%) y Open-Meteo pesa más en viento y precipitación (40% vs 35%).
7. Si AEMET falla, se degrada a Open-Meteo solo con confianza máxima 62%.

**Ramas de degradación**:

| Rama | Condición | Resultado |
|------|-----------|-----------|
| LIVE_SUCCESS | AEMET responde OK | Fusión completa, confianza hasta 92% |
| FRESH_CACHE | Cache < 15 min y válido | Fusión con AEMET cacheado, estado OK |
| COOLDOWN + STALE | AEMET en cooldown, cache < 4 h | Fusión degradada, status DEGRADED |
| ERROR + FALLBACK | AEMET falla, sin cache útil | Solo Open-Meteo, confianza ≤ 62% |

**Gestión de fallos AEMET**:
- Tras un fallo 429 (rate limit): cooldown 15 min.
- Tras un fallo 5xx/red: cooldown 10 min.
- Cooldown máximo acotado a 30 min (nunca se atasca permanentemente).
- Cache en BD permite recuperar observaciones entre reinicios del serverless.

### Capa 2 — Comarcal (opcional)

**Fuente**: AEMET 5051X (ancla) + RIA Puebla GR02 (corrección de tendencia) + Open-Meteo Archive (delta espacial).

**Propósito**: Estimar condiciones diarias en 6 localidades de la comarca: Puebla de Don Fadrique, Huéscar, Castril, Galera, Orce y Castilléjar.

**Principio fundamental**: **AEMET es el ancla temporal; RIA corrige tendencias, nunca ancla.**

RIA publica observaciones agrícolas con ~5 días de retraso. No puede actuar como referencia temporal, pero sí aporta información valiosa sobre el sesgo estacional del modelo (calor real vs. lo que predijo el modelo para Puebla). El algoritmo aprovecha ambos:

#### Paso 1: Obtener ancla AEMET
Se carga la última observación AEMET disponible (en tiempo real, con corrección de altitud a 953 m).

#### Paso 2: Calcular corrección de tendencia RIA
Para la última jornada cerrada de RIA:
- Se obtiene el valor observado por RIA (ej: tempMedia = 20°C).
- Se obtiene lo que Open-Meteo Archive modeló para esa misma fecha en Puebla (ej: 18°C).
- **Corrección de tendencia** = observado − modelado = +2°C (el modelo subestima la temperatura en esta época).

La corrección se aplica con un peso que decae con la antigüedad:

```
trendWeight = 0.6 × max(0, 1 − ageDays × 0.08)
```

- A 0 días: peso 0.6 (RIA es muy reciente, se confía más).
- A 5 días: peso 0.2 (RIA tiene 5 días, se confía menos).
- A 8+ días: peso 0 (RIA ya no aporta nada útil).

#### Paso 3: Calcular delta espacial por localidad
Para cada localidad respecto a la estación AEMET:
- Se usa Open-Meteo Archive para el día actual: `delta = modelo(localidad) − modelo(AEMET Huéscar)`.
- Si no hay datos de hoy, se usa el día RIA como referencia: `delta = modelo(localidad, día RIA) − modelo(AEMET, día RIA)`.

#### Paso 4: Estimación final
```
estimación = valor_AEMET_actual + delta_espacial + corrección_tendencia_RIA × trendWeight
```

Ejemplo para temperatura en Castril (20.9 km de AEMET):
- AEMET hora actual: 21.8°C
- Delta espacial (Castril − Huéscar según Open-Meteo): +2.4°C
- Corrección RIA (RIA observó +2°C más que OM predijo): +2°C × 0.6 (peso para 0 días) = +1.2°C
- Resultado: 21.8 + 2.4 + 1.2 = 25.4°C

#### Confianza comarcal
```
confianza = (confianza_ancla + confianza_tendencia) × factor_distancia × 100
```
- `confianza_ancla`: 0.4–1.0 según antigüedad del dato AEMET (penaliza por horas).
- `confianza_tendencia`: 0.0–0.4 según antigüedad de RIA (0.06 puntos por día).
- `factor_distancia`: 1.0 − distancia_km × 0.03 (más lejos, menos confianza).
- Rango final: 30%–92%.

#### Sin AEMET disponible
Si AEMET no está disponible, se usa RIA como fallback temporal (con mayor incertidumbre):
```
estimación = valor_RIA + delta_espacial
```

### Capa 3 — Geográfica (contexto, opcional)

**Fuente**: Sentinel-2 L2A (Imagen satelital Copernicus) + OpenStreetMap (relieve, agua, bosque).

**Propósito**: Aportar contexto geográfico (vegetación, relieve, agua) para afinar estimaciones futuras. No modifica la confianza del consenso.

**Contenido por localidad**:
- Elevación, rango de relieve (m) en 5 km.
- Clase inicial de microclima: `PIEDMONT` (Huéscar), `VALLEY` (Puebla, Castril, Galera, Castilléjar), `MIXED_RELIEF` (Orce).
- Coberturas Sentinel-2: % vegetación, % vegetación densa, % agua detectada en radios 1, 5 y 15 km.
- Perfil ambiental: masa de agua cercana (km), bosque cercano (km).

**Regeneración**: CRON semanal (lunes 06:00 UTC) o bajo demanda.

### Capa 0 — Calibración (transversal, opcional)

**Fuente**: Base de datos Neon (mediciones históricas AEMET/Open-Meteo y calibración RIA).

**Propósito**: Ajustar las tolerancias de discrepancia entre fuentes según el error real observado (MAE histórico).

**Algoritmo**:

Para cada variable (temperatura, humedad, precipitación, viento, racha):

1. Se consulta el MAE de Open-Meteo vs AEMET de los últimos 90 días.
2. Se consulta el MAE de RIA vs Open-Meteo Archive de los últimos 90 días.
3. Las muestras RIA se ponderan con factor 0.25 (es diaria, no horaria; cada muestra RIA equivale a 0.25 muestras AEMET).
4. Se calcula un **MAE blendado**: ponderación entre MAE AEMET y MAE RIA según las muestras efectivas.
5. Se mezcla con un **prior bayesiano** (tolerancias predefinidas) usando 24 muestras previas equivalentes.
6. La **tolerancia final** = `max(prior × 0.5, min(prior × 2, blended))`.

Ejemplo con pocos datos (calibración temprana, 2 muestras AEMET + 24 RIA):
- Peso histórico: (2 + 24 × 0.25) / (8 + 24) ≈ 25%
- Tolerancia temperatura: blend entre prior 1.5°C y MAE observado.

Con 90 días (2160 muestras AEMET + 22.5 RIA efectivas):
- Peso histórico: (2160 + 22.5) / (2160 + 24) ≈ 99%
- Tolerancias prácticamente iguales al MAE real observado.

---

## 3. Algoritmo de confianza del consenso

La confianza cuantifica cuánto se puede confiar en la estimación unificada.

### Partida base: 92%

Se parte de 92% (no 100%) porque la fusión de dos modelos siempre tiene incertidumbre estructural.

### Penalizaciones

| Factor | Fórmula | Presupuesto |
|--------|---------|-------------|
| Discrepancia térmica | `min(24, 24 × spread / (tolerancia × 3))` | 24 puntos |
| Discrepancia de humedad | `min(12, 12 × spread / (tolerancia × 3))` | 12 puntos |
| Discrepancia de viento | `min(12, 12 × spread / (tolerancia × 3))` | 12 puntos |
| Discrepancia de precipitación | `min(12, 12 × spread / (tolerancia × 3))` | 12 puntos |
| Antigüedad AEMET | `min(20, max(0, age − 30) / 6)` | 20 puntos |
| Desfase temporal | `min(15, alignmentMinutes / 4)` | 15 puntos |
| Calidad de fuente | `max(0, 2 − q₁ − q₂) × 12` | 24 puntos |
| Cache obsoleta | +10 puntos si AEMET es STALE_CACHE | 10 puntos |

**Confianza final** = `max(20, 92 − penalizaciones)`

La tolerancia para cada discrepancia viene de la calibración (Capa 0) si está disponible, o de valores por defecto si no.

### Ejemplo real (9 junio 2026, 10:00)

- Discrepancia térmica: 0.63°C → penalización ≈ 2 puntos
- Discrepancia humedad: 4% → penalización ≈ 1 punto
- Antigüedad AEMET: 35 min → penalización ≈ 1 punto
- Desfase temporal: 0 min → 0 puntos
- Confianza: 92 − 4 = **~84%** (coincide con la medición real)

---

## 4. Fusión ponderada por variable

No todas las variables pesan igual de AEMET y Open-Meteo:

| Variable | Peso AEMET | Peso Open-Meteo |
|----------|-----------|-----------------|
| Temperatura | 0.45 | 0.35 |
| Humedad | 0.40 | 0.35 |
| Precipitación | 0.35 | 0.40 |
| Viento | 0.35 | 0.40 |
| Rachas | 0.35 | 0.40 |

AEMET tiene más peso en temperatura y humedad (observación directa), mientras que Open-Meteo pesa más en viento y precipitación (el modelo captura patrones espaciales que una estación puntual no ve).

Cada peso se multiplica por `qualityScore` de la fuente (0–1), que decae con la antigüedad del dato. Open-Meteo siempre tiene `qualityScore = 1` (es un forecast fresco); AEMET decae según `max(0.35, 1 − (age − 90) / 600)` para datos mayores de 90 minutos.

---

## 5. Alertas automáticas

Las alertas se generan a partir del consenso actual:

| Condición | Nivel | Mensaje |
|-----------|-------|---------|
| Temperatura ≤ 0°C | Peligro | "Riesgo de helada" |
| Temperatura 0–2°C | Aviso | "Temperatura próxima a helada" |
| Temperatura ≥ 36°C | Peligro | "Calor elevado" |
| Temperatura 32–36°C | Aviso | "Calor elevado" |
| Rachas ≥ 60 km/h | Peligro | "Rachas de viento" |
| Rachas 40–60 km/h | Aviso | "Rachas de viento" |
| Humedad ≤ 20% + ET0 ≥ 0.15 | Peligro | "Ambiente seco" |
| Humedad 20–30% + ET0 ≥ 0.15 | Aviso | "Ambiente seco" |

---

## 6. Sistema de captura CRON

### Captura horaria (`0 * * * *`)

```
POST /api/cron/weather-capture
Authorization: Bearer <CRON_SECRET>
```

Ejecuta:
1. Fusión AEMET + Open-Meteo actual → persiste consenso en `consensus_snapshots`.
2. Mediciones por fuente → persiste en `source_measurements`.
3. Predicciones Open-Meteo 48h × 5 variables → persiste en `forecast_predictions`.

Con `?full=true` (semanal recomendado):
4. Calibración RIA → compara RIA observado con Open-Meteo Archive → persiste en `external_calibration_measurements`.
5. Estimación comarcal → persiste en `comarca_estimations`.

### Captura semanal (`0 6 * * 1`)

```
POST /api/weather/geographic-profiles
Authorization: Bearer <CRON_SECRET>
```

Regenera perfiles geográficos + coberturas Sentinel-2.

---

## 7. Gestión de estado AEMET

AEMET es notoriamente intermitente. El sistema implementa un circuit breaker sofisticado:

```
                    ┌──────────────┐
                    │  LIVE_FETCH  │
                    └──────┬───────┘
                           │
              ┌────────────┼────────────┐
              │ Éxito      │ Error      │
              ▼            │            ▼
      ┌──────────────┐    │    ┌───────────────┐
      │ FRESH_CACHE   │    │    │ COOLDOWN       │
      │ 15 min TTL    │    │    │ 10 min (5xx)   │
      └──────────────┘    │    │ 15 min (429)   │
                          │    └───────┬────────┘
                          │            │
                          │   ┌────────┼────────┐
                          │   │ Cache   │ Sin    │
                          │   │ útil    │ cache  │
                          │   ▼        ▼        │
                          │ STALE_CACHE  FALLBACK
                          │ (≤4h, calidad  │   (solo Open-Meteo,
                          │  reducida 70%) │    confianza ≤62%)
                          └────────────────┘
```

- **In-memory cache**: 10 segundos TTL (evita llamadas repetidas dentro de una misma request serverless).
- **Persistencia en BD**: La observación AEMET se guarda en `latest_source_observations` y se recupera entre cold starts.
- **Cooldown máximo**: Nunca superior a 30 minutos, previene atascos permanentes.
- **Force refresh**: `POST /api/admin/force-refresh` limpia el cooldown y fuerza una nueva llamada AEMET.

---

## 8. Calibración RIA (interna, no visible)

RIA/IFAPA Puebla GR02 se utiliza exclusivamente como fuente de calibración:

1. **Captura CRON (semanal)**: Se obtienen los últimos 30 días de datos RIA.
2. **Comparación**: Para cada día con dato RIA + modelo Open-Meteo Archive:
   - `observed` = valor real RIA (ej: tempMedia = 20°C).
   - `predicted` = valor modelado por Open-Meteo (ej: 18°C).
   - `error` = predicted − observed (+2°C en este caso).
3. **Persistencia**: Se guarda en `external_calibration_measurements` con UPSERT.
4. **Uso**: La calibración consulta el MAE histórico de RIA vs Open-Meteo y lo pondera con factor 0.25 para ajustar las tolerancias del consenso.

RIA **nunca** aparece en el dashboard principal ni en `sourceHealth`; su contribución es exclusivamente interna y se refleja indirectamente en las tolerancias calibradas.

---

## 9. Perfiles geográficos y Sentinel-2

Cada localidad tiene un perfil geo con:

- **Relieve**: Elevación central, rango en 5 km, 9 muestras de altitud.
- **Microclima**: `VALLEY`, `PIEDMONT` o `MIXED_RELIEF`.
- **Cobertura Sentinel-2**: 12 intervalos mensuales × 3 radios (1 km a 20m, 5 km a 50m, 15 km a 100m).
  - % vegetación (NDVI > 0.25)
  - % vegetación densa (NDVI > 0.55)
  - % agua (SCL agua + NDWI > 0)
  - % nubes
- **Entorno**: Masa de agua más cercana (km), bosque más cercano (km).

Este contexto geográfico servirá para ponderar las estimaciones comarcales según vegetación, relieve y humedad local en futuras versiones.

---

## 10. Endpoints y contratos

### `GET /api/weather/current`

Tiempo actual fusionado. Respuesta simplificada:

```json
{
  "source": "FUSED",
  "confidencePct": 84,
  "confidenceExplanation": "AEMET y Open-Meteo alineado a las 10:00 muestran buena coincidencia térmica...",
  "current": {
    "temperatureC": 23.9,
    "humidityPct": 35,
    "windSpeedKmh": 12,
    "et0Mm": 0.45
  },
  "sources": [{ "source": "AEMET", ... }, { "source": "OPEN_METEO", ... }],
  "sourceHealth": [{ "source": "AEMET", "status": "OK" }, { "source": "OPEN_METEO", "status": "OK" }],
  "hourly": { ... },
  "daily": { ... },
  "alerts": [...]
}
```

### `GET /api/weather/comarca`

Estimaciones comarcales diarias:

```json
{
  "anchorSource": "AEMET_5051X",
  "trendSource": "RIA_PUEBLA_GR02",
  "anchorDate": "2026-06-10T08:00:00+0000",
  "trendDate": "2026-06-09",
  "trendAgeDays": 1,
  "methodology": "Ancla AEMET en tiempo real + corrección de tendencia RIA + diferencia espacial modelizada.",
  "estimates": [
    { "id": "huescar", "name": "Huéscar", "distanceFromAemetKm": 0.3, "confidencePct": 92, "values": { "temperatureC": 23.3, ... } },
    ...
  ]
}
```

---

## 11. Widget embebible

El widget está diseñado para incrustarse en `aytohuescar.es` mediante iframe:

```html
<iframe src="https://meteo-huescar.vercel.app/widget" width="420" height="500" style="border:none"></iframe>
```

Variante institucional con colores del ayuntamiento:

```html
<iframe src="https://meteo-huescar.vercel.app/widget?skin=ayto" width="420" height="500" style="border:none"></iframe>
```

El widget muestra:
- Temperatura, humedad, viento actuales con confianza del consenso.
- Alertas automáticas (helada, calor, viento, sequedad).
- Gráfico SVG de temperatura horaria (24h).
- Sección comarcal con estimaciones para 6 localidades.
- Badge RIA con antigüedad de la corrección de tendencia.

---

## 12. Pila tecnológica

| Componente | Tecnología |
|------------|-----------|
| Framework | Next.js 16 (App Router, serverless) |
| Runtime | React 19, TypeScript 5 |
| Estilos | Tailwind CSS 4 |
| Base de datos | Neon PostgreSQL (serverless) |
| Hosting | Vercel |
| Fuentes meteorológicas | AEMET OpenData, Open-Meteo Forecast + Archive, RIA/IFAPA |
| Teledetección | Sentinel-2 L2A (Copernicus Data Space) |
| Mapas | OpenStreetMap (relieve, agua, bosque) |

---

## 13. Archivos clave del motor

| Archivo | Función |
|---------|---------|
| `weatherAggregator.ts` | Orquesta las 4 capas con timeouts y disponibilidad |
| `layerObservation.ts` | Capa 1: fusión AEMET + Open-Meteo con 4 ramas de degradación |
| `consensusConfidence.ts` | Algoritmo de confianza: discrepancias, antigüedad, desfase, calibración |
| `altitudeCorrection.ts` | Corrección de altitud (−0,006 °C/m) |
| `aemetState.ts` | Circuit breaker y caché AEMET |
| `aemetClient.ts` | Cliente HTTP AEMET con reintentos |
| `openMeteoForecastClient.ts` | Cliente Forecast con alineación temporal |
| `layerComarca.ts` | Capa 2: AEMET ancla + corrección tendencia RIA + delta espacial |
| `riaClient.ts` | Cliente RIA/IFAPA |
| `openMeteoArchiveClient.ts` | Cliente Archive con retry en 429 |
| `calibrationService.ts` | Capa 0: MAE blendado con prior bayesiano |
| `riaCalibration.ts` | Generación de muestras RIA vs Open-Meteo Archive |
| `layerGeographic.ts` | Capa 3: perfiles + coberturas Sentinel |
| `weatherCaptureService.ts` | Orquestador CRON |
| `weatherRules.ts` | Alertas automáticas |