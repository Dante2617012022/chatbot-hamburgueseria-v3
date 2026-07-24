# Checklist de revisión para portfolio

Este documento resume los criterios que deben verificarse antes de presentar el proyecto a un reclutador o utilizarlo como caso de estudio.

## Documentación

- [ ] El README describe el problema, la arquitectura y el estado real del proyecto.
- [ ] Los controles implementados se diferencian de las mejoras pendientes.
- [ ] El modelo de amenazas refleja riesgos técnicos y de privacidad.
- [ ] La instalación local puede seguirse sin acceder a credenciales reales.
- [ ] Las limitaciones conocidas están documentadas.

## Seguridad

- [ ] No existen secretos ni credenciales en el historial visible.
- [ ] Los webhooks requieren validación criptográfica en producción.
- [ ] Las entradas tienen límites y sanitización.
- [ ] La IA no puede confirmar, cancelar ni ejecutar decisiones sensibles sin controles determinísticos.
- [ ] Los endpoints de desarrollo no quedan expuestos en producción.
- [ ] Los logs no almacenan PII innecesaria.

## Calidad

- [ ] La suite de pruebas finaliza correctamente.
- [ ] GitHub Actions ejecuta las pruebas en cada pull request.
- [ ] CodeQL analiza el código.
- [ ] Dependabot controla dependencias npm y GitHub Actions.
- [ ] Los títulos de ramas, commits y pull requests describen el cambio realizado.

## Presentación profesional

- [ ] El repositorio tiene descripción y temas relevantes en GitHub.
- [ ] El proyecto está enlazado directamente desde el portfolio y el CV.
- [ ] Hay capturas o una demostración con datos ficticios.
- [ ] Se explica con claridad qué parte fue diseñada y desarrollada por el autor.
- [ ] Se dispone de una explicación de dos minutos para entrevistas.
