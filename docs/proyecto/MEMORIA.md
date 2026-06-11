# Memoria del proyecto Meteo Huéscar

## Estado actual

- MVP visual creado con Next.js, React, TypeScript y Tailwind CSS.
- Integración real con Open-Meteo por coordenadas de Huéscar ciudad.
- API interna disponible en `GET /api/weather/current`.
- Dashboard con situación actual, confianza modelizada, alarmas básicas, predicción de 24 horas y 7 días.
- AEMET Huéscar 5051X está integrada con observaciones oficiales reales.
- Se calcula una primera estimación unificada y confianza por consenso AEMET/Open-Meteo.
- RIA Puebla GR02 está integrada mediante la API REST oficial pública.
- RIA aporta agregados diarios, ET0 y radiación. No se mezcla con la estimación instantánea.
- DeepSeek está configurado localmente para una futura fase de interpretación meteorológica, sin llamadas automáticas todavía.
- RIA/IFAPA se usa exclusivamente como fuente interna de calibración histórica diaria; la aplicación visible y el consenso instantáneo utilizan únicamente AEMET y Open-Meteo.

## Decisiones

- Implementar primero la Fase 1 para validar utilidad y presentación antes de añadir persistencia o IA.
- La confianza representa consenso calculado entre AEMET y Open-Meteo, penalizado por discrepancia y antigüedad.
- RIA aparece como referencia agroclimática retrasada cuando su último día cerrado no es reciente.
- La API mantiene degradación controlada si AEMET devuelve límites o errores de autorización.
- No mostrar RIA en el dashboard, salud de fuentes, fuentes del consenso ni contrato de `/api/weather/current`.
- La captura cron consulta RIA y Open-Meteo Archive para comparar agregados diarios equivalentes en la ubicación de Puebla de Don Fadrique.
- RIA tiene un peso secundario del 25 % por muestra frente a AEMET, porque es diaria y procede de otra ubicación; nunca modifica directamente el valor instantáneo.
- La confianza del consenso parte de un máximo de 92 % y penaliza discrepancias acotadas de temperatura, humedad, viento y precipitación, además de antigüedad AEMET, desfase temporal, calidad de ambas fuentes y uso de caché obsoleta.
- La confianza mínima del consenso es 20 %; se eliminó el suelo artificial anterior del 35 %, que ocultaba desacuerdos extremos.
- Cuando solo existe Open-Meteo, la confianza máxima es 58 % porque no hay una observación independiente para contrastar el modelo.
- Las penalizaciones por discrepancia se calibran con el MAE simultáneo histórico de Open-Meteo frente a AEMET persistido en Neon durante los últimos 90 días.
- La calibración combina umbrales previos con el MAE histórico usando 24 muestras previas equivalentes, para evitar sobreajuste cuando aún existen pocos datos.
- El peso histórico aumenta automáticamente con las capturas: con 1 muestra pesa 4 %, con 24 muestras pesa 50 % y con más de 24 pasa a dominar gradualmente.
- Los umbrales calibrados se cachean 15 minutos y `/api/weather/metrics` expone `confidenceCalibration` con MAE, muestras, tolerancia y peso histórico por variable.

## Riesgos pendientes

- El 9 de junio de 2026 se sustituyó la clave AEMET revocada por una nueva clave válida.
- La clave es válida tanto en cabecera `api_key` como en query string según pruebas reales; la autenticación no explica los timeouts intermitentes.
- AEMET 5051X alterna respuestas correctas, errores transitorios y límites `429`; no debe asumirse disponibilidad continua.
- La comparación térmica aplica un ajuste aproximado por altitud de −0,6 °C por cada +100 m respecto a la cota objetivo devuelta por Open-Meteo.
- Se conservan y muestran tanto la temperatura original como la ajustada; RIA sigue fuera de la estimación instantánea por ser diaria.
- Verificación real: cota objetivo 956 m; AEMET 1100,5 m pasa de 22,8 °C a 23,7 °C mediante un ajuste de +0,9 °C. La discrepancia restante con Open-Meteo no queda explicada solo por altitud.
- Open-Meteo se alinea ahora con la hora exacta más cercana a la observación AEMET antes de calcular consenso, estimación y confianza.
- El valor principal se etiqueta como `Último consenso`, ya que corresponde al timestamp común de comparación y no necesariamente al minuto actual.
- Verificación del 9 de junio de 2026: AEMET y Open-Meteo se compararon a las 10:00; la dispersión térmica bajó a 0,63 °C, la estimación quedó en 23,93 °C y la confianza subió a 78 %.
- Cada consenso se persiste de forma idempotente en Neon PostgreSQL mediante `DATABASE_URL`.
- La base guarda snapshots, mediciones por fuente y predicciones Open-Meteo a 48 horas para cinco variables.
- `GET /api/weather/metrics` devuelve métricas simultáneas y predictivas: MAE, sesgo y RMSE frente a AEMET.
- Las predicciones pendientes se resuelven automáticamente cuando una observación AEMET coincide con su hora válida.
- El último agregado diario disponible de RIA GR02 era del 2 de junio de 2026; no debe tratarse como observación actual.
- Falta definir contrato JSON, límites de consumo y comportamiento de fallback antes de activar DeepSeek.
- La cadena de conexión Neon está guardada exclusivamente en `.env.local` y no se expone al frontend.

