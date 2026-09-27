> ⏸️ **En pausa (2026-09-27).** El cobro inicial se hace por WhatsApp ([`CHECKOUT-WHATSAPP.md`](CHECKOUT-WHATSAPP.md)). Esta guía y `supabase/functions/mp-*` no coinciden con el esquema actual; adaptarlos si se retoma MercadoPago.

# Fase 1 — Cobro real con MercadoPago (sandbox)

Guía paso a paso para dejar el checkout de **PijamaKids / luzYara** cobrando de verdad
con MercadoPago en **modo de prueba**, para demostrarle al cliente que la funcionalidad está.

Todo el backend vive en **Supabase** (2 Edge Functions). No hace falta un segundo servidor.

---

## Qué vas a lograr

```
Cliente elige pijamas ─► botón "Pagar con MercadoPago"
        │
        ▼
[Edge Function mp-create-preference]  ← recalcula el total desde la BD, crea el pedido (pending)
        │  devuelve la URL del checkout
        ▼
Checkout oficial de MercadoPago (sandbox)  ← el cliente paga con TARJETA DE PRUEBA
        │
        ├─► vuelve a la tienda → pantalla "verificando pago…"
        │
        ▼
[Edge Function mp-webhook]  ← MercadoPago avisa el pago, valida firma, marca el pedido CONFIRMADO
        │
        ▼
El pedido aparece PAGADO en el panel admin, y el stock baja solo.
```

---

## Requisitos

- Cuenta de correo para Supabase.
- Datos de Argentina (DNI/CUIL) para abrir la cuenta de MercadoPago — **MercadoPago no opera en Bolivia**.
- Una cuenta gratuita en Netlify / Cloudflare Pages / Vercel para publicar la tienda (Parte F).

---

# PARTE A — Supabase

### A.1 Crear el proyecto

1. Entrá a <https://supabase.com/dashboard> → **New project**.
2. Nombre: `pijamakids` · Database password: generá una y guardala · Region: **South America (São Paulo)**.
3. Esperá ~2 minutos a que termine de aprovisionar.

### A.2 Crear las tablas

1. Menú izquierdo → **SQL Editor** → **New query**.
2. Abrí el archivo **`supabase/schema.sql`** de este repo, copiá **todo** el contenido, pegalo y **Run**.
3. Debe decir *Success*. Esto crea `products`, `orders`, las políticas RLS, el bucket
   `order-proofs` y 5 productos de ejemplo con precio en ARS.

### A.3 Anotar las llaves

Menú → **Project Settings** → **API**. Copiá:

| Dato | Dónde lo vas a usar |
|---|---|
| **Project URL** (`https://xxxx.supabase.co`) | `index.html` |
| **anon public** (`eyJ...`) | `index.html` |
| **service_role** (`eyJ...`) | **NO se usa en index.html.** Solo lo inyecta Supabase en las Edge Functions. Nunca lo pongas en el HTML. |

---

# PARTE B — MercadoPago (Argentina)

### B.1 Crear la cuenta

1. <https://www.mercadopago.com.ar> → **Creá tu cuenta** (con datos de Argentina).
2. Verificá el correo.

### B.2 Crear la aplicación

1. Entrá a <https://www.mercadopago.com.ar/developers/panel/app> → **Crear aplicación**.
2. Nombre: `PijamaKids` · Producto: **Pagos online** · Modelo de integración: **CheckoutPro**.
3. Crear.

### B.3 Credenciales de PRUEBA

Dentro de la app → **Credenciales de prueba** (NO las de producción). Copiá:

| Dato | Para qué |
|---|---|
| **Access Token** de prueba (`TEST-...`) | Secret `MP_ACCESS_TOKEN` en Supabase |
| Public Key de prueba (`TEST-...`) | (no se usa en esta fase, guardala igual) |

### B.4 Usuario comprador de prueba

1. En el panel de la app → **Cuentas de prueba** → **Crear cuenta de prueba**.
2. Creá una como **Comprador**, país Argentina, con saldo (ej. `50000`).
3. Anotá usuario y contraseña. Con esta cuenta vas a pagar en el demo (así no pagás con tu cuenta real).

### B.5 Clave secreta del webhook

1. En la app → **Webhooks** (o **Notificaciones**) → configuración.
2. Ahí aparece una **Clave secreta** (firma). Copiala → será el secret `MP_WEBHOOK_SECRET`.
3. La **URL del webhook** la vas a poner en la Parte D (después de desplegar las funciones).
   Eventos a activar: **Pagos** (`payment`).

