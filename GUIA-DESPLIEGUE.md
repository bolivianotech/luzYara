> ⚠️ **Desactualizada (2026-09-27).** La tienda ahora es solo ARS, vende por unidad o por curva y cierra la venta por WhatsApp. La guía vigente es [`docs/CHECKOUT-WHATSAPP.md`](docs/CHECKOUT-WHATSAPP.md). Esta queda como referencia de la arquitectura anterior.

# PijamaKids (repo `luzYara`) — Guía de composición y despliegue

> Documento de referencia para entender qué hace `index.html` y qué se necesita
> para publicarlo en línea y que funcione de verdad (no solo el modo demo).
>
> **Actualización (Fase 1, 2026-09):** el cobro con MercadoPago ya no es una tarjeta
> estática — está la integración real (sandbox) con 2 Edge Functions de Supabase.
> Para montarla: **[`docs/FASE-1-PAGOS-MERCADOPAGO.md`](docs/FASE-1-PAGOS-MERCADOPAGO.md)**.
> Lo de abajo describe el resto de la app; los puntos 7.1 y 7.5 de "problemas conocidos"
> quedan resueltos por la Fase 1.

---

## 1. Qué es

Una **tienda online de una sola página** (Single Page App) para vender pijamas
enterizos de niños, con envíos a **Bolivia (BOB)** y **Argentina (ARS)**.

