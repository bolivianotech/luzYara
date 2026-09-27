# Changelog

Formato: [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) · Versionado: [SemVer](https://semver.org/lang/es/)
(`MAYOR.MENOR.PARCHE`: MAYOR = cambio que rompe compatibilidad, MENOR = funcionalidad nueva, PARCHE = corrección).

## [2.0.0] — 2026-09-27

Plataforma **multitenant**: el mismo código atiende varias tiendas.

### Agregado
- Tiendas (`tenants`) con su propia moneda, país, talles, formas de venta por mayor, banner y WhatsApp.
- Formas de venta por mayor configurables: curva (AR), media docena y docena (BO), o cualquier otra.
- Productos con **talles** (variantes) y stock por talle.
- Backoffice separado (`admin.html`) con: inventario por categoría y talle editable en línea,
  gestión de productos con **subida y reemplazo de fotos** (Supabase Storage), categorías, pedidos y configuración.
- Número de WhatsApp de LuzYara: **+1 914 222 3263**, editable desde el backoffice.
- Administradores por tienda (`tenant_admins`) y de plataforma (`platform_admins`); RLS por tienda.
- Botón flotante de WhatsApp para consultas.
- Tienda demo `prendasmichell` (BOB, docenas) para mostrar la flexibilidad.
- Documentación completa de despliegue desde Windows/PowerShell, manual del backoffice, alta de clientes,
  versionado y roadmap SaaS.

### Cambiado
- El código se separó en archivos (`css/`, `js/`) y las fotos demo salieron del HTML a `assets/`
  (el `index.html` pasó de 3 MB a unos pocos KB).
- Nuevo esquema de base de datos (no compatible con v1: ver docs/02-DESPLIEGUE.md).

### Quitado
- Asistente "IA" simulado (se reemplazó por el botón de WhatsApp).
- `_redirects` (ya no hace falta: son páginas estáticas).

## [1.0.0] — 2026-09-27

- Tienda en ARS con venta por unidad o por curva (5 u.) con descuento.
- Checkout por mensaje dinámico de WhatsApp (`wa.me`).
- Panel admin dentro del mismo HTML (pedidos y configuración).
- Integración de MercadoPago archivada en `docs/archivo/mercadopago`.
