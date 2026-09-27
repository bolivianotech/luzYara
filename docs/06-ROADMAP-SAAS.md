# 06 · Roadmap: de solución a SaaS

| Versión | Estado | Qué es |
|---|---|---|
| **v1** | ✅ 2026-09-27 | PoC de una tienda (LuzYara): ARS, curva de 5, checkout por WhatsApp. |
| **v2** | ✅ 2026-09-27 | **Multitenant configurable**: varias tiendas en la misma base; moneda, formas de venta, talles y WhatsApp por tienda; backoffice con inventario y fotos. Las tiendas nuevas se dan de alta por SQL. |
| **v2.1** | ✅ 2026-09-27 | Cierre del ciclo de venta: registrar pago con datos del comprobante (OCR sin guardar imagen), vencimiento de pedidos, recordatorios; consola de superadmin; aislamiento por tienda también en demo. |
| **v2.x** | 🔜 | Endurecimiento para operar con clientes reales (ver abajo). |
| **v3** | 📋 | **Cobro en línea y finanzas**: QR de cobro por tienda, liquidaciones y reportes diarios/semanales/mensuales. |
| **v4** | 📋 | **SaaS**: registro autoservicio, planes y cobro de suscripción. |

## v2.x — operar en serio (mejoras incrementales)

- [ ] SMTP propio para los enlaces de acceso (Resend / Brevo).
- [ ] Dominio propio para LuzYara.
- [ ] Compilar Tailwind en vez de usar el CDN (quita el aviso de consola y acelera la carga).
- [ ] Galería de varias fotos por producto.
- [ ] Precio distinto por talle (opcional por variante).
- [ ] Combos flexibles: "5 prendas cualesquiera, −5 % por prenda" (solo cambia `Pricing` en `js/core.js`
      y un tipo nuevo en `tenants.packs`).
- [ ] Exportar pedidos e inventario a Excel/CSV.
- [ ] Función en el servidor que recalcule el total del pedido (evita montos manipulados).
- [ ] Imagen para compartir en redes (Open Graph) por tienda.

## v3 — Cobro en línea, liquidaciones y reportes

- **QR de cobro en línea por tienda**: cada tienda conecta su medio (Mercado Pago en AR; QR interoperable / pasarela
  bancaria en BO). El pago confirmado por la pasarela (webhook) registra el pago solo, sin comprobante manual.
- **Liquidaciones**: qué se cobró por tienda, comisiones de la plataforma y del medio de pago, qué se le transfiere
  al comercio y cuándo; estados *pendiente / liquidado*.
- **Reportes** diarios, semanales y mensuales: ventas, unidades por producto/talle/categoría, ticket promedio,
  pedidos vencidos vs. pagados, tiempo hasta el pago. Exportables a Excel/CSV.
- Base ya lista en v2.1: cada pedido pagado guarda fecha, medio, banco, referencia y monto.

## Consola de plataforma — lo que falta (v3)

Ya existe `plataforma.html` (v2.1: alta de tiendas, admins, pausar, métricas del mes). Falta:

- Colores de marca por tienda (hoy es rosa/naranja fijo) y logo propio.
- Subdominios automáticos: `luzyara.<nuestro-dominio>` (dominio comodín en Cloudflare).
- Edge Function de Supabase para invitar usuarios desde la consola (requiere `service_role`, del lado del servidor).
- Cambiar el nombre del repositorio a uno de plataforma (ej. `tienda-whatsapp`), GitHub redirige el viejo.

## v4 — SaaS

- Registro autoservicio: el comerciante crea su tienda en 5 minutos (asistente de configuración).
- Planes (ej. Gratis: 20 productos · Pro: ilimitado + dominio propio) y **cobro de suscripción**
  (MercadoPago Suscripciones en AR, Stripe internacional; en Bolivia, QR/transferencia con activación manual).
- Límites por plan aplicados en la base (RLS / triggers).
- Cobro online opcional por tienda (retomar `docs/archivo/mercadopago`), además de WhatsApp.
- WhatsApp Business API para notificar pedidos automáticamente.
- Términos, privacidad y facturación.

## Decisiones que conviene tomar antes de v3

1. **Marca de la plataforma** (nombre, dominio).
2. **Cómo se define "curva"** con cada cliente: hoy es N unidades del mismo producto y talle; en el mayorismo
   argentino muchas veces es un surtido de talles del mismo modelo.
3. **Modelo de precio** del SaaS (mensual fijo, por pedido, por producto).
