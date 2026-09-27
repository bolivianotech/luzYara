# 03 · Manual del backoffice (para el dueño de la tienda)

Dirección: `https://<tu-sitio>/admin.html?tienda=<tu-tienda>` (o `/admin.html` en tu dominio propio).
Funciona igual en la computadora y en el celular.

## Entrar

1. Escribí tu correo → **Enviar enlace de acceso**.
2. Abrí el mail que llega y tocá el enlace **desde el mismo navegador** donde lo pediste.
3. Para salir: **Salir** (arriba a la derecha).

Arriba ves 4 números: **prendas en stock**, **talles sin stock**, **talles con stock bajo** y **pedidos nuevos**.

## 📊 Inventario — cuántas prendas hay por categoría y talle

- **Tabla de resumen**: por cada categoría, cuántos productos, cuántas prendas y cuántos talles están
  sin stock o con stock bajo.
- **Debajo, una tabla por categoría**: cada fila es un producto y cada columna un talle.
  - Escribí la cantidad y apretá **Tab** (o tocá afuera): se guarda sola y aparece ✓.
  - Colores: 🔴 sin stock · 🟠 stock bajo · blanco normal.
  - `—` significa que ese producto no se vende en ese talle (se habilita desde **Productos → Editar**).
- Filtrá por categoría con los botones o buscá por nombre.

> El stock baja solo cuando **registrás el pago** de un pedido.

## 👕 Productos — altas, fotos y talles

**Nuevo producto**: botón **+ Nuevo producto**.
1. **Foto**: tocá el recuadro (en el celular te deja sacar una foto o elegir de la galería) o arrastrá el archivo.
   La foto se achica sola; conviene que sea vertical (3:4) y con buena luz.
2. **Nombre**, **Categoría**, **Precio por unidad**. Abajo del precio ves automáticamente el precio por curva/docena.
3. **Talles y stock**: marcá los talles que vendés y cuántas prendas tenés de cada uno.
4. **Visible en la tienda**: desmarcalo para ocultarlo sin borrarlo.
5. **Guardar producto**.

**Cambiar solo la foto**: en la lista de productos tocá la foto (dice *📷 Cambiar foto*) y elegí la nueva.
La anterior se borra sola.

**Editar / Ocultar / Eliminar**: botones de cada producto. *Eliminar* pide tocar dos veces para confirmar.

## 🗂️ Categorías

- **Nueva categoría**: emoji + nombre → **Agregar**.
- Cambiá emoji, nombre, **orden** (1 aparece primero) o **Visible** → **Guardar** en esa fila.
- Solo se puede eliminar una categoría vacía (sin productos).

## 📋 Pedidos — del WhatsApp al pago

Cada vez que un cliente toca *Enviar pedido por WhatsApp* te llega el mensaje **y** queda el pedido acá,
en **Pendientes de pago**.

| Botón | Qué hace |
|---|---|
| 💬 **Contactar** | Abre WhatsApp con el cliente: confirma disponibilidad y le manda tus **datos para el pago**. Marca el pedido como *Contactado*. |
| 🔔 **Recordar pago** | Mensaje recordando el pedido y los datos para pagar. |
| 💰 **Registrar pago** | Cuando llega el comprobante: se cargan sus datos, el pedido pasa a **Pagado** y **baja el stock**. |
| **Cancelar** | El cliente no siguió. No toca el stock. |

### Registrar el pago (con lectura automática del comprobante)

1. El cliente te manda la captura del comprobante por WhatsApp. Guardala en el celular o la PC.
2. En el pedido tocá **💰 Registrar pago** → **Elegir comprobante** → elegí la captura.
3. En unos segundos se completan solos (en verde): **fecha y hora**, **nº de comprobante**, **banco**,
   **nombre** y **cuenta** de quien pagó, y **monto**. La primera vez tarda un poco más (descarga el lector).
4. **Revisá** los datos y corregí lo que haga falta. Si el monto no coincide con el pedido, aparece un aviso.
5. **Guardar pago y cerrar venta**.

- La imagen **no se guarda** en ningún lado: solo quedan los datos.
- Un mismo comprobante no se puede usar en dos pedidos (evita pagos "reciclados").
- Pago en efectivo: elegí *Efectivo*; el nº de recibo es opcional.

### ¿Y si el cliente nunca paga?

Pasadas las horas configuradas (48 h por defecto) el pedido pasa solo a **⌛ Vencido**. No descuenta stock.
Si el cliente paga después, igual podés **Registrar pago** sobre el pedido vencido.

Filtrá por **Pendientes de pago / Pagados / Vencidos / Cancelados / Todos** y tocá **🔄 Actualizar** para ver pedidos recientes.

## ⚙️ Configuración

| Sección | Qué cambiás |
|---|---|
| 🏬 Tienda | Nombre, emoji y textos del banner principal. |
| 💬 WhatsApp | El número que recibe los pedidos. Números de otro país con `+` (ej. `+1 914 222 3263`). **Probar enlace** abre WhatsApp para verificarlo. |
| 💱 Moneda | ARS, BOB, CLP, PEN, UYU, PYG, MXN o USD. Cambia cómo se muestran los precios (no convierte montos: actualizá los precios a mano). |
| 📦 Venta por mayor | Formas de venta con su cantidad y % de descuento. Botones rápidos: *Curva x5 (Argentina)*, *Media docena + Docena (Bolivia)*, *Solo por unidad*. |
| 📏 Talles y stock | Lista de talles en orden (ej. `2, 4, 6, 8` o `S, M, L, XL`) y desde cuántas unidades avisar "stock bajo". |
| 💳 Cobro y vencimiento | **Datos para el pago** (alias, CBU, cuenta, QR) que se envían al cliente, y en cuántas horas vence un pedido sin pago (0 = nunca). |

Siempre terminá con **Guardar configuración**. Los cambios se ven en la tienda al recargarla.