---

# PARTE C — Desplegar las Edge Functions

Dos formas. La **A (dashboard)** no requiere instalar nada.

### Opción A — desde el dashboard de Supabase

1. Menú → **Edge Functions** → **Deploy a new function** (o "Via editor").
2. **Función 1:**
   - Nombre EXACTO: `mp-create-preference`
   - **Verify JWT: ACTIVADO**
   - Pegá el contenido de `supabase/functions/mp-create-preference/index.ts` → **Deploy**.
3. **Función 2:**
   - Nombre EXACTO: `mp-webhook`
   - **Verify JWT: DESACTIVADO** ← importante, MercadoPago no manda JWT de Supabase.
   - Pegá el contenido de `supabase/functions/mp-webhook/index.ts` → **Deploy**.

### Opción B — con la CLI de Supabase

```bash
npm i -g supabase
supabase login
supabase link --project-ref TU_PROJECT_REF
supabase functions deploy mp-create-preference
supabase functions deploy mp-webhook --no-verify-jwt
```

### C.1 Cargar los secrets

Menú → **Project Settings** → **Edge Functions** → **Add new secret** (o `supabase secrets set`):

| Secret | Valor |
|---|---|
| `MP_ACCESS_TOKEN` | el `TEST-...` de la Parte B.3 |
| `MP_WEBHOOK_SECRET` | la clave secreta de la Parte B.5 |

> `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` **ya están** — no los cargues.

### C.2 Anotar las URLs de las funciones

```
https://TU-PROYECTO.supabase.co/functions/v1/mp-create-preference
https://TU-PROYECTO.supabase.co/functions/v1/mp-webhook
```

---

# PARTE D — Configurar el webhook en MercadoPago

1. Volvé al panel de la app → **Webhooks**.
2. **URL de producción** y **URL de pruebas**: poné
   `https://TU-PROYECTO.supabase.co/functions/v1/mp-webhook`
3. Evento: **Pagos**.
4. Guardá. Podés usar el botón **"Simular notificación"** para probar que responde `200`.

---

# PARTE E — Configurar `index.html`

Editá el bloque de configuración (arriba del todo del `<script>`, ~línea 776):

```js
const SUPABASE_URL = 'https://TU-PROYECTO.supabase.co';   // Parte A.3
const SUPABASE_ANON_KEY = 'eyJ...';                       // Parte A.3 (anon public)
const FUNCTIONS_BASE = SUPABASE_URL + '/functions/v1';    // no tocar
```

Nada más. El `FUNCTIONS_BASE` se arma solo.

---

# PARTE F — Publicar la tienda

MercadoPago necesita una URL pública (https) para devolver al cliente después de pagar.

### Netlify (rápido, sin Git)

1. <https://app.netlify.com/drop> → arrastrá la carpeta del repo.
2. Te da una URL tipo `https://pijamakids-demo.netlify.app`.
3. (Opcional) *Site settings → Change site name* para una URL más linda.

### Netlify / Cloudflare Pages con Git

- Conectá el repo `bolivianotech/luzYara`. Build command: **(vacío)**. Publish dir: **`.`**.
- El archivo `_redirects` ya está y es compatible.

> Para probar en tu compu sin publicar: serví la carpeta con `npx serve` y usá `http://localhost:3000`.
> El checkout de prueba de MercadoPago acepta `localhost`, pero publicar es más fiel al demo real.

---

# PARTE G — Probar el cobro

### Tarjetas de prueba (Argentina)

| Tarjeta | Número | CVV | Vencimiento |
|---|---|---|---|
| Mastercard | `5031 7557 3453 0604` | `123` | `11/30` |
| Visa | `4509 9535 6623 3704` | `123` | `11/30` |
| Amex | `3711 803032 57522` | `1234` | `11/30` |

**El resultado lo decide el NOMBRE del titular:**

| Nombre del titular | Resultado |
|---|---|
| `APRO` | ✅ Pago aprobado |
| `OTHE` | ❌ Rechazado (error general) |
| `FUND` | ❌ Rechazado por fondos insuficientes |
| `CONT` | ⏳ Pendiente |

DNI del titular: `12345678`.

### Flujo de prueba

