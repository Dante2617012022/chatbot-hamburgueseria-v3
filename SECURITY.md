# Política de seguridad

## Alcance

Este repositorio contiene un proyecto en evolución para automatizar pedidos por WhatsApp. No debe considerarse un servicio listo para producción sin completar los controles pendientes documentados en el README.

## Reporte responsable

Si encontrás una vulnerabilidad, evitá publicarla en un issue público. Enviá un reporte privado al responsable del repositorio con:

- descripción del problema;
- pasos mínimos para reproducirlo;
- impacto estimado;
- evidencia no sensible;
- recomendación de mitigación, si corresponde.

No incluyas credenciales, tokens, datos personales, claves privadas ni información de terceros.

## Controles ya implementados

- gestión de secretos mediante variables de entorno;
- validación de configuración al iniciar;
- firma HMAC de webhooks de Mercado Pago;
- comparación constante de firmas;
- sanitización y límite de longitud de mensajes;
- rate limiting por cliente;
- validación estructurada del fallback de IA;
- bloqueo de acciones sensibles delegadas a IA;
- exclusión de bases, logs, sesiones y secretos mediante `.gitignore`.

## Limitaciones conocidas

- falta automatizar análisis de dependencias y secret scanning;
- falta protección explícita contra replay de webhooks;
- falta redacción centralizada de PII en logs;
- falta exigir token de desarrollo en todos los escenarios donde el servidor pueda quedar expuesto;
- faltan pruebas de integración y end-to-end para pagos y servicios externos.

## Buenas prácticas para colaboradores

- no versionar archivos `.env`;
- no subir sesiones de WhatsApp ni bases SQLite;
- usar datos ficticios en pruebas;
- ejecutar `npm test` antes de proponer cambios;
- documentar cualquier cambio que afecte autenticación, pagos, datos personales o controles de seguridad.