## Verificación de persistencia Neon

- Dos consultas del mismo consenso mantienen un único snapshot.
- Dos consultas dentro de la misma hora mantienen una única tanda de 240 predicciones pendientes: 48 horas por 5 variables.
- El esquema remoto contiene `consensus_snapshots`, `source_measurements` y `forecast_predictions`.
- La escritura de predicciones y mediciones se realiza mediante inserciones masivas para reducir viajes al pooler.
- La captura horaria se delega a OpenClaw mediante un command cron job con horario `0 * * * *`.
- Endpoint protegido: `GET /api/cron/weather-capture`, autenticado mediante `Authorization: Bearer $CRON_SECRET`.
- El endpoint reutiliza el servicio interno de captura y persiste directamente en Neon sin llamada HTTP circular.
- Script determinista: `scripts/openclaw-weather-capture.mjs`. No inicia agente ni consume modelo.
- Configurador: `scripts/configure-openclaw-weather-cron.ps1 -BaseUrl https://dominio`.

## Verificación del cron

- Llamada sin secreto: `401 Unauthorized`.
- Llamada autenticada: captura correcta y persistencia en Neon.
- Cola verificada con 480 mediciones predictivas pendientes, correspondientes a dos tandas horarias.
- OpenClaw no está instalado ni ejecutándose en este equipo durante la configuración, y todavía no existe una URL pública detectada. El job queda preparado pero no registrado.
- Prueba manual del comando OpenClaw completada: respuesta `ok: true`, consenso persistido en Neon y fuentes visibles AEMET/Open-Meteo devueltas correctamente.
- Para registrar el job cuando OpenClaw y la URL pública estén disponibles: `.\scripts\configure-openclaw-weather-cron.ps1 -BaseUrl https://dominio`.
- AEMET usa ahora `fetch` directo sin caché de Next y timeout explícito de 8 segundos para evitar rechazos tardíos `failed to pipe response`.
- `/api/weather/current` es solo lectura; la persistencia queda reservada al endpoint cron/OpenClaw.
- Prueba de timeout AEMET simulado a 1 segundo: respuesta `200` en 1,6 segundos, fallback Open-Meteo y ningún error tardío.
- En la verificación real posterior AEMET respondió `500`; la aplicación mantuvo respuesta `200` degradada correctamente.
- Diagnóstico profundo AEMET del 9 de junio de 2026: DNS resuelve únicamente IPv4 `212.128.97.177`, TCP/TLS por IPv4 funciona y no existe registro AAAA; no es un fallo IPv6.
- Una prueba directa desde Node completó 12 ciclos seguidos de metadatos y datos con `200`, normalmente por debajo de 1,2 segundos. Posteriormente AEMET respondió `429` con ambos métodos de autenticación.
- La causa operativa es la combinación de disponibilidad intermitente de OpenData y exceso de llamadas durante recargas/pruebas, que activa el límite temporal.
- AEMET tiene caché fresca de 10 minutos, reintentos acotados solo para red/5xx, caché degradada de hasta 3 horas y fallback persistente desde Neon.
- Tras un fallo se abre un circuito local durante 5 minutos; tras `429`, durante 15 minutos. Las recargas del dashboard no repiten llamadas que prolonguen el límite.
- Verificación del circuito: primera consulta con `429` en 2063 ms; segunda consulta en 162 ms con mensaje explícito `AEMET en pausa temporal`, sin error tardío de piping.
- Verificación de confianza del 9 de junio de 2026: consenso 84 % con diferencia de 1,0 °C, 4 puntos de humedad, 1,5 km/h de viento, 35 minutos de antigüedad AEMET y desfase temporal de 0 minutos.
- Primera calibración Neon: 1 muestra por variable y peso histórico del 4 %. Tolerancias resultantes: temperatura 1,445 °C, humedad 9,76 puntos, precipitación 0,96 mm, viento 7,866 km/h y racha 11,763 km/h.
- Primera captura RIA oculta: 24 días por variable persistidos en `external_calibration_measurements`. Junto con 2 muestras AEMET equivalen a 8 muestras efectivas y un peso histórico total del 25 %.
- Verificación pública: `/api/weather/current` devuelve exclusivamente fuentes y salud `AEMET,OPEN_METEO`; RIA no aparece directamente en el dashboard.
- El dashboard incluye un panel explícito de salud únicamente para AEMET y Open-Meteo.
- Cada fuente muestra estado `OK`, `DEGRADED` o `ERROR`, hora de comprobación, antigüedad del dato y último error cuando existe.
- Verificación degradada: timeout AEMET simulado aparece como `ERROR` con mensaje exacto mientras Open-Meteo permanece `OK`.

