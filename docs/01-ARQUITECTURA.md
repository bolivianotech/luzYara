# 01 · Arquitectura

## Vista general

```
                 ┌──────────────────────── Hosting estático (Cloudflare Pages / Netlify) ───────┐
 Cliente final ─►│ index.html  (tienda)                                                          │
 Dueño tienda ──►│ admin.html  (backoffice)          js/config.js → qué Supabase y qué dominios  │
                 └───────────────┬───────────────────────────────────────────────────────────────┘
                                 │ supabase-js (clave anon, pública)
                 ┌───────────────▼───────────── Supabase ─────────────────────────────────────────┐
                 │ Postgres + RLS: tenants, categories, products, variants, orders, admins         │
                 │ Auth: login por enlace mágico (solo usuarios invitados)                          │
                 │ Storage: bucket product-images/<tenant_id>/<product_id>/<foto>.jpg              │
                 └─────────────────────────────────────────────────────────────────────────────────┘
 Checkout ──► https://wa.me/<número de la tienda>?text=<pedido>  ──► WhatsApp del dueño
```

No hay servidor propio: el navegador habla directo con Supabase y la **seguridad la imponen las políticas
RLS** de la base de datos (un usuario solo puede tocar las filas de la tienda que administra).

## Multitenant: cómo se decide qué tienda mostrar

`resolveTenantSlug()` en `js/core.js`, en este orden:

1. `?tienda=<slug>` en la dirección → `tutienda.pages.dev/?tienda=prendasmichell`
2. Dominio propio configurado en `js/config.js` → `domains: { 'luzyara.com.ar': 'luzyara' }`
3. La última tienda visitada en esa pestaña
4. `defaultTenant` de `js/config.js`

Un solo despliegue sirve a todas las tiendas. Cada tienda nueva = **una fila en `tenants`** (sin tocar código),
más opcionalmente un dominio.

## Modelo de datos

```
tenants ──< categories ──< products ──< variants (talle + stock)
   │                                         ▲
   ├──< orders (items: variant_id, units...) ┘  (venta cerrada descuenta stock)
   └──< tenant_admins (email)          platform_admins (email)  ← nosotros
```

| Tabla | Clave | Notas |
|---|---|---|
| `tenants` | `slug` único | moneda, país, `sizes` (jsonb), `packs` (jsonb), `brand` (jsonb), `whatsapp_number` |
| `categories` | `tenant_id` | nombre, emoji, orden, visible |
| `products` | `tenant_id` | precio **por unidad**, foto, visible |
| `variants` | `(product_id, size)` único | stock por talle |
| `orders` | `(tenant_id, ref)` único | snapshot de ítems y totales; estado `nuevo → contactado → confirmado / cancelado` |

### Formas de venta por mayor (`tenants.packs`)

```json
[{ "key": "curva", "label": "Curva", "plural": "Curvas", "units": 5, "discount_pct": 10 }]
[{ "key": "media-docena", "label": "Media docena", "plural": "Medias docenas", "units": 6, "discount_pct": 5 },
 { "key": "docena", "label": "Docena", "plural": "Docenas", "units": 12, "discount_pct": 10 }]
```

## Motor de precios (`Pricing` en `js/core.js`)

- Línea por unidad: `precio × cantidad`.
- Línea por pack: `precio × units × cantidad_de_packs − discount_pct %`.
- Regla actual: el pack es del **mismo producto y talle**.
- Todo (tienda, carrito, WhatsApp, backoffice) usa `Pricing.line()` / `Pricing.cartTotals()`. Para la futura
  regla "5 prendas cualesquiera con −5 % por prenda" se cambia solo ese objeto.

## Capa de datos (`js/data.js`)

Misma interfaz con dos implementaciones:

| | `DemoBackend` | `SupabaseBackend` |
|---|---|---|
| Cuándo | `js/config.js` sin configurar | con URL y clave de Supabase |
| Datos | `localStorage` del navegador, por tienda | Postgres |
| Fotos | se guardan achicadas dentro del navegador | Storage `product-images` |
| Login | no hay | enlace mágico por correo |

## Seguridad

| Quién | Puede |
|---|---|
| Público (anon) | leer tiendas, categorías y productos **activos**; **crear** pedidos (no leerlos) |
| Admin de tienda (`tenant_admins`) | todo sobre **su** tienda: catálogo, fotos, pedidos, configuración |
| Admin de plataforma (`platform_admins`) | todo sobre todas las tiendas; crear/borrar tiendas |

- El login usa `shouldCreateUser: false`: solo entran usuarios invitados desde Supabase.
- "Venta cerrada" usa la función `confirm_order` (una transacción: cambia estado + descuenta stock).
- Los montos del pedido los calcula el navegador → son **referencia**; el precio final se confirma por WhatsApp.
- Las fotos se suben a `product-images/<tenant_id>/...`; la política de Storage verifica que el usuario administre
  ese `tenant_id`.
- La clave `anon` es pública por diseño. **Nunca** poner la `service_role` en el código.
