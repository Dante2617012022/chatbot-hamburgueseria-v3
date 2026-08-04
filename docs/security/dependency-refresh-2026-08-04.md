# Actualización auditada de dependencias - 2026-08-04

## Motivo

La nueva compuerta de `npm audit` detectó una vulnerabilidad crítica en la versión instalada de Baileys y hallazgos altos en dependencias transitivas utilizadas por procesamiento multimedia y WebSocket.

## Correcciones aplicadas

- Baileys fijado en `6.7.22`, última corrección compatible de la línea 6.
- Actualización compatible de dependencias transitivas mediante `npm audit fix`.
- Renovación de paquetes asociados a `sharp`, `ws` y `protobufjs`.
- Lockfile regenerado y reinstalado mediante `npm ci`.

## Validación

- suite completa de 485 pruebas;
- CodeQL para JavaScript;
- auditoría productiva con umbral alto/crítico;
- instalación reproducible desde lockfile.

## Riesgo residual

Permanecen dos avisos moderados ligados a la versión 1.x del SDK de Mercado Pago y una dependencia transitiva de UUID. Su corrección exige migrar a una versión mayor del SDK, revisar la API utilizada y repetir pruebas de integración. Esa migración se mantiene fuera de este PR para evitar un cambio incompatible no validado.

## Decisión

No se silencian hallazgos altos o críticos. Los avisos moderados se registran como deuda explícita y deberán resolverse en un PR específico de migración de Mercado Pago.
