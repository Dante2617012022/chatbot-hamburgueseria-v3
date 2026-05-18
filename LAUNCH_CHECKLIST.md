# Checklist de lanzamiento - Chatbot Hamburgueseria V3

Este documento deja el proyecto listo para un lanzamiento controlado. La regla principal es simple: primero piloto supervisado, luego activacion gradual.

## 1. Estado minimo antes de lanzar

- Ejecutar `npm test` y confirmar `fail 0`.
- Ejecutar `npm run health` con el proceso levantado.
- Ejecutar `npm run backup` antes del primer piloto real.
- Confirmar que el bot arranca con `npm start` o con PM2.
- Confirmar que la base SQLite esta en `data/database.sqlite` o en la ruta definida por `DATABASE_PATH`.
- Confirmar que existe acceso al directorio de logs configurado para PM2.

## 2. Variables .env obligatorias

Variables base:

```env
NODE_ENV=production
DATABASE_PATH=data/database.sqlite
MENU_PATH=data/menu.json
OWNER_PHONE=549XXXXXXXXXX
ADMIN_PHONES=549XXXXXXXXXX
RATE_LIMIT_ENABLED=true
DEV_ENDPOINT_TOKEN=token-largo-interno
LOCAL_NOTIFICATION_DRY_RUN=false
```

WhatsApp:

```env
ENABLE_WHATSAPP=true
WHATSAPP_AUTH_DIR=auth_info_baileys
```

OpenAI como fallback controlado:

```env
ENABLE_AI_FALLBACK=true
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
```

Mercado Pago:

```env
MERCADOPAGO_DRY_RUN=false
MERCADOPAGO_ACCESS_TOKEN=APP_USR-...
MERCADOPAGO_NOTIFICATION_URL=https://tu-dominio.com/webhooks/mercadopago
MERCADOPAGO_WEBHOOK_SECRET=secreto-webhook
MERCADOPAGO_REQUIRE_WEBHOOK_SIGNATURE=true
MERCADOPAGO_SUCCESS_URL=https://tu-dominio.com/pagos/success
MERCADOPAGO_FAILURE_URL=https://tu-dominio.com/pagos/failure
MERCADOPAGO_PENDING_URL=https://tu-dominio.com/pagos/pending
```

## 3. Modo dry-run vs real

Antes de cobrar dinero:

- `MERCADOPAGO_DRY_RUN=true` para pruebas internas.
- `ENABLE_WHATSAPP=false` si se esta probando solo por tests o HTTP.
- `ENABLE_AI_FALLBACK=false` si todavia no se quiere usar OpenAI.

Para piloto real:

- `MERCADOPAGO_DRY_RUN=false`.
- `ENABLE_WHATSAPP=true`.
- `ENABLE_AI_FALLBACK=true` solo como respaldo, no como parser principal.
- `MERCADOPAGO_REQUIRE_WEBHOOK_SIGNATURE=true`.

## 4. PM2 y operacion del proceso

Comandos diarios:

```bash
npm run pm2:start
npm run pm2:status
npm run pm2:logs
npm run pm2:restart
npm run pm2:save
```

Criterios:

- PM2 debe reiniciar el proceso si se cae.
- Los logs deben estar disponibles para revisar errores.
- No se debe borrar `WHATSAPP_AUTH_DIR` salvo que sea necesario reescanear QR.

## 5. Backups y recuperacion

Antes y despues de cada jornada de piloto:

```bash
npm run backup
```

Criterios:

- Verificar que el backup se haya creado correctamente.
- No manipular `database.sqlite` con el bot corriendo salvo usando el script de backup.
- Guardar copias fuera del servidor si el piloto crece.

## 6. Health check

Con el bot levantado:

```bash
npm run health
```

Debe responder `ok: true` y base de datos `ok`.

## 7. WhatsApp real

Pasos:

1. Configurar `ENABLE_WHATSAPP=true` y `WHATSAPP_AUTH_DIR`.
2. Iniciar con PM2 o `npm start`.
3. Escanear el QR desde WhatsApp.
4. Enviar mensajes de prueba desde un numero no admin.
5. Confirmar que ignora grupos, broadcast, estados y mensajes propios.
6. Confirmar que las notificaciones internas llegan al local.

## 8. OpenAI fallback

Criterios:

- Activar solo despues de que `npm test` este en verde.
- Usar un modelo economico inicialmente, por ejemplo `gpt-4o-mini`.
- Revisar logs para confirmar que solo se usa en mensajes raros o no entendidos.
- Si OpenAI falla, el bot debe seguir funcionando por reglas.

## 9. Mercado Pago real

Pasos:

1. Configurar `MERCADOPAGO_DRY_RUN=false`.
2. Configurar `MERCADOPAGO_ACCESS_TOKEN` real.
3. Configurar `MERCADOPAGO_NOTIFICATION_URL` publica.
4. Configurar `MERCADOPAGO_WEBHOOK_SECRET`.
5. Confirmar `MERCADOPAGO_REQUIRE_WEBHOOK_SIGNATURE=true`.
6. Hacer una compra chica de prueba.
7. Confirmar que el pedido pasa a `PAGADO` solo cuando Mercado Pago aprueba.
8. Confirmar que llega notificacion `ORDER_PAID` al local.

## 10. Protocolo humano del local

Durante el piloto debe haber una persona mirando:

- Pedidos confirmados.
- Pagos aprobados.
- Comprobantes por transferencia.
- Pedidos en preparacion.
- Pedidos listos.
- Pedidos en camino.
- Reclamos o mensajes con `humano`.

Comandos clave:

```text
/admin pedidos
/admin notificaciones
/admin stock
/admin zonas
/admin horario
/admin abrir
/admin cerrar
/admin pausar
/admin activar
/admin preparar <idPedido>
/admin listo <idPedido>
/admin camino <idPedido>
/admin entregado <idPedido>
```

## 11. Piloto supervisado

Plan recomendado:

- Dia 1: solo equipo interno y 3 a 5 pedidos de prueba.
- Dia 2: clientes conocidos, volumen bajo.
- Dia 3: abrir al publico con supervision constante.

Criterios para avanzar:

- Cero pedidos perdidos.
- Cero cobros marcados como pagados sin aprobacion.
- Respuestas correctas ante cambios de producto, direccion, pago y cancelacion.
- Backups diarios correctos.
- Logs revisados al cierre.

## 12. No lanzar si pasa algo de esto

- `npm test` no esta en verde.
- `/health` falla.
- No hay backup reciente.
- Mercado Pago esta real pero sin firma de webhook.
- No hay persona del local supervisando.
- No se sabe como pausar el bot.
- WhatsApp pierde sesion y no hay nadie para reescanear QR.
