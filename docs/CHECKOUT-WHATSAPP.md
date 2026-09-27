# PoC — Tienda en ARS con venta por curva y checkout por WhatsApp

Guía paso a paso para poner en línea la tienda **PijamaKids / luzYara** con:

- **Una sola moneda:** pesos argentinos (ARS). Se eliminó todo lo de Bolivia (BOB, QR, tasa de cambio).
- **Venta por unidad o por curva.** Una curva = **5 unidades del mismo artículo** con un **% de descuento** configurable.
- **Checkout por WhatsApp.** No se cobra en la web: el cliente arma el carrito, completa sus datos y se le abre
  WhatsApp con el pedido ya redactado hacia el número de la tienda. El dueño cierra la venta por ahí.

---

## 1. Cómo funciona (la lógica)

```
Cliente                                   Tienda (dueño)
───────                                   ──────────────
Agrega "+" (1 unidad) o "+ Curva x5"
        │
Carrito: subtotal, descuento por curva, total
        │
"Finalizar pedido" → nombre, WhatsApp, localidad, entrega, nota
        │
"Enviar pedido por WhatsApp"
        ├─► se registra el pedido (Supabase, estado "nuevo")
        └─► se abre wa.me/<número tienda>?text=<pedido>  ──►  le llega el mensaje
                                                              │
                                              Panel admin → Pedidos
                                              💬 Contactar (abre chat con el cliente)
                                              Contactado → ✓ Venta cerrada (descuenta stock)
```

### Regla de precios

| Concepto | Cálculo |
|---|---|
| Unidad | `precio_unitario × cantidad` |
| Curva | `precio_unitario × 5 × cantidad_de_curvas`, menos el `%` de descuento |
| Total | suma de líneas; el descuento de curvas se muestra aparte |

Ejemplo con 10 % de descuento y una prenda de $ 32.000:

- 1 unidad → $ 32.000
- 1 curva (5 u.) → $ 160.000 − 10 % = **$ 144.000** ($ 28.800 c/u)

Si el cliente agrega 5 o más unidades sueltas del mismo artículo, el carrito le ofrece
**"Pasar 5 u. a curva y ahorrar 10 %"**. El stock se controla sumando unidades y curvas del mismo artículo.

### Mensaje que recibe la tienda

```
¡Hola PijamaKids! Quiero hacer este pedido:

*Pedido PK-260927-8XAB*
• 1 curva x5 (5 u.) Pijama Osa Rosa - Talla S — $ 144.000 (en vez de $ 160.000)
• 2 u. Pijama Pikachu - Talla S — $ 73.000

Subtotal: $ 233.000
Descuento por curva (10%): -$ 16.000
*TOTAL: $ 217.000 (pesos argentinos)*

*Mis datos*
Nombre: Ana Pérez
WhatsApp: +5491123456789
Localidad: Rosario, Santa Fe
Entrega: Envío a domicilio

¿Me confirman disponibilidad y forma de pago? ¡Gracias!
```

Los `*asteriscos*` salen en **negrita** en WhatsApp. El enlace se arma con
`https://wa.me/<número>?text=<mensaje codificado con encodeURIComponent>`.

### Dónde está en el código (`index.html`)

| Qué | Función |
|---|---|
| Configuración por defecto (número, % curva) | `STORE_DEFAULTS` |
| Motor de precios | `priceLine`, `cartTotals`, `curvePrice`, `curveDiscountOf` |
| Carrito (unidad/curva, stock, convertir a curva) | `addToCart`, `updateCartQty`, `convertToCurve`, `updateCartUI` |
| Checkout WhatsApp | `proceedToCheckout`, `buildOrder`, `buildWhatsAppMessage`, `sendOrderWhatsApp` |
| Números AR → formato wa.me | `normalizeWaNumber` (quita 0, 15, +54 y agrega 549) |
| Admin: pedidos y cierre de venta | `loadAdminOrders`, `contactCustomer`, `setOrderStatus` |
| Admin: configuración | `saveConfig` (tabla `store_settings`) |

---

## 2. Paso a paso

### Paso 1 — Probar en modo demo (5 minutos, sin nada instalado)

1. Abrí `index.html` con doble clic (o con la extensión *Live Server* de VS Code).
2. Entrá a **Admin → ⚙️ Configuración** y poné **tu** número de WhatsApp. Tocá **Probar enlace**:
   debe abrirse WhatsApp hacia ese número.
3. En la tienda, agregá 1 curva y algunas unidades → **Finalizar pedido** → completá datos →
   **Enviar pedido por WhatsApp**.
4. Verificá que el mensaje llega bien armado.
5. En **Admin → 📋 Pedidos** aparece el pedido: probá **💬 Contactar**, **Contactado** y **✓ Venta cerrada**
   (baja el stock).

> En modo demo, configuración y pedidos se guardan **solo en ese navegador**. Sirve para mostrar el
> flujo, no para operar. Para que el dueño vea los pedidos de todos los clientes → pasos 2 a 6.

### Paso 2 — Crear el proyecto Supabase

1. <https://supabase.com/dashboard> → **New project**.
2. Nombre `pijamakids`, generá y guardá la contraseña de la base, región **South America (São Paulo)**.
3. Esperá ~2 minutos.

### Paso 3 — Crear las tablas

1. **SQL Editor → New query**.
2. Pegá **todo** `supabase/schema.sql` y **Run**. Debe decir *Success*.
3. Crea: `admins`, `store_settings`, `products` (con 5 productos de ejemplo), `orders` y la función `confirm_order`.

