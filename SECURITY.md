# Política de seguridad

## Alcance

Este repositorio contiene un proyecto aplicado en evolución para automatizar pedidos mediante mensajería. No representa un servicio productivo activo ni debe considerarse listo para operar con credenciales, pagos o datos personales reales sin validación adicional.

## Reporte responsable

No publiques vulnerabilidades en issues, discusiones, pull requests ni capturas públicas.

Un reporte privado debería incluir:

- descripción del problema;
- impacto estimado;
- pasos mínimos para reproducirlo;
- evidencia sanitizada;
- recomendación de mitigación, cuando corresponda.

No incluyas credenciales, tokens, cookies, sesiones, claves privadas, datos personales, información comercial ni infraestructura de terceros.

## Controles implementados

- configuración externa y validación de parámetros al iniciar;
- sanitización, límites de entrada y rate limiting;
- validación estructurada del fallback de IA;
- allowlist de intenciones y bloqueo de acciones sensibles;
- autenticación criptográfica de webhooks;
- separación entre modos de prueba y operación real;
- pruebas automatizadas;
- auditoría de dependencias;
- CodeQL;
- Gitleaks sobre el historial;
- Trivy para secretos, configuración y vulnerabilidades;
- SBOM CycloneDX y checksums;
- acciones de CI fijadas por commit.

## Divulgación pública

La documentación pública puede describir capacidades, decisiones y controles generales. No debe publicar:

- secretos, certificados, sesiones o credenciales;
- datos personales, pedidos, precios, cuentas o logs reales;
- dominios privados, hosts, rutas administrativas o topología productiva;
- identificadores operativos de proveedores externos;
- configuraciones reales o combinaciones de versiones desplegadas;
- hallazgos abiertos o controles ausentes con detalle explotable;
- capturas sin sanitizar.

La ausencia de secretos no convierte automáticamente una configuración o arquitectura en información apta para publicación.

## Limitaciones

El proyecto continúa bajo revisión en áreas generales de validación dinámica, privacidad, observabilidad, continuidad y pruebas de integración. El detalle de riesgos residuales y decisiones operativas permanece en documentación privada.

## Requisitos para cambios

- usar datos ficticios y cuentas de prueba;
- no versionar archivos `.env`, sesiones, bases locales, logs ni backups;
- ejecutar `npm ci` y `npm test`;
- revisar el resultado de CI, CodeQL, Gitleaks, Trivy y auditoría de dependencias;
- documentar cambios que afecten identidad, pagos, datos personales, webhooks o controles de seguridad;
- revisar archivos, imágenes, metadatos y documentación antes de publicar.

## Alcance ético

Las pruebas deben realizarse únicamente sobre entornos, cuentas y datos propios o expresamente autorizados. Este repositorio no concede autorización para probar técnicas contra sistemas de terceros.