- **Un único archivo**: `index.html` contiene todo — HTML, CSS y JavaScript.
- **Sin build, sin framework, sin `package.json`.** Es HTML estático puro.
- **Backend**: [Supabase](https://supabase.com) (base de datos Postgres + Storage + Auth),
  llamado directamente desde el navegador con la librería `@supabase/supabase-js`.
- **Panel de administración** incluido en el mismo archivo (se muestra/oculta con JS).
- **Asistente con IA** (widget de chat) que *intenta* llamar a la API de Anthropic.

El repo tiene solo 2 archivos:

| Archivo       | Para qué sirve |
|---------------|----------------|
| `index.html`  | La aplicación completa. |
| `_redirects`  | Regla SPA para Netlify/Cloudflare Pages: `/*  /index.html  200` (cualquier ruta sirve el index). |

---

## 2. Arquitectura

```
┌───────────────────────────────────────────┐
│  Navegador del cliente                     │
│                                           │
│  index.html                               │
│   ├─ Tailwind (Play CDN)                   │
│   ├─ @supabase/supabase-js (jsDelivr CDN)  │
│   └─ Google Fonts                          │
│                                           │
│   Lógica: catálogo, carrito, checkout,     │
│   panel admin, chat IA                     │
└───────────────┬───────────────────────────┘
                │  (anon key, desde el navegador)
                ▼
┌───────────────────────────────────────────┐
│  Supabase                                  │
│   ├─ Postgres:  tabla products             │
│   │              tabla orders              │
│   ├─ Storage:   bucket order-proofs        │
│   └─ Auth:      Magic Link (email OTP)     │
└───────────────────────────────────────────┘
                │  (opcional, hoy NO funciona)
                ▼
        api.anthropic.com  (asistente IA)
```

No hay servidor propio. Todo lo que no es archivo estático lo resuelve Supabase.

---

## 3. Anatomía de `index.html`

### 3.1 Dependencias externas (líneas 7–11)

| Recurso | Origen | Nota |
|---|---|---|
| `cdn.tailwindcss.com` | Tailwind **Play CDN** | Compila CSS en el navegador en cada carga. Muestra un warning de consola. Funciona, pero no es lo ideal para producción. |
| `@supabase/supabase-js@2` | `cdn.jsdelivr.net` | Cliente de Supabase. |
| Google Fonts: `Nunito`, `SF Pro Display` | `fonts.googleapis.com` | `SF Pro Display` **no existe** en Google Fonts → ese request falla en silencio y cae a `Nunito` / fuente del sistema. |

### 3.2 CSS (líneas 12–333)

- Variables de tema en `:root` (colores, radios, sombras). Estética tipo iOS:
  glassmorphism (`.glass`, `backdrop-filter: blur`), tarjetas redondeadas, animaciones.
- Componentes por clase: `.product-card`, `.badge`, `.btn-add`, `#cart-drawer`,
  `.modal-overlay`/`.modal-box`, `.pill-tab`, `.country-btn`, `.payment-card`,
  `#ai-chat`, `#admin-panel`, `.toast`, `.skeleton` (loader), `.spinner`, etc.
- Grid de productos responsivo con `grid-template-columns: repeat(auto-fill, minmax(...))`.

### 3.3 Estructura HTML (líneas 335–770)

| Bloque | ID / selector | Descripción |
|---|---|---|
| Toasts | `#toast-container` | Notificaciones emergentes. |
| Navbar | `#navbar` | Logo, buscador, selector de país **BO/AR**, botón **Admin**, botón **Carrito** con contador. |
| Hero | `.hero-gradient` | Banner "Nueva Colección". |
| Filtros | `#categories-bar` | Pills: Todos / Osa Rosa / Oso Café / Monstruo Rojo / Pikachu. |
| Grid productos | `#products-grid` | Se rellena por JS; arranca con 4 skeletons. |
| Botón + panel IA | `#ai-btn`, `#ai-chat` | Chat flotante abajo a la derecha. |
| Carrito | `#cart-overlay`, `#cart-drawer` | Panel lateral deslizante. |
| Modal producto | `#product-modal` | Detalle de un producto. |
| Modal checkout | `#checkout-modal` | Formulario de compra + pago + comprobante. |
| Modal login admin | `#admin-login-modal` | Pide email para enviar Magic Link. |
| **Panel admin** | `#admin-panel` | Pantalla completa oculta. Tabs: **Productos**, **Pedidos**, **Configuración**. Incluye tarjetas de stats, formulario de alta/edición de productos, tabla de pedidos y ajustes (tasa de cambio, QR Bolivia, link/alias MercadoPago, umbral de stock bajo, email de alertas). |

### 3.4 JavaScript (líneas 772–1854)

**Configuración (líneas 776–777)** — las dos constantes que hay que tocar:

```js
const SUPABASE_URL = 'https://usbnyhlsagyykcjbaoad.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiI...';   // clave anon (rol "anon")
```

> El repo **ya trae valores reales** apuntando al proyecto Supabase `usbnyhlsagyykcjbaoad`.
> Si tienes acceso a ese proyecto, la app ya está "conectada". Si no, hay que crear
> un proyecto propio y reemplazar ambos valores.

**Estado global (`state`, líneas 790–807):** país, moneda, `cart[]`, `products[]`,
`filteredProducts[]`, categoría actual, `config` (tasa ARS = 180, QR, link/alias MP,
umbral stock bajo), `isAdmin`, límites `maxQtyBO = 6` / `maxQtyAR = 5`.

**`DEMO_PRODUCTS` (líneas 810–859):** 8 productos de ejemplo con imágenes JPEG
**embebidas en base64** dentro del propio HTML (esto es lo que infla el archivo a ~3 MB).

**Modo demo vs. modo conectado**

El código decide con: `if (!sbClient || SUPABASE_URL === 'YOUR_SUPABASE_URL')`.
Como la URL **sí** está puesta, la app **siempre intenta usar Supabase**. Solo cae a
`DEMO_PRODUCTS` si la consulta a Supabase falla (tabla inexistente, RLS que bloquea, red).
Es decir: **si ves los 8 productos de demo en producción, algo está mal en Supabase.**

**Módulos funcionales:**

| Función(es) | Qué hace |
|---|---|
| `loadProducts()` | `SELECT * FROM products WHERE active = true`. Si falla → demo. Calcula `price_ars` si falta (`price_bob * rateARS`). |
| `renderProducts()` | Pinta las tarjetas: precio según país, badges "Nuevo"/"Sin stock", "¡Últimas N!", indicador de stock (verde/naranja/rojo), botón `+`. |
| `filterByCategory()`, `filterProducts()`, `applyFilters()` | Filtro por categoría + búsqueda de texto (nombre/categoría/talla). |
| `setCountry()`, `updateCurrencyInfo()` | Cambia BO↔AR: moneda (BOB/ARS), símbolo (Bs./$), límite de unidades, re-render. |
| `showProductDetail()` | Modal con imagen grande, descripción, precio, stock, botón agregar. |
| `addToCart()`, `removeFromCart()`, `updateCartQty()`, `clearCart()`, `updateCartUI()` | Carrito con validación de stock y de límite por país (6 BO / 5 AR). **No persiste al recargar.** |
| `toggleCart()` | Abre/cierra el drawer lateral. |
| `proceedToCheckout()` | Arma el modal de compra: resumen, datos del cliente (nombre/email/teléfono/dirección), métodos de pago según país. |
| `selectPayment()`, `showPaymentInstructions()` | BO: **QR Bolivia** (Tigo Money/SimplePay) o **Contra entrega**. AR: **MercadoPago** (alias/link) o **Contra entrega**. Muestra instrucciones y activa la subida de comprobante. |
| `handleProofUpload()` | Previsualiza la imagen/PDF del comprobante. |
| `submitOrder()` | 1) valida datos y comprobante · 2) sube el comprobante a Storage `order-proofs/proofs/…` · 3) `INSERT` en `orders` · 4) **descuenta stock** producto por producto con `UPDATE products` · 5) muestra recibo con Nº de pedido. |
| `showOrderConfirmation()` | Pantalla "¡Pedido Confirmado!" con recibo y vacía el carrito. |
| `showModal()`, `closeModal()` | Utilidades de modales. |
| `toggleAI()`, `sendAIMessage()`, `getLocalAIReply()`, `addAIMessage()` | Chat. Intenta `fetch` a `api.anthropic.com` (modelo `claude-sonnet-4-20250514`). **Ese fetch siempre falla** (sin API key + CORS) → usa `getLocalAIReply()`, que son respuestas fijas basadas en palabras clave. |
| `checkAdminSession()`, `showAdminLogin()`, `sendMagicLink()`, `enterAdmin()`, `exitAdmin()` | Login admin vía **Magic Link** de Supabase (`auth.signInWithOtp`). Si hay sesión activa → entra al panel. |
| `adminTab()` | Cambia entre tabs del panel. |
| `loadAdminProducts()`, `loadAdminStats()` | Tabla de productos + tarjetas de métricas (productos, sin stock, stock bajo). |
| `loadAdminOrders()`, `confirmOrder()` | `SELECT * FROM orders ORDER BY created_at DESC LIMIT 50`. Botón "Confirmar" → `UPDATE orders SET payment_status='confirmed'`. Enlace "Ver comprobante". |
| `showAddProduct()`, `editProduct()`, `saveProduct()`, `updateStock()`, `autoConvertPrice()` | ABM de productos contra Supabase (`INSERT`/`UPDATE products`). `updateStock` usa `prompt()`. |
| `saveConfig()` | Guarda la config **solo en `localStorage`** (`pijamakids_config`). **No se guarda en Supabase**, así que es local a ese navegador y el cliente final no la ve. |
| `showToast()` | Notificaciones. |

