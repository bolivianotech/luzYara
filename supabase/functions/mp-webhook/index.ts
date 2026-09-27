/**
 * mp-webhook
 * --------------------------------------------------------------------------
 * Recibe las notificaciones de MercadoPago, valida la firma (x-signature),
 * consulta el pago real por API y actualiza el pedido. Descuenta stock
 * una sola vez, cuando el pago pasa a aprobado.
 *
 * DESPLIEGUE (Dashboard → Edge Functions → Deploy a new function):
 *   Nombre EXACTO:  mp-webhook
 *   Verify JWT:     DESACTIVADO  ← IMPORTANTE. MercadoPago no envía el JWT de Supabase.
 *
 * SECRETS (Dashboard → Project Settings → Edge Functions):
 *   MP_ACCESS_TOKEN   = TEST-xxxxxxxx   (el mismo de mp-create-preference)
 *   MP_WEBHOOK_SECRET = xxxxxxxx        (Panel MP → tu app → Webhooks → "Clave secreta")
 * --------------------------------------------------------------------------
 */

const MP_ACCESS_TOKEN = Deno.env.get("MP_ACCESS_TOKEN")!;
const MP_WEBHOOK_SECRET = Deno.env.get("MP_WEBHOOK_SECRET") ?? "";
const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const STATUS_MAP: Record<string, string> = {
  approved: "confirmed",
  authorized: "confirmed",
  pending: "pending",
  in_process: "pending",
  in_mediation: "pending",
  rejected: "rejected",
  cancelled: "rejected",
  refunded: "rejected",
  charged_back: "rejected",
};

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const bodyText = await req.text();
    let body: Record<string, unknown> = {};
    try {
      body = bodyText ? JSON.parse(bodyText) : {};
    } catch { /* body vacío o no-JSON: MP a veces solo manda query params */ }

    const type = url.searchParams.get("type") ||
      url.searchParams.get("topic") ||
      (body.type as string) ||
      (typeof body.action === "string" ? body.action.split(".")[0] : "");

    const dataId = url.searchParams.get("data.id") ||
      url.searchParams.get("id") ||
      // deno-lint-ignore no-explicit-any
      ((body as any)?.data?.id ?? "");

    // --- validar la firma ---
    if (MP_WEBHOOK_SECRET) {
      const ok = await validSignature(req, String(dataId), MP_WEBHOOK_SECRET);
      if (!ok) {
        console.warn("x-signature inválida — se ignora la notificación");
        return new Response("bad signature", { status: 401 });
      }
    }

    if (!String(type).includes("payment") || !dataId) {
      return new Response("ignored", { status: 200 });
    }

    // --- consultar el pago real en MercadoPago ---
    const payRes = await fetch(`https://api.mercadopago.com/v1/payments/${dataId}`, {
      headers: { "Authorization": `Bearer ${MP_ACCESS_TOKEN}` },
    });
    if (!payRes.ok) {
      console.error("No se pudo consultar el pago:", await payRes.text());
      return new Response("ok", { status: 200 }); // 200 → MP no reintenta en bucle
    }
    const pay = await payRes.json();
    const orderId = pay.external_reference || pay?.metadata?.order_id;
    if (!orderId) return new Response("no external_reference", { status: 200 });

    const rows = await sbGet(`orders?id=eq.${orderId}&select=id,items,payment_status`);
    const order = rows[0];
    if (!order) return new Response("order not found", { status: 200 });

    const newStatus = STATUS_MAP[pay.status as string] ?? "pending";

    await sbPatch("orders", `id=eq.${orderId}`, {
      payment_status: newStatus,
      mp_payment_id: String(pay.id),
      mp_status: pay.status,
      mp_status_detail: pay.status_detail,
    });

    // descontar stock una sola vez
    if (newStatus === "confirmed" && order.payment_status !== "confirmed") {
      for (const it of order.items ?? []) {
        const pr = await sbGet(`products?id=eq.${it.id}&select=stock`);
        if (pr[0]) {
          const left = Math.max(0, Number(pr[0].stock) - Number(it.quantity ?? it.qty ?? 0));
          await sbPatch("products", `id=eq.${it.id}`, { stock: left });
        }
      }
    }

    return new Response("ok", { status: 200 });
  } catch (e) {
    console.error(e);
    return new Response("ok", { status: 200 });
  }
});

/**
 * Firma v2 de MercadoPago.
 *   header  x-signature:  "ts=1704908010,v1=abcd1234..."
 *   header  x-request-id: "<uuid>"
 *   manifest:  id:<data.id>;request-id:<x-request-id>;ts:<ts>;
 *   v1 == HMAC_SHA256(manifest, MP_WEBHOOK_SECRET)  en hex
 */
async function validSignature(req: Request, dataId: string, secret: string): Promise<boolean> {
  const header = req.headers.get("x-signature") ?? "";
  const requestId = req.headers.get("x-request-id") ?? "";

  const parts: Record<string, string> = {};
  for (const chunk of header.split(",")) {
    const [k, v] = chunk.split("=");
    if (k && v) parts[k.trim()] = v.trim();
  }
  const ts = parts["ts"];
  const v1 = parts["v1"];
  if (!ts || !v1) return false;

  const id = /^[0-9]+$/.test(dataId) ? dataId : dataId.toLowerCase();
  const manifest = `id:${id};request-id:${requestId};ts:${ts};`;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(manifest));
  const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");

  if (hex.length !== v1.length) return false;
  let diff = 0;
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ v1.charCodeAt(i);
  return diff === 0;
}

// ---------- helpers ----------
async function sbGet(query: string) {
  const r = await fetch(`${SB_URL}/rest/v1/${query}`, {
    headers: { "apikey": SB_KEY, "Authorization": `Bearer ${SB_KEY}` },
  });
  if (!r.ok) throw new Error(`SB GET ${query} → ${await r.text()}`);
  return r.json();
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