1. Abrí la tienda publicada **en una ventana de incógnito**.
2. Cambiá el país a **🇦🇷 AR**.
3. Agregá 1-2 pijamas → carrito → **Confirmar Pedido**.
4. Completá nombre, email, teléfono, dirección → elegí **MercadoPago** → **Confirmar Pedido 🚀**.
5. Te redirige al checkout de MercadoPago. Si te pide login, entrá con el **usuario comprador de prueba** (Parte B.4); o pagá como invitado.
6. Elegí **tarjeta**, cargá la Mastercard de prueba con titular **`APRO`** → pagar.
7. Volvés a la tienda → **"Verificando tu pago…"** → a los pocos segundos: **"¡Pago aprobado!"** con Nro. de pedido.
8. Entrá al **panel admin** → tab **Pedidos** → el pedido figura **✓ Confirmado**, método **MP 💳**.
9. En la tienda, el **stock** de esas pijamas bajó.

---

# Cómo hacer la demo al cliente

1. Compartí pantalla con la tienda publicada.
2. Mostrá el catálogo (los productos salen de la base de datos, editables desde el panel).
3. Armá un pedido y pagá con la tarjeta `APRO` en vivo — se ve el checkout real de MercadoPago.
4. Mostrá la vuelta automática y el pedido **Confirmado** en el panel admin.
5. Repetí con titular `OTHE` para mostrar que un pago rechazado **no** confirma el pedido.
6. Aclará: *"Esto está en modo prueba. Para cobrar de verdad solo se cambian 2 credenciales
   por las de producción y se activa la cuenta — el código es el mismo."*

---

# Checklist final

- [ ] `schema.sql` ejecutado sin errores.
- [ ] `mp-create-preference` desplegada · **Verify JWT ON**.
- [ ] `mp-webhook` desplegada · **Verify JWT OFF**.
- [ ] Secrets `MP_ACCESS_TOKEN` y `MP_WEBHOOK_SECRET` cargados.
- [ ] Webhook configurado en MercadoPago → apunta a `.../functions/v1/mp-webhook`, evento Pagos.
- [ ] `SUPABASE_URL` y `SUPABASE_ANON_KEY` puestos en `index.html`.
- [ ] Tienda publicada en una URL https.
- [ ] Pago de prueba `APRO` → pedido **Confirmado** en el panel + stock descontado.

---

# Solución de problemas

| Síntoma | Causa probable | Solución |
|---|---|---|
| El botón dice "MercadoPago aún no está configurado" | `SUPABASE_URL` sigue en `YOUR_SUPABASE_URL` | Parte E. |
| "MercadoPago: No se pudo iniciar el pago" | `MP_ACCESS_TOKEN` mal, o es el de producción | Usá el **Access Token de prueba** (`TEST-...`). Revisá logs en Edge Functions → `mp-create-preference`. |
| Pagás OK pero el pedido queda en "Esperando pago" | El webhook no llega o falla la firma | 1) Webhook apunta a la URL correcta. 2) `mp-webhook` con **Verify JWT OFF**. 3) `MP_WEBHOOK_SECRET` = la clave secreta exacta del panel. Mirá los logs de `mp-webhook`. |
| "invalid signature" en los logs de `mp-webhook` | `MP_WEBHOOK_SECRET` no coincide | Copialo de nuevo del panel de MercadoPago (Webhooks → clave secreta). |
| El checkout muestra "No puedes pagarte a ti mismo" | Estás logueado con tu cuenta real de MP | Usá incógnito + el usuario **comprador de prueba**. |
| Vuelve a la tienda pero no muestra nada | `back_urls` sin dominio (serviste con `file://`) | ServÍ por http (`npx serve`) o publicá (Parte F). |
| CORS / 401 al llamar la función | Falta el header `Authorization` | Ya lo manda el código; verificá que `mp-create-preference` tenga **Verify JWT ON** y que la anon key sea la correcta. |

---

# Qué falta para producción real (Fase 3 — cuando el cliente confirme)

1. **Credenciales de producción** de MercadoPago + activar la cuenta (datos fiscales).
2. **Login admin seguro**: hoy cualquier correo puede pedir magic link. Crear los admin a mano
   y desactivar registros (ver `GUIA-DESPLIEGUE.md`).
3. **Lectura de pedidos restringida**: hoy `orders` se puede leer con cualquier UUID. Cambiar a
   un token de un solo uso o un RPC.
4. **Bucket `order-proofs` privado** + URLs firmadas (comprobantes de QR Bolivia).
5. **Quitar el descuento de stock del navegador** para QR/contra entrega y hacerlo por trigger.
6. **Reintentos / idempotencia** del webhook (hoy es suficiente para el volumen esperado).
7. **Config (tasa de cambio, etc.) en base de datos**, no en `localStorage`.