---

## 4. Qué espera la app de Supabase (contrato de datos)

Deducido del código. Si esto no existe tal cual, la tienda funciona en modo demo y
el checkout / admin fallan.

### Tabla `products`

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | Los `id` de demo son `'1'..'8'` (string); en Supabase son uuid. |
| `name` | text | |
| `category` | text | `osa` \| `oso` \| `monstruo` \| `pikachu` |
| `size` | text | `S` \| `M` \| `L` \| `XL` |
| `price_bob` | numeric | |
| `price_ars` | numeric | Puede ser null → se calcula en cliente. |
| `stock` | integer | |
| `description` | text | |
| `image_url` | text | URL directa o `data:` base64. |
| `active` | boolean | La tienda solo lee `active = true`. |
| `created_at` | timestamptz | default `now()` |

### Tabla `orders`

| Columna | Tipo | Valores |
|---|---|---|
| `id` | uuid PK | default `gen_random_uuid()` |
| `customer_name` / `customer_email` / `customer_phone` / `customer_address` | text | |
| `items` | jsonb | `[{ id, name, qty, price }]` |
| `total_bob` | numeric | null si el pedido es de Argentina |
| `total_ars` | numeric | null si el pedido es de Bolivia |
| `currency` | text | `BOB` \| `ARS` |
| `payment_method` | text | `qr_bolivia` \| `mercadopago` \| `contra_entrega` |
| `payment_status` | text | `pending_proof` \| `pending_delivery` \| `confirmed` \| `rejected` |
| `country` | text | `BO` \| `AR` |
| `payment_proof_url` | text | URL pública del comprobante (o null en contra entrega). |
| `created_at` | timestamptz | default `now()` |

