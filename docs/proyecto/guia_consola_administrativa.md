# Guía de la consola administrativa

## Acceso

Ruta:

```text
/admin
```

Si no existe una sesión válida, la aplicación redirige a:

```text
/admin/login
```

La sesión dura 12 horas y utiliza una cookie firmada `HttpOnly` con política `SameSite=Strict`.

## Configuración recomendada

Definir secretos exclusivos en `.env.local`:

```env
ADMIN_PASSWORD=una_contraseña_larga_y_unica
ADMIN_SESSION_SECRET=un_secreto_aleatorio_largo_y_diferente
```

Mientras estas variables no existan, la consola usa `CRON_SECRET` como respaldo para ambos valores. Esto permite acceso inmediato en local, pero no debe mantenerse en producción.

Después de modificar `.env.local`, reiniciar el servidor.

## Contenido de la consola

### Conclusión actual

- confianza del consenso;
- explicación completa;
- estado, disponibilidad y último error de AEMET y Open-Meteo.

### Estado del sistema

- integraciones configuradas;
- snapshots persistidos;
- predicciones pendientes de resolver.

### Algoritmo

- fórmula del consenso;
- corrección de altitud;
- cálculo de confianza;
- calibración histórica;
- aproximación comarcal;
- interpretación Sentinel-2.

### Calibración

- MAE histórico;
- tolerancia aprendida;
- número de muestras AEMET y RIA;
- peso real del histórico.

### Perfiles y satélite

- altitud y relieve;
- clase inicial de microclima;
- cercanía a agua;
- vegetación, vegetación densa y agua detectada por radios de 1, 5 y 15 km.

### Estimación comarcal

- fecha y antigüedad de referencia RIA;
- confianza por localidad;
- temperatura, humedad, viento y ET0 estimados.

### Auditoría

El bloque final permite consultar el JSON técnico completo utilizado por la consola.

## Seguridad

- Las credenciales AEMET, Sentinel Hub, Neon y demás secretos nunca se incluyen en la respuesta.
- La consola solo muestra indicadores booleanos de configuración.
- El endpoint agregado `/api/admin/overview` requiere una cookie administrativa válida.
- El inicio de sesión compara la contraseña mediante comparación temporalmente segura.

## Operación

1. Configurar `ADMIN_PASSWORD` y `ADMIN_SESSION_SECRET`.
2. Reiniciar la aplicación.
3. Abrir `/admin`.
4. Introducir `ADMIN_PASSWORD`.
5. Usar `Actualizar` para refrescar fuentes y cálculos.
6. Usar `Cerrar sesión` al terminar.
