# Evolución del proyecto

## Rol dentro del portfolio

Este chatbot representa una etapa de aprendizaje y construcción orientada a automatizar pedidos por WhatsApp con controles de seguridad alrededor de entradas, pagos e inteligencia artificial.

El proyecto demuestra especialmente:

- arquitectura modular en Node.js;
- persistencia y gestión de estados;
- parser determinístico;
- fallback de IA restringido;
- validación contra catálogo;
- rate limiting y sanitización;
- HMAC para webhooks;
- pruebas automatizadas y análisis estático.

## Relación con Camdis Commerce Platform

Camdis Commerce Platform es una evolución arquitectónica independiente y más amplia. No reemplaza automáticamente este repositorio ni convierte al chatbot en un sistema productivo.

La plataforma nueva incorpora otros componentes y controles:

- tienda y dashboard web;
- PostgreSQL;
- Keycloak;
- OIDC y PKCE;
- sesiones BFF separadas;
- MFA para personal;
- RBAC;
- Docker y Caddy;
- CI con secret scanning, escaneo de imágenes y SBOM;
- backups y restauración.

El chatbot se conserva como evidencia pública de automatización segura e IA controlada. Camdis se presenta mediante un caso de estudio sanitizado porque su repositorio es privado.

## Estado honesto

- El chatbot continúa en preproducción.
- Las integraciones externas requieren pruebas aisladas y credenciales de test.
- No deben utilizarse datos personales ni pagos reales sin completar hardening y validación operativa.
- Los hallazgos y limitaciones del README siguen siendo parte del alcance actual.

## Próxima etapa recomendada

1. Protección explícita contra replay de webhooks.
2. Redacción centralizada de PII en logs.
3. Pruebas de integración de pagos.
4. Pruebas end-to-end sin conexión a cuentas reales.
5. SBOM y secret scanning del historial.
6. Release de portfolio estable y documentada.