> **¿Ya corriste el esquema viejo (el de MercadoPago)?** Las tablas tienen otras columnas. Si no hay datos
> reales, borralas antes con:
> `drop table if exists public.orders, public.products cascade;` y volvé a correr `schema.sql`.

### Paso 4 — Registrar al dueño como admin

En el **SQL Editor**:

```sql
insert into public.admins (email) values ('correo-del-dueño@gmail.com');
```

Después, en **Authentication → Users → Add user → Send invitation**, invitá a ese mismo correo.
El login del panel es por *magic link* y **solo entra quien está invitado y en la tabla `admins`**
(cualquier otro correo no puede leer pedidos ni tocar productos, aunque consiga iniciar sesión).

### Paso 5 — Conectar `index.html`

1. **Project Settings → API** → copiá **Project URL** y la clave **anon public**.
2. En `index.html`, bloque `CONFIGURACIÓN`:

   ```js
   const SUPABASE_URL = 'https://xxxxxxxx.supabase.co';
   const SUPABASE_ANON_KEY = 'eyJhbGciOi...';
   ```

   La clave *anon* es pública por diseño; la seguridad la dan las políticas RLS del paso 3.
   **Nunca** pongas la clave `service_role` en el HTML.

### Paso 6 — Publicar el sitio

Cualquier hosting estático sirve (el archivo `_redirects` ya es compatible con Netlify y Cloudflare Pages):

- **Netlify:** <https://app.netlify.com/drop> → arrastrá la carpeta del proyecto.
- **Cloudflare Pages:** conectá el repo de GitHub, sin comando de build, directorio `/`.

Luego, en Supabase → **Authentication → URL Configuration**, poné la URL publicada en
**Site URL** y en **Redirect URLs** (si no, el magic link del admin no vuelve a la tienda).

### Paso 7 — Configurar la tienda desde el panel

1. Abrí la tienda publicada → **Admin** → pedí el magic link con el correo del dueño → abrilo.
2. **⚙️ Configuración:**
   - **Nombre de la tienda** (sale en el saludo del mensaje).
   - **Número que recibe los pedidos**: se puede escribir como `11 2345 6789`, `011 15 2345-6789` o
     `+54 9 11 2345 6789`; se guarda como `5491123456789`. Tocá **Probar enlace**.
   - **Unidades por curva** (5) y **Descuento (%)**. La vista previa muestra el efecto.
3. **📦 Productos:** cargá los productos reales con su **precio por unidad en ARS** y URL de imagen.
   El precio por curva se calcula solo. Borrá los de ejemplo.

### Paso 8 — Prueba de punta a punta (checklist)

- [ ] Cambiar el % de curva en el admin se refleja en la tienda al recargar (desde otro celular también).
- [ ] Con stock 7, se puede llevar 1 curva + 2 unidades, pero no 2 curvas.
- [ ] 5 unidades sueltas del mismo artículo ofrecen "Pasar a curva".
- [ ] En el celular, "Enviar pedido por WhatsApp" abre la app de WhatsApp con el texto completo.
- [ ] El pedido aparece en **Pedidos** del admin (desde otro navegador, con sesión de admin).
- [ ] **💬 Contactar** abre el chat con el número del cliente.
- [ ] **✓ Venta cerrada** baja el stock en la tienda.
- [ ] Sin sesión no se ven pedidos: en ventana privada, **Admin** pide el magic link; y en Supabase →
      **Table Editor → orders** con el rol `anon` (botón *Role*) la tabla aparece vacía.

---

## 3. Operación diaria del dueño

1. Llega un WhatsApp con `Pedido PK-...`.
2. Responde confirmando disponibilidad y pasa los datos de pago (alias/CBU, link de MercadoPago, efectivo, etc.).
3. En el panel marca **Contactado**; cuando cobra, **✓ Venta cerrada** (descuenta stock).
   Si el cliente no sigue, **Cancelar**.

Los montos del pedido los calcula el navegador del cliente: son una **referencia**. El precio que vale es el que
el dueño confirma por WhatsApp antes de cobrar (así que un pedido "manipulado" no genera ninguna pérdida).

---

## 4. Próxima evolución: combos flexibles

Hoy la curva son 5 unidades **del mismo artículo**. Para pasar a "5 prendas cualesquiera con 5 % menos por
prenda" solo hay que cambiar el motor de precios (`priceLine` / `cartTotals` en `index.html`):

1. El carrito ya guarda líneas `{ id, mode, qty }`; se agregaría una regla que cuente las unidades totales
   del carrito (de cualquier artículo) y aplique el descuento por prenda a partir de 5.
2. `store_settings` sumaría el tipo de regla (`curva_mismo_articulo` / `combo_mixto`) y el % por prenda.
3. El mensaje de WhatsApp, el checkout y el admin ya leen los totales de `cartTotals()`, no hace falta tocarlos.

> Nota de negocio: en el mayorismo argentino "curva" suele significar **un surtido de talles** del mismo modelo
> (ej. S-M-L-XL). Si el cliente lo pide así, es otra variante de la misma regla: 5 unidades del mismo **modelo**
> en talles distintos. Conviene confirmarlo con el cliente antes de la próxima fase.

## 5. Trabajo anterior archivado

El checkout con MercadoPago (Fase 1 anterior) quedó en pausa:

- `docs/FASE-1-PAGOS-MERCADOPAGO.md` y `supabase/functions/mp-*`: se conservan pero **no coinciden** con el
  esquema nuevo (usan `price_bob` y columnas `mp_*`). Hay que adaptarlos si se retoma el cobro online.
- `docs/archivo/fase1-mercadopago-index.patch`: los cambios que tenía `index.html` para MercadoPago.
