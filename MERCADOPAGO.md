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
MP_ACCESS_TOKEN=TEST-xxxxxxxx...   # o APP_USR-... (Credenciales de prueba)
MP_SANDBOX=true
MP_TEST_PAYER_USER_ID=3594961386   # User ID del comprador de prueba (panel MP)
PUBLIC_APP_URL=https://kluby-production-2fa4.up.railway.app
```

| Variable | Obligatoria | Descripción |
|----------|-------------|-------------|
| `MP_ACCESS_TOKEN` | No* | Sin esto → solo pago demo |
| `MP_SANDBOX` | Sí con APP_USR- | `true` si usás credenciales de **prueba** |
| `MP_TEST_PAYER_USER_ID` | Sí en sandbox† | User ID del comprador (`3594961386`). Kluby obtiene el email desde MP. |
| `MP_TEST_PAYER_EMAIL` | Alternativa † | Email exacto del comprador si preferís no usar User ID |
| `PUBLIC_APP_URL` | Sí con MP | URL HTTPS pública (Railway) |

† Uno de los dos: `MP_TEST_PAYER_USER_ID` o `MP_TEST_PAYER_EMAIL`.

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

**Importante:** en sandbox no podés usar el email de Kluby (`anfitrion@kluby.com`) como pagador. Mercado Pago exige el email del **usuario comprador de prueba** que creás en el panel.

1. Panel MP → **Tus integraciones** → tu app → **Cuentas de prueba** → **Comprador**
2. Copiá el **email/usuario** del comprador de prueba → ponelo en Railway como `MP_TEST_PAYER_EMAIL`
3. Probá en **ventana de incógnito** (o cerrá sesión en mercadopago.com)

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
4. Elegí **Tarjeta de crédito o débito** (no Pago Fácil / Rapipago: en sandbox el botón queda deshabilitado)
5. Pagá con tarjeta de prueba → volvés a la app con QR

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
