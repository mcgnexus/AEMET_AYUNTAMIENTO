# 🌤️ Cómo se deducen los datos meteorológicos en Meteo Huéscar

---

## 📡 Las tres fuentes de datos

| Fuente | Qué es | Frecuencia | Rol |
|:------:|--------|:----------:|:----|
| ️ **AEMET 5051X** | Estación meteorológica oficial en Huéscar | Cada hora | **El ancla**: dato real medido en el terreno |
|  **Open-Meteo** | Modelo numérico del tiempo (forecast) | Cada hora, predicción 7 días | **El contexto**: predice qué viene, da tendencia |
| 🌾 **RIA Puebla** | Estación agrícola de la Junta de Andalucía | 1 vez/día, ~5 días de retraso | **La corrección**: detecta sesgos del modelo |

---

## 🔄 El proceso paso a paso

### Paso 1️⃣: Obtener los datos crudos

- **AEMET** → Se consulta la estación 5051X. Devuelve temperatura, humedad, viento, precipitación del momento actual.
- **Open-Meteo** → Se consulta el modelo para las coordenadas de Huéscar. Devuelve predicción horaria (24h) y diaria (7 días).

---

### Paso 2️⃣: Corregir la altitud

> AEMET está a **1.100 m** de altitud. Huéscar ciudad está a **~953 m**.

La temperatura baja **~0,6°C por cada 100 m** que subes. Como AEMET está más alto, su temperatura es más fría de lo que haría en el pueblo.

```
temp_huescar = temp_aemet + (1100 − 953) × 0,006
```

**Ejemplo**: si AEMET mide **22,0°C** → en Huéscar serían **~22,9°C**.

---

### Paso 3️⃣: Alinear en el tiempo

AEMET publica a las 10:00, 11:00, etc. Open-Meteo tiene datos cada hora exacta.

Se busca la hora de Open-Meteo **más cercana** a la de AEMET para comparar manzanas con manzanas.

---

### Paso 4️⃣: Fusionar (consenso)

Se hace una **media ponderada** de AEMET y Open-Meteo. **No pesan igual**:

| Variable | Peso AEMET | Peso Open-Meteo | ¿Por qué? |
|----------|:----------:|:---------------:|-----------|
| ️ Temperatura | **45%** | 35% | AEMET mide real, el modelo estima |
| 💧 Humedad | **40%** | 35% | Igual: medición real vale más |
| 💨 Viento | 35% | **40%** | El modelo capta patrones espaciales |
| ️ Precipitación | 35% | **40%** | El modelo ve nubes que la estación no |

```
resultado = (AEMET × peso_AEMET × calidad + OpenMeteo × peso_OM × calidad) ÷ suma_pesos
```

---

### Paso 5️: Calcular la confianza

Se parte de **92%** (máximo teórico) y se resta por:

| Penalización | Cuándo se aplica | Máximo |
|--------------|-----------------|:------:|
| 🔥 Discrepancia térmica | AEMET y Open-Meteo difieren en temperatura | 24 pts |
| 💧 Discrepancia humedad | Difieren en humedad | 12 pts |
| 💨 Discrepancia viento | Difieren en viento | 12 pts |
| 🌧️ Discrepancia precipitación | Difieren en precipitación | 12 pts |
| ⏰ Antigüedad AEMET | Dato tiene más de 30 min | 20 pts |
|  Desfase temporal | Las horas no coinciden bien | 15 pts |
| 📉 Calidad de fuente | AEMET viene de caché vieja | 10 pts |

```
Confianza = max(20%, 92% − penalizaciones)
```

**Mínimo**: 20% (nunca baja de ahí) · **Máximo**: 92%

> **Ejemplo real**: diferencia de 0,6°C, 4 puntos de humedad, 35 min de antigüedad → **confianza ~84%**.

---

### Paso 6️⃣: Detectar tormentas y alertas

Se revisan las **24 horas futuras** de Open-Meteo:

| Condición | Aviso |
|-----------|-------|
| `weatherCode ≥ 95` | ⛈️ Tormenta eléctrica |
| Probabilidad ≥ 60% + código tormenta | 🌩️ Tormenta |
| Probabilidad ≥ 50% + precip ≥ 3 mm/h | 🌧️ Lluvia intensa |
| Probabilidad ≥ 40% + precip ≥ 1 mm/h | 🌦️ Lluvia |
| Viento ≥ 50 km/h | 💨 Viento fuerte |

Se calcula una **puntuación** combinando **severidad + proximidad** (la hora actual vale más que dentro de 6 horas). Se muestra el aviso **más urgente** al lado de la temperatura.

---

### Paso 7️⃣: Estimar para otras localidades (comarca)

Para pueblos cercanos **no hay estación AEMET**. Se estima así:

1. **Ancla** → se toma el valor AEMET de Huéscar (dato real actual)
2. **Delta espacial** → se calcula cuánto difiere Open-Meteo entre Huéscar y cada pueblo
3. **Corrección RIA** → RIA Puebla tiene datos reales agrícolas. Se compara lo que RIA observó con lo que Open-Meteo predijo para ese día. La diferencia (sesgo) se aplica como corrección.

**El peso de RIA decae con el tiempo**:

| Antigüedad RIA | Peso |
|:--------------:|:----:|
| 0 días | **60%** |
| 3 días | **36%** |
| 5 días | **20%** |
| 8+ días | **0%** |

