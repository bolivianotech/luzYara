/**
 * mp-create-preference
 * --------------------------------------------------------------------------
 * Crea una preferencia de pago de MercadoPago (Checkout Pro) para el carrito.
 *
 * La llama el navegador. Recalcula el total desde la tabla `products`
 * (nunca confía en el monto que manda el cliente), crea el pedido en estado
 * `pending` y devuelve el `init_point` (URL del checkout de MercadoPago).
 *
 * DESPLIEGUE (Dashboard → Edge Functions → Deploy a new function):
 *   Nombre EXACTO:  mp-create-preference
 *   Verify JWT:     ACTIVADO  (lo llama el navegador con la anon key)
 *
 * SECRETS (Dashboard → Project Settings → Edge Functions → Add new secret):
 *   MP_ACCESS_TOKEN = TEST-xxxxxxxxxxxx   ← Access Token de PRUEBA de tu app MercadoPago
 *
 *   SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY ya existen automáticamente.
 * --------------------------------------------------------------------------
 */

const MP_ACCESS_TOKEN = Deno.env.get("MP_ACCESS_TOKEN")!;
const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_UNITS = 5;        // límite de unidades por compra en Argentina
const BOB_TO_ARS = 200;     // fallback si un producto no tiene price_ars cargado

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  try {
    const { items, customer, origin } = await req.json();

    if (!Array.isArray(items) || items.length === 0) {
      return json({ error: "El carrito está vacío" }, 400);
    }
    if (!customer?.name || !customer?.email || !customer?.phone || !customer?.address) {
      return json({ error: "Faltan datos del cliente" }, 400);
    }

    // 1) Precios REALES desde la base de datos
    const idList = items.map((i: { id: string }) => `"${i.id}"`).join(",");
    const products: Array<{
      id: string; name: string; price_ars: number | null;
      price_bob: number; stock: number; active: boolean;
    }> = await sbGet(
      `products?id=in.(${idList})&select=id,name,price_ars,price_bob,stock,active`,
    );

    const line: Array<{ id: string; title: string; quantity: number; unit_price: number; currency_id: string }> = [];
    let subtotal = 0;
    let units = 0;

    for (const it of items) {
      const p = products.find((x) => x.id === it.id);
      if (!p || !p.active) return json({ error: "Un producto ya no está disponible" }, 409);

      const qty = Math.max(1, Math.floor(Number(it.qty) || 1));
      if (qty > p.stock) return json({ error: `Sin stock suficiente: ${p.name}` }, 409);

      const unit = Math.round(Number(p.price_ars ?? Number(p.price_bob) * BOB_TO_ARS));
      if (!unit || unit < 1) return json({ error: `Producto sin precio en ARS: ${p.name}` }, 409);

      units += qty;
      subtotal += unit * qty;
      line.push({ id: String(p.id), title: p.name, quantity: qty, unit_price: unit, currency_id: "ARS" });
    }

    if (units > MAX_UNITS) return json({ error: `Máximo ${MAX_UNITS} unidades por compra` }, 400);

    // 2) Crear el pedido (pending)
    const order = await sbInsert("orders", {
      customer_name: customer.name,
      customer_email: customer.email,
      customer_phone: customer.phone,
      customer_address: customer.address,
      items: line,
      subtotal,
      currency: "ARS",
      country: "AR",
      payment_method: "mercadopago",
      payment_status: "pending",
    });

    // 3) Crear la preferencia en MercadoPago
    const base = (typeof origin === "string" && /^https?:\/\//.test(origin))
      ? origin.replace(/\/+$/, "")
      : "";

    const prefBody: Record<string, unknown> = {
      items: line.map((l) => ({
        id: l.id, title: l.title, quantity: l.quantity,
        unit_price: l.unit_price, currency_id: "ARS",
      })),
      payer: { name: customer.name, email: customer.email },
      external_reference: order.id,
      notification_url: `${SB_URL}/functions/v1/mp-webhook`,
      statement_descriptor: "PIJAMAKIDS",
      metadata: { order_id: order.id },
    };
    if (base) {
      prefBody.back_urls = {
        success: `${base}/?mp=success&order=${order.id}`,
        pending: `${base}/?mp=pending&order=${order.id}`,
        failure: `${base}/?mp=failure&order=${order.id}`,
      };
      prefBody.auto_return = "approved";
    }

    const mpRes = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${MP_ACCESS_TOKEN}`,
      },
      body: JSON.stringify(prefBody),
    });
    const mp = await mpRes.json();

    if (!mpRes.ok) {
      console.error("MercadoPago rechazó la preferencia:", JSON.stringify(mp));
      await sbPatch("orders", `id=eq.${order.id}`, {
        payment_status: "rejected",
        mp_status_detail: "preference_error",
      });
      return json({ error: mp.message || "MercadoPago rechazó la preferencia" }, 502);
    }

    await sbPatch("orders", `id=eq.${order.id}`, { mp_preference_id: mp.id });

    return json({
      orderId: order.id,
      preferenceId: mp.id,
      init_point: mp.init_point || mp.sandbox_init_point,
      subtotal,
      currency: "ARS",
      units,
    });
  } catch (e) {
    console.error(e);
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});

// ---------- helpers ----------
function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

async function sbGet(query: string) {
  const r = await fetch(`${SB_URL}/rest/v1/${query}`, {
    headers: { "apikey": SB_KEY, "Authorization": `Bearer ${SB_KEY}` },
  });
  if (!r.ok) throw new Error(`SB GET ${query} → ${await r.text()}`);
  return r.json();
}

async function sbInsert(table: string, row: unknown) {
  const r = await fetch(`${SB_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      "apikey": SB_KEY,
      "Authorization": `Bearer ${SB_KEY}`,
      "Content-Type": "application/json",
      "Prefer": "return=representation",
    },
    body: JSON.stringify(row),
  });
  if (!r.ok) throw new Error(`SB INSERT ${table} → ${await r.text()}`);
  return (await r.json())[0];
}

async function sbPatch(table: string, query: string, patch: unknown) {
  const r = await fetch(`${SB_URL}/rest/v1/${table}?${query}`, {
    method: "PATCH",
    headers: {
      "apikey": SB_KEY,
      "Authorization": `Bearer ${SB_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(patch),
  });
  if (!r.ok) throw new Error(`SB PATCH ${table} → ${await r.text()}`);
}
