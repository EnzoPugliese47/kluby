# Mercado Pago (sandbox) — Kluby

Integración **Checkout Pro** para reservas e invitados. Si no configurás MP, la app sigue con pagos **demo** (un clic).

---

## 1. Crear app en Mercado Pago

1. Entrá a [developers.mercadopago.com](https://www.mercadopago.com.ar/developers)
2. **Tus integraciones** → **Crear aplicación**
3. En **Credenciales de prueba** copiá el **Access Token** (empieza con `TEST-`)

---

## 2. Variables en Railway (y local `.env`)

```env
MP_ACCESS_TOKEN=TEST-xxxxxxxx...
PUBLIC_APP_URL=https://kluby-production-2fa4.up.railway.app
```

| Variable | Obligatoria | Descripción |
|----------|-------------|-------------|
| `MP_ACCESS_TOKEN` | No* | Sin esto → solo pago demo |
| `PUBLIC_APP_URL` | Sí con MP | URL HTTPS pública (Railway) |

\* Si falta `MP_ACCESS_TOKEN`, no pasa nada: la demo sigue igual.

---

## 3. Webhook (IPN)

Mercado Pago notifica pagos a:

```text
https://TU-DOMINIO.up.railway.app/api/webhooks/mercadopago
```

En el panel de MP → tu app → **Webhooks** → agregá esa URL (evento **Pagos**).

Railway ya expone HTTPS; MP lo exige.

---

## 4. Probar en sandbox

Tarjetas de prueba (Argentina): [documentación MP](https://www.mercadopago.com.ar/developers/es/docs/checkout-pro/additional-content/test-cards)

Ejemplo aprobada:

| Campo | Valor |
|-------|--------|
| Número | `5031 7557 3453 0604` |
| CVV | `123` |
| Vencimiento | cualquier fecha futura |
| Titular | `APRO` |

Flujo:

1. Login `anfitrion@kluby.com` / `password123`
2. Reservar mesa en Kora → **Confirmar y pagar**
3. Te redirige a Mercado Pago (sandbox)
4. Pagás con tarjeta de prueba → volvés a la app con QR

Para forzar **pago demo** (sin MP): agregá en el body `provider: "demo"` (útil si MP falla en la demo).

---

## 5. Producción (después de la tesis)

1. Credenciales **productivas** (sin `TEST-`)
2. Cambiar `MP_ACCESS_TOKEN` en Railway
3. Misma URL de webhook
4. Cuenta MP verificada para recibir dinero real

---

## API

| Endpoint | Descripción |
|----------|-------------|
| `GET /api/payments/config` | `{ mercadoPagoEnabled, sandbox, defaultProvider }` |
| `POST /api/reservations/:id/pay` | Demo o `{ mode: "checkout", checkoutUrl }` |
| `POST /api/guests/:guestId/pay` | Igual para invitado |
| `POST /api/webhooks/mercadopago` | IPN (MP) |