## Aproximación comarcal desde AEMET + RIA

- Se implementó estimación comarcal para Puebla de Don Fadrique, Huéscar, Castril, Galera, Orce y Castilléjar.
- **AEMET 5051X es el ancla temporal en tiempo real**, no RIA. RIA no puede ser ancla porque publica datos con ~5 días de retraso.
- RIA Puebla GR02 actúa como **corrección de tendencia**: su observación real vs. lo que Open-Meteo Archive modeló para esa fecha produce un sesgo (ej: el modelo subestima 2°C esta época) que se aplica al valor AEMET actual.
- Open-Meteo Archive aporta el **delta espacial** entre la estación AEMET y cada localidad.
- La corrección de tendencia RIA decae con la antigüedad: peso 0.6 a 0 días, peso 0 a 8+ días (`0.6 × max(0, 1 − ageDays × 0.08)`).
- Fórmula: `estimación = AEMET_actual + delta_espacial + corrección_tendencia_RIA × trendWeight`.
- Sin AEMET disponible, se degrada a `RIA + delta_espacial` (mayor incertidumbre).
- La confianza local se basa en distancia a AEMET, antigüedad del dato AEMET y antigüedad de la tendencia RIA.
- Las estimaciones son agregados diarios; no se presentan como observaciones instantáneas.
- Endpoint: `GET /api/weather/comarca`. Contracto: `anchorSource`, `trendSource`, `anchorDate`, `trendDate`, `trendAgeDays`.
- Cada captura CRON persiste la última salida en `comarca_estimations`.
- Documentación completa: `docs/proyecto/DOCUMENTACION.md`.
- Perfiles geográficos `geo-v1.0.0` generados y persistidos para las seis capitales en `location_profiles`, con una única versión activa por localidad.
- Los perfiles incluyen relieve derivado de 9 muestras de elevación en un radio de 5 km, clase inicial de microclima y proximidad a agua y bosque cartografiada en OpenStreetMap.
- Endpoint técnico de consulta: `GET /api/weather/geographic-profiles`; regeneración protegida mediante `POST` con `CRON_SECRET`.
- Primera clasificación: Huéscar `PIEDMONT`; Orce `MIXED_RELIEF`; Puebla, Castril, Galera y Castilléjar `VALLEY`.
- Castril presenta el relieve más complejo: rango aproximado de 905 m en 5 km. Huéscar presenta 475 m.
- Los conteos ambientales de OpenStreetMap son indicadores cartográficos, no porcentajes de cobertura, y deben sustituirse posteriormente por SIOSE/CORINE e inventario forestal.
- Cliente OAuth2 de Sentinel Hub y cliente Statistical API implementados en `src/services/sentinelHubService.ts`, con token reutilizable en memoria y errores sin exposición de secretos.
- Endpoint protegido de verificación: `POST /api/weather/sentinel-hub-smoke-test`.
- Las nuevas credenciales `sh-*` pertenecen a Copernicus Data Space. OAuth2 funciona contra `identity.dataspace.copernicus.eu` y Statistical API contra `sh.dataspace.copernicus.eu`.
- Smoke test Sentinel Hub completado: 3 intervalos mensuales; el primero procesó 10.260 píxeles y devolvió aproximadamente 28,5 % de vegetación densa, 0 % de agua detectada y 0 % de nubes en el mosaico seleccionado alrededor de Huéscar.
- Coberturas Sentinel Hub calculadas y persistidas para radios de 1, 5 y 15 km en las seis localidades, activando perfiles `geo-v1.1.0`.
- Las 18 coberturas contienen 12 intervalos mensuales válidos. Resoluciones: 20 m, 50 m y 100 m según radio.
- Castril presenta la mayor vegetación detectada: 71,6 % en 1 km y 62,5 % en 15 km; también es la única localidad con agua detectada claramente en 5 km, con 1,1 %.
- Puebla presenta la menor vegetación próxima: 22,8 % en 1 km y 19,2 % en 5 km.
- La regeneración topográfica conserva las coberturas Sentinel existentes para evitar pérdida accidental de datos satelitales.
- Consola administrativa implementada en `/admin`, protegida mediante contraseña y cookie firmada `HttpOnly` con sesión de 12 horas.
- La consola reúne conclusión actual, salud de fuentes, configuración, algoritmo, calibración, perfiles geográficos, Sentinel, estimación comarcal y JSON técnico completo.
- Endpoint agregado protegido: `GET /api/admin/overview`; nunca devuelve credenciales, solo indicadores de configuración.
- Mientras no se definan `ADMIN_PASSWORD` y `ADMIN_SESSION_SECRET`, la consola usa `CRON_SECRET` como respaldo. Antes de publicar deben configurarse secretos administrativos exclusivos.
- Guía operativa: `docs/proyecto/guia_consola_administrativa.md`.

## Siguiente paso

Consumir `location_profiles` desde el algoritmo comarcal para calcular pesos por relieve, exposición, agua y bosque; después validar las estimaciones con sensores reales por localidad.
