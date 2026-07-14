# Resumen para entrevista técnica

## Problema

La recepción manual de pedidos por WhatsApp genera errores de interpretación, tareas repetitivas y dificultades para mantener el estado de cada conversación.

## Solución

Desarrollé una aplicación modular en Node.js que interpreta mensajes, valida productos contra un catálogo, mantiene el estado del pedido en SQLite, integra pagos y deriva solicitudes cuando se requiere intervención humana.

## Decisiones de seguridad

- El parser determinístico tiene prioridad sobre la IA.
- La IA solamente se utiliza como fallback controlado.
- La salida de IA debe cumplir un JSON Schema estricto.
- Los productos se verifican contra el catálogo real.
- La IA no puede confirmar ni cancelar pedidos.
- Se aplican sanitización, límites de longitud y rate limiting.
- Los secretos se cargan mediante variables de entorno.
- Los webhooks de Mercado Pago se validan con HMAC SHA-256 y comparación constante.
- Los archivos con sesiones, logs, bases y secretos se excluyen del repositorio.

## Riesgos residuales

- Redacción centralizada de PII.
- Protección contra replay en webhooks.
- Mayor seguridad en endpoints auxiliares de desarrollo.
- Pruebas end-to-end con servicios externos.
- Política formal de retención, backup y recuperación.

## Competencias demostradas

Arquitectura modular, JavaScript, Node.js, integración de APIs, SQLite, validación de entradas, gestión de secretos, logging, pruebas automatizadas, modelado de amenazas y diseño seguro de funciones con IA.
