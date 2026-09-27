# Tienda WhatsApp · plataforma multitienda (LuzYara, PrendasMichell, ...)

Tienda online + backoffice para vender ropa **por unidad o por mayor** (curva, media docena, docena)
y **cerrar la venta por WhatsApp**. Un mismo código sirve a varias tiendas (multitenant): cada una tiene su
catálogo, moneda, formas de venta, número de WhatsApp y administradores.

| | |
|---|---|
| **Versión actual** | `v2.0.0` — ver [CHANGELOG.md](CHANGELOG.md) |
| **Primera tienda** | LuzYara (Argentina · ARS · curva de 5) |
| **Stack** | HTML + JavaScript sin compilación · Supabase (Postgres, Auth, Storage) · hosting estático |
| **Costo base** | $0 (planes gratuitos de Supabase y Cloudflare Pages / Netlify) |

## Qué hace

**Tienda (`index.html`)**
- Catálogo con categorías, buscador, fotos, **talles** y stock por talle.
- Precio por unidad + precios por mayor (ej. *Curva x5 −10 %*, *Docena x12 −10 %*).
- Carrito con descuento mayorista y sugerencia "pasar a curva/docena y ahorrar".
- Checkout: el cliente deja sus datos y se abre **WhatsApp** con el pedido armado hacia el número de la tienda.

**Backoffice (`admin.html`)**
- 📊 **Inventario**: prendas disponibles por categoría y por talle, editable en el momento.
- 👕 **Productos**: alta/edición, **subir o reemplazar la foto** (desde el celular o la PC), talles y stock.
- 🗂️ **Categorías**: crear, ordenar, ocultar.
- 📋 **Pedidos**: contactar al cliente por WhatsApp, marcar contactado, **venta cerrada** (descuenta stock), cancelar.
- ⚙️ **Configuración**: nombre y banner, número de WhatsApp, moneda, talles, formas de venta por mayor.

## Probarlo en 1 minuto (modo demo, sin instalar nada)

1. Descargá el repo (o `git clone`) y abrí **`index.html`** con doble clic.
2. Otra tienda demo con otra moneda y docenas: agregá `?tienda=prendasmichell` a la dirección.
3. Backoffice: **`admin.html`** (en demo entra directo; los cambios quedan solo en ese navegador).

## Documentación

| Documento | Para qué |
|---|---|
| [docs/01-ARQUITECTURA.md](docs/01-ARQUITECTURA.md) | Cómo está armado: multitenant, datos, precios, seguridad |
| [docs/02-DESPLIEGUE.md](docs/02-DESPLIEGUE.md) | **Paso a paso desde Windows 11 + PowerShell** para ponerlo en internet |
| [docs/03-MANUAL-BACKOFFICE.md](docs/03-MANUAL-BACKOFFICE.md) | Manual para el dueño de la tienda |
| [docs/04-NUEVO-CLIENTE.md](docs/04-NUEVO-CLIENTE.md) | Dar de alta otra tienda (ej. PrendasMichell, Bolivia, docenas) |
| [docs/05-VERSIONADO-GIT.md](docs/05-VERSIONADO-GIT.md) | Cómo trabajar con Git/GitHub: ramas, versiones, etiquetas |
| [docs/06-ROADMAP-SAAS.md](docs/06-ROADMAP-SAAS.md) | Camino de v2 a SaaS (v3 consola de plataforma, v4 SaaS con cobro) |

## Estructura

```
index.html              Tienda
admin.html              Backoffice
css/app.css             Estilos compartidos
js/config.js            ← ÚNICO archivo a editar al desplegar (Supabase + dominios)
js/core.js              Tienda actual, monedas, teléfonos, motor de precios
js/data.js              Acceso a datos: Supabase (producción) o demo (navegador)
js/store.js             Lógica de la tienda
js/admin.js             Lógica del backoffice
js/demo-data.js         Tiendas de ejemplo para el modo demo
assets/demo/            Fotos de ejemplo
supabase/schema.sql     Base de datos multitenant (tablas, seguridad, fotos)
supabase/seed-luzyara.sql  Datos iniciales de LuzYara
supabase/nuevo-cliente.sql Plantilla para dar de alta otra tienda
docs/                   Documentación (docs/archivo = versiones anteriores)
```
