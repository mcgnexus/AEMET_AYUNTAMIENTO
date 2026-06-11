# Meteo Huéscar — Observatorio comarcal

Dashboard meteorológico agroclimático para la comarca de Huéscar (Granada).
Fusiona datos de **AEMET** (estación 5051X) y **Open-Meteo** para generar un
consenso meteorológico con alertas agrícolas (heladas, calor, viento, sequedad).

## Funcionalidades

- **Consenso meteorológico**: fusión ponderada de AEMET + Open-Meteo
- **Alertas agrícolas**: helada, calor extremo, rachas de viento, sequedad ambiental
- **Estimación comarcal**: corrección delta espacial sobre 6 localidades usando RIA
- **Perfiles geográficos**: elevación, orientación, masas de agua y bosque (OpenStreetMap)
- **Cobertura satelital**: NDVI, agua y nubosidad vía Sentinel-2 (Copernicus Data Space)
- **Consola técnica**: métricas de calibración, estado de fuentes, tolerancias aprendidas

## Tecnologías

| Stack | Versión |
|-------|---------|
| Next.js | 16 (App Router) |
| React | 19 |
| TypeScript | 5 |
| Tailwind CSS | 4 |
| PostgreSQL | Neon |
| APIs externas | AEMET OpenData, Open-Meteo, RIA, Overpass, Copernicus Data Space |

## Variables de entorno

```bash
cp .env.example .env.local
```

Editar `.env.local` con las claves necesarias. Ver `.env.example` para la
lista completa.

## Desarrollo

```bash
npm install
npm run dev
# http://localhost:3000
```

## Compilación

```bash
npm run build
npm start
```

## Estructura del proyecto

```
src/
├── app/              # Páginas y API routes (App Router)
│   ├── admin/        # Consola administrativa
│   └── api/          # API REST
├── components/       # Componentes React del dashboard
├── lib/              # Lógica de persistencia y autenticación
├── services/         # Servicios de integración externa
└── types/            # Tipos TypeScript compartidos
```
