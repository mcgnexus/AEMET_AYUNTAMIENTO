# Tests

Carpeta de tests del proyecto Meteo Huéscar. Se irá poblando progresivamente en cada fase del refactor.

## Estructura

- `fixtures/` — Respuestas reales capturadas de AEMET, Open-Meteo, RIA, Sentinel. Usadas como entrada de tests unitarios para evitar dependencias externas.
- `unit/` — Tests de funciones puras (cálculo de confianza, corrección de altitud, ratios, etc.).
- `integration/` — Tests de capas completas con mocks de red. No requiere base de datos.

## Convenciones

- Sin dependencias de framework. Tests como scripts Node ejecutables directamente con `node --import tsx` o vía `tsx`.
- Fixtures en JSON crudo (sin transformación) para máxima fidelidad.
- Cada test debe ser independiente y dejar el entorno igual que lo encontró.

## Cómo ejecutar

```bash
# Pendiente de configurar runner (Fase 1+)
npx tsx tests/unit/nombre.test.ts
```

## Estado por fase

- **Fase 0**: estructura creada, fixtures aún vacías
- **Fase 1**: tests de `layerObservation` con fixtures reales AEMET + Open-Meteo
- **Fase 2**: tests de `riaClient` y `layerComarca`
- **Fase 3**: tests de `layerGeographic` con Sentinel mockeado
- **Fase 4**: tests de `computeEffectiveRiaSamples`
- **Fase 5**: tests de `weatherAggregator` con capas mockeadas