### Storage

- Bucket **`order-proofs`**. Los archivos se suben con prefijo `proofs/…`.
- El código llama `getPublicUrl(...)` → el bucket debe permitir **lectura pública**
  (o cambiar el código a URLs firmadas).

### Auth

- Proveedor **Email** habilitado con **Magic Link** (OTP).
- El redirect del magic link es `window.location.href` (la URL donde esté publicada la app).

---

## 5. Pasos para desplegar en línea

### Paso 1 — Proyecto Supabase

1. Crear proyecto en [supabase.com](https://supabase.com) (o usar el existente si tienes acceso).
2. **SQL Editor → New query** y ejecutar todo esto:

```sql
-- =========================================================
--  TABLA products
-- =========================================================
create table if not exists public.products (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  category    text not null check (category in ('osa','oso','monstruo','pikachu')),
  size        text not null,
  price_bob   numeric not null,
  price_ars   numeric,
  stock       integer not null default 0,
  description text,
  image_url   text,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

alter table public.products enable row level security;

-- La tienda (usuario anónimo) solo lee productos activos
create policy "products_public_read"
  on public.products for select
  to anon, authenticated
  using (active = true);

-- El admin (usuario logueado) gestiona todo
create policy "products_admin_all"
  on public.products for all
  to authenticated
  using (true) with check (true);

-- =========================================================
--  TABLA orders
-- =========================================================
create table if not exists public.orders (
  id                uuid primary key default gen_random_uuid(),
  customer_name     text not null,
  customer_email    text not null,
  customer_phone    text not null,
  customer_address  text not null,
  items             jsonb not null,
  total_bob         numeric,
  total_ars         numeric,
  currency          text not null,
  payment_method    text not null,
  payment_status    text not null default 'pending_proof',
  country           text not null,
  payment_proof_url text,
  created_at        timestamptz not null default now()
);

alter table public.orders enable row level security;

-- El cliente puede crear su pedido
create policy "orders_anon_insert"
  on public.orders for insert
  to anon with check (true);

-- Solo el admin lee y actualiza pedidos
create policy "orders_admin_read"
  on public.orders for select to authenticated using (true);

create policy "orders_admin_update"
  on public.orders for update to authenticated using (true) with check (true);

-- =========================================================
--  Descontar stock automáticamente al crear un pedido
--  (RECOMENDADO: reemplaza el descuento que hoy hace el navegador)
-- =========================================================
create or replace function public.decrement_stock_on_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare item jsonb;
begin
  for item in select * from jsonb_array_elements(new.items) loop
    update public.products
       set stock = greatest(0, stock - (item->>'qty')::int)
     where id = (item->>'id')::uuid;
  end loop;
  return new;
end;
$$;

drop trigger if exists trg_decrement_stock on public.orders;
create trigger trg_decrement_stock
  after insert on public.orders
  for each row execute function public.decrement_stock_on_order();
```

3. **Storage → Create bucket** → nombre `order-proofs`, marcar **Public bucket**.
   Luego, en **SQL Editor**:

```sql
-- Subir comprobante (checkout anónimo)
create policy "order_proofs_anon_upload"
  on storage.objects for insert
  to anon
  with check (bucket_id = 'order-proofs');

-- Lectura pública (para getPublicUrl y para que el admin lo vea)
create policy "order_proofs_public_read"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'order-proofs');
```

4. **(Opcional) Cargar los 8 productos de ejemplo:**

```sql
insert into public.products (name, category, size, price_bob, stock, description) values
('Pijama Osa Rosa - Talla S','osa','S',180,8,'Pijama enterizo de polar suave. Capucha con orejitas de osa. Talla S (1-2 años).'),
('Pijama Osa Rosa - Talla M','osa','M',195,4,'Pijama enterizo de polar suave. Capucha con orejitas de osa. Talla M (2-3 años).'),
('Pijama Oso Café - Talla S','oso','S',185,6,'Pijama enterizo café chocolate. Capucha con cara de osito. Talla S (1-2 años).'),
('Pijama Oso Café - Talla M','oso','M',200,2,'Pijama enterizo café chocolate. Capucha con cara de osito. Talla M (2-3 años).'),
('Pijama Monstruo Rojo - Talla S','monstruo','S',190,0,'Pijama monstruo rojo con capucha de dientes. Talla S (1-2 años).'),
('Pijama Monstruo Rojo - Talla M','monstruo','M',205,5,'Pijama monstruo rojo con capucha de dientes. Talla M (2-3 años).'),
('Pijama Pikachu - Talla S','pikachu','S',210,7,'Pijama Pikachu amarillo. Orejas puntiagudas. Talla S (1-2 años).'),
('Pijama Pikachu - Talla M','pikachu','M',225,3,'Pijama Pikachu amarillo. Orejas puntiagudas. Talla M (2-3 años).');
```

   Después, subir una imagen a cada producto desde el panel admin (campo `image_url`).

5. **Authentication → Providers → Email**: habilitado (Magic Link viene incluido).
6. **Authentication → Users → Add user**: crear el/los correos de administrador.
7. **Authentication → Providers → Email → "Allow new users to sign up": OFF.**
   (Así solo los correos que ya creaste pueden pedir Magic Link y entrar al panel.)
8. **Project Settings → API**: copiar **Project URL** y **anon public key**.

### Paso 2 — Configurar `index.html`

Editar líneas 776–777 con los valores del Paso 1.8:

```js
const SUPABASE_URL = 'https://TU-PROYECTO.supabase.co';
const SUPABASE_ANON_KEY = 'TU_ANON_KEY';
```

> **Nunca** poner aquí la `service_role` key. La `anon` key es pública por diseño
> (la protección real son las políticas RLS del Paso 1).

**(Opcional)** Si usaste el trigger `trg_decrement_stock`, puedes borrar el bloque
que descuenta stock desde el navegador (dentro de `submitOrder`, ~líneas 1386–1392):

```js
      // Reduce stock
      for (const item of state.cart) {
        const prod = state.products.find(p => p.id === item.id);
        if (prod) {
          const newStock = prod.stock - item.qty;
          await sbClient.from('products').update({ stock: newStock }).eq('id', item.id);
        }
      }
```

Así `anon` no necesita permiso de `UPDATE` sobre `products`.

### Paso 3 — Publicar el sitio estático

Elige **una** opción. Todas sirven `index.html` en la raíz; no hay build.

#### Opción A · Netlify (recomendado — `_redirects` ya es compatible)

- **Con Git**: [app.netlify.com](https://app.netlify.com) → *Add new site → Import an existing project* →
  conectar `github.com/bolivianotech/luzYara` → *Build command*: **(vacío)** ·
  *Publish directory*: **`.`** → *Deploy*.
- **Sin Git**: arrastrar la carpeta del repo a [app.netlify.com/drop](https://app.netlify.com/drop).
- Dominio propio: *Site configuration → Domain management*.

#### Opción B · Cloudflare Pages (`_redirects` compatible)

- [dash.cloudflare.com](https://dash.cloudflare.com) → *Workers & Pages → Create → Pages → Connect to Git* →
  repo → *Framework preset*: **None** · *Build command*: **(vacío)** · *Output directory*: **`/`** → *Save and Deploy*.

#### Opción C · Vercel

- [vercel.com/new](https://vercel.com/new) → importar el repo → *Framework Preset*: **Other** →
  *Deploy*. (Vercel ignora `_redirects`, pero no importa: es una sola página sin rutas.)

#### Opción D · GitHub Pages

- Repo → *Settings → Pages* → *Source*: **Deploy from a branch** → `main` / `/ (root)` → *Save*.
- URL: `https://bolivianotech.github.io/luzYara/`
- Funciona porque no hay rutas del lado cliente ni rutas absolutas a assets. `_redirects` se ignora.

### Paso 4 — Volver a Supabase y registrar el dominio

**Authentication → URL Configuration:**

- **Site URL**: `https://TU-DOMINIO`
- **Redirect URLs**: agregar `https://TU-DOMINIO/**`

Sin esto, el Magic Link del admin redirige mal o Supabase lo rechaza.

### Paso 5 — Configuración operativa desde el panel admin

Entrar como admin (botón **Admin** → Magic Link → correo) y en la tab **Configuración**:

- **Tasa de cambio BOB → ARS** (el código arranca en 180).
- **QR Bolivia**: URL de la imagen del QR de cobro.
- **MercadoPago**: link de pago y alias.
- **Umbral de stock bajo**.

> ⚠️ Esto se guarda en el `localStorage` **de ese navegador**, no en Supabase.
> Si cambias de equipo/navegador hay que volver a cargarlo, y el cliente final
> verá "no configurado" hasta que se resuelva (ver §7, punto 9).

---

## 6. Checklist de verificación (QA)

- [ ] La home carga productos **de Supabase** (no los 8 de demo).
- [ ] Cambiar **BO ↔ AR** cambia moneda, símbolo y precios.
- [ ] Buscador y filtros por categoría funcionan.
- [ ] Agregar al carrito respeta stock y límite (6 BO / 5 AR).
- [ ] Checkout: datos + método de pago + subir comprobante → "¡Pedido Confirmado!" con Nº.
- [ ] En Supabase aparece la fila en `orders`.
- [ ] En Storage `order-proofs/proofs/…` aparece el archivo del comprobante.
- [ ] El `stock` del producto comprado bajó.
- [ ] Botón **Admin** → llega el Magic Link → abre el panel.
- [ ] Panel: se ven productos, pedidos, "Confirmar" cambia estado, editar/alta de producto, cambiar stock.
- [ ] Un correo **no** registrado como admin **no** puede entrar (signups en OFF).

---

## 7. Problemas conocidos y riesgos de seguridad

| # | Problema | Impacto | Mitigación |
|---|---|---|---|
| 1 | **El login admin no valida quién eres.** `signInWithOtp` con signups activados crea cuenta para cualquier correo; cualquier usuario `authenticated` pasa las policies. | Alguien podría entrar al panel y modificar catálogo/pedidos. | Crear admins a mano + **desactivar signups** (Paso 1.6–1.7). Idealmente, tabla `admins` y chequearla en las policies (`using (auth.uid() in (select id from admins))`). |
| 2 | **El navegador descuenta stock** con la anon key (`UPDATE products`). Requiere una policy que deja a `anon` escribir en `products` → también permite tocar precio/activo desde la consola. | Manipulación de datos. | Usar el **trigger `trg_decrement_stock`** (incluido) y borrar el bloque cliente (Paso 2). No crear policy de `UPDATE` para `anon`. |
| 3 | **Precios, totales y límites se calculan en el cliente.** Un atacante puede `INSERT` en `orders` con `total_bob` arbitrario. | Pedidos con total falso. | Recalcular el total en un trigger/Edge Function a partir de `items` + `products`. |
| 4 | **Bucket `order-proofs` público.** Cualquiera con la URL ve comprobantes de pago (datos financieros). | Fuga de datos. | Bucket **privado** + `createSignedUrl()` en el panel admin (requiere tocar código). |
| 5 | **El asistente IA no funciona.** `fetch` directo a `api.anthropic.com` sin API key y bloqueado por CORS → siempre usa las respuestas fijas de `getLocalAIReply()`. | Feature "muerta" (degrada elegante). | Crear una **Supabase Edge Function** que guarde `ANTHROPIC_API_KEY` y reenvíe la petición; apuntar el `fetch` (línea ~1490) a esa función. Actualizar el modelo (`claude-sonnet-4-20250514`). |
| 6 | **La anon key está commiteada** en un repo público. | Aceptable **solo** si RLS está bien. Nunca subir la `service_role`. | RLS obligatorio. Considerar rotar la anon key. |
| 7 | **Tailwind Play CDN** en producción. | Warning en consola, recompila en cada carga, algo más lento. | Compilar Tailwind a un CSS estático, o pasar a CSS propio. |
| 8 | **Página ~3 MB**: 8 imágenes JPEG en base64 dentro del HTML (`DEMO_PRODUCTS`). | Carga lenta en móvil. | Subir imágenes a Storage/Cloudinary y usar `image_url`. Los productos reales de Supabase no cargan este peso. |
| 9 | **Config global solo en `localStorage`** (tasa, QR, alias MP). El cliente final nunca ve el QR ni el alias. | Checkout muestra "no configurado". | Tabla `config` (una fila) en Supabase, leerla en `loadProducts()` y escribirla en `saveConfig()`. |
| 10 | Detalles menores | Bajo | `SF Pro Display` no existe en Google Fonts (404 silencioso); `state.config.qrBolivia` es código muerto (se usa `qrUrl`); el campo "Email alertas" del panel no se guarda; el **carrito no persiste** al recargar; el panel admin **no lista productos inactivos** (reusa el catálogo ya filtrado por `active = true`); sin favicon ni meta description/OG. |

---

## 8. Mejoras recomendadas (orden sugerido)

1. **Seguridad del admin** (#1) — es lo más urgente antes de exponer el sitio.
2. **Trigger de stock + quitar UPDATE del cliente** (#2).
3. **Tabla `config` en Supabase** (#9) — sin esto el checkout real no muestra QR/alias.
4. **Bucket privado con URLs firmadas** (#4).
5. **Validación de total en backend** (#3).
6. **Mover imágenes fuera del HTML** (#8).
7. **Edge Function para el chat IA** (#5) — opcional.
8. **Compilar Tailwind** (#7) — opcional.

---

## 9. Resumen de "qué tocar" para poner esto en línea

| Necesitas | Dónde |
|---|---|
| Proyecto Supabase con tablas `products`, `orders`, bucket `order-proofs`, RLS y Auth Email | Dashboard de Supabase + el SQL de §5 |
| Usuario(s) admin creados y signups desactivados | Supabase → Authentication |
| `SUPABASE_URL` y `SUPABASE_ANON_KEY` reales en `index.html` | Líneas 776–777 |
| Hosting estático (Netlify / Cloudflare Pages / Vercel / GitHub Pages) | §5 Paso 3 |
| Dominio publicado registrado en Supabase Auth (Site URL + Redirect URLs) | Supabase → Authentication → URL Configuration |
| Tasa de cambio, QR Bolivia y datos de MercadoPago | Panel admin → Configuración (hoy queda en `localStorage`) |