```
estimación_pueblo = AEMET_actual + delta_espacial + corrección_RIA × peso_decaído
```

---

### Paso 7️⃣bis: Satélite Sentinel-2 (contexto geográfico)

> **Estado actual**: datos recopilados y almacenados, **aún no usados en el algoritmo de fusión**.

Cada lunes a las 06:00 UTC se descarga automáticamente imagery **Sentinel-2 L2A** (Copernicus Data Space) para las 6 localidades de la comarca.

**Qué se mide** (3 radios: 1 km, 5 km, 15 km):

| Indicador | Qué significa |
|-----------|--------------|
| ️ % Vegetación (NDVI > 0,25) | Cobertura vegetal general |
| 🌲 % Vegetación densa (NDVI > 0,55) | Bosque o cultivo maduro |
| 💧 % Agua detectada | Embalses, ríos, humedales |
| ☁️ % Nubes | Calidad de la imagen |

**Para qué servirá** (fase futura):
- Zonas con más vegetación → retienen más humedad → corregir estimaciones de humedad
- Zonas con agua cercana → efecto moderador de temperatura
- Zonas con relieve complejo (Castril) → ajustar delta espacial
- Clasificación de microclima: `VALLEY`, `PIEDMONT`, `MIXED_RELIEF`

**Datos actuales** (ejemplo Castril, la localidad más verde):
- Vegetación densa: **71,6%** en 1 km · **62,5%** en 15 km
- Agua detectada: **1,1%** en 5 km (única localidad con agua clara)
- Relieve: rango de **905 m** en 5 km (el más complejo)

---

### Paso 8️: Calibración continua (aprendizaje)

Cada semana se compara **RIA** (dato real) con **Open-Meteo Archive** (lo que el modelo predijo para ese día). Se calcula el **error medio absoluto (MAE)** por variable.

Este MAE se usa para ajustar las **tolerancias** del consenso: si históricamente Open-Meteo se equivoca 1,5°C en temperatura, se acepta esa discrepancia sin penalizar tanto la confianza.

> Con el tiempo, el sistema **"aprende"** cuánto confiar en cada fuente.

---

## 🗺️ Resumen visual

```
┌─────────────────────────────────────────────────────────────┐
│                    METEO HUÉSCAR                            │
│                 Motor de fusión                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  🏛️ AEMET (real, hora) ──┐                                 │
│                           ├──→ 🔧 Corrección altitud        │
│  🌐 Open-Meteo (modelo) ─┘         ↓                        │
│                              📊 Fusión ponderada            │
│                                   ↓                         │
│                              ✅ Consenso                    │
│                                   │                         │
│                    ┌──────────────┼──────────────┐          │
│                    ↓              ↓              ↓          │
│               🔢 Confianza   🚨 Alertas     🏘️ Comarca    │
│               (penalizac.)   (tormentas)   (6 pueblos)     │
│                                                             │
│  🌾 RIA (real, diario) ──→  Corrección tendencia ──    │
│                      └──→ 📈 Calibración MAE ────────┘    │
│                                                             │
│  🛰️ Sentinel-2 (semanal) ──→ ️ Perfiles geográficos     │
│         (contexto, no afecta fusión aún)                    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 📊 Ejemplo práctico: un día de junio

| Hora | AEMET | Open-Meteo | Consenso | Confianza |
|:----:|:-----:|:----------:|:--------:|:---------:|
| 10:00 | 22,8°C | 23,4°C | **23,1°C** | 84% |
| 11:00 | 24,1°C | 24,6°C | **24,4°C** | 87% |
| 12:00 | 25,3°C | 25,8°C | **25,6°C** | 89% |
| 13:00 | 26,7°C | 27,1°C | **26,9°C** | 91% |
| 14:00 | 27,1°C | 27,5°C | **27,3°C** | 92% |

> A las 14:00, AEMET y Open-Meteo coinciden casi perfectamente → confianza máxima **92%**.

---

## 🏛️ Pueblos de la comarca

| Pueblo | Distancia AEMET | Estimación hoy | Confianza |
|--------|:---------------:|:--------------:|:---------:|
| 📍 Huéscar | 0,3 km | 27,3°C | **92%** |
|  Galera | 7,3 km | 27,1°C | **92%** |
| 📍 Orce | 11,3 km | 26,8°C | **91%** |
|  Castilléjar | 13,5 km | 26,5°C | **82%** |
| 📍 Puebla de Don Fadrique | 16,0 km | 25,9°C | **72%** |
| 📍 Castril | 20,9 km | 25,2°C | **51%** |

> **Más lejos = menos confianza**. Castril tiene el relieve más complejo y está más lejos.

---

##  En resumen

1. **AEMET** da el dato real (ancla)
2. **Open-Meteo** da la predicción y el contexto espacial
3. **RIA** corrige sesgos estacionales del modelo
4. Se **fusionan** con pesos por variable
5. Se calcula **confianza** restando penalizaciones
6. Se detectan **alertas** (tormentas, calor, viento)
7. Se **estima** para pueblos cercanos
8. Se **calibra** continuamente con datos históricos
9. **Sentinel-2** aporta contexto geográfico (vegetación, agua, relieve) → fase futura de ponderación

---

*Documento generado el 10 de junio de 2026 · Meteo Huéscar v0.1.0*
