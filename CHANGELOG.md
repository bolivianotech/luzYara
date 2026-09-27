# Changelog

Formato: [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) · Versionado: [SemVer](https://semver.org/lang/es/)
(`MAYOR.MENOR.PARCHE`: MAYOR = cambio que rompe compatibilidad, MENOR = funcionalidad nueva, PARCHE = corrección).

## [2.1.1] — 2026-09-27

### Agregado
- Catálogo de LuzYara: **Pijama Jirafa** ($ 34.500, talles S/M/L) y **Pijama Dino Verde** ($ 35.500, talles S/M/L),
  con sus categorías 🦒 Jirafa y 🦖 Dinosaurio (demo y `supabase/seed-luzyara.sql`).
- `assets/demo/CREDITOS.md`: origen y licencia de las fotos de ejemplo (Pexels).

## [2.1.0] — 2026-09-27

Cierre del ciclo de compra/venta y separación real por tienda.

### Agregado
- **Registrar pago** en cada pedido: medio, fecha y hora, nº de comprobante/transacción, banco emisor,
  nombre y nº de cuenta de quien paga, monto. Al guardar, el pedido pasa a **Pagado** y baja el stock.
- **Lector de comprobantes (OCR)** con Tesseract.js, 100 % en el navegador: la imagen no se sube ni se guarda,
  solo los datos confirmados por el administrador.
- Un mismo comprobante no puede cerrar dos pedidos de la misma tienda.
- Aviso si el monto pagado no coincide con el total del pedido.
- **Vencimiento** de pedidos sin pago (configurable por tienda, 48 h por defecto); un pedido vencido todavía puede pagarse.
- **Recordar pago** por WhatsApp y **datos para el pago** configurables, que se envían al cliente y se muestran
  en la pantalla final del checkout junto con productos sugeridos.
- **Consola de plataforma** (`plataforma.html`) para el superadmin: todas las tiendas, métricas del mes,
  alta de tiendas sin SQL, administradores por tienda, pausar/activar.
- Modo demo con login simulado por tienda (cada dueña solo entra a la suya).

### Cambiado
- Estados del pedido: `nuevo → contactado → pagado`, más `vencido` y `cancelado` (`confirmado` pasa a `pagado`).
- "Venta cerrada" se reemplaza por "Registrar pago" (función `register_payment`, reemplaza a `confirm_order`).
- Se quitó el selector de tiendas del backoffice: el cambio de tienda es exclusivo del superadmin.

### Corregido
- La actualización del esquema desde v2.0 migra correctamente los pedidos `confirmado` a `pagado`.

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
