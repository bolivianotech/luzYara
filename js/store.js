// ============================================================
// TIENDA (index.html) — catálogo, carrito y checkout por WhatsApp
// ============================================================

const S = {
  tenant: null,
  categories: [],
  products: [],
  variantIndex: {},     // variantId → { product, variant }
  cart: [],             // [{ variantId, mode: 'unit' | pack.key, qty }]
  category: 'all',
  selected: {}          // productId → variantId (talle elegido en la tarjeta)
};

const cartKey = () => `cart_${S.tenant.slug}`;
const lookup = variantId => S.variantIndex[variantId] || null;
const fmt = n => money(S.tenant, n);
const packs = () => Pricing.packs(S.tenant);

// ------------------------------------------------------------
// INIT
// ------------------------------------------------------------
window.addEventListener('DOMContentLoaded', async () => {
  const slug = resolveTenantSlug();
  try {
    S.tenant = await Data.loadTenant(slug);
  } catch(e) {
    console.error(e);
  }
  if (!S.tenant || !S.tenant.active) return renderNotFound(slug);

  applyBranding(S.tenant);
  renderHero();
  await loadCatalog();
  S.cart = store.get(cartKey(), []).filter(i => lookup(i.variantId) && i.qty > 0);
  updateCartUI();
});

function renderNotFound(slug) {
  document.querySelector('main').innerHTML = `
    <div class="text-center py-24">
      <div style="font-size:64px;">🏬</div>
      <h1 style="font-size:24px; font-weight:900; margin-top:12px;">Tienda no encontrada</h1>
      <p style="color:var(--text-sec); font-weight:600;">No existe una tienda activa con el nombre "${esc(slug)}".</p>
    </div>`;
  $('cart-btn').style.display = 'none';
  $('wa-float').style.display = 'none';
}

function renderHero() {
  const t = S.tenant, b = t.brand || {};
  $('hero-emoji').textContent = b.emoji || '🛍️';
  $('hero-kicker').textContent = b.kicker || '';
  $('hero-title').textContent = b.title || t.name;
  $('hero-subtitle').textContent = b.subtitle || '';
  $('currency-chip').textContent = `${t.currency_code}`;
  $('admin-link').href = tenantLink('admin.html', t.slug);
  $('wa-float').href = whatsappUrl(t.whatsapp_number, `¡Hola ${t.name}! Tengo una consulta:`);
}

async function loadCatalog() {
  try {
    const { categories, products } = await Data.loadCatalog(S.tenant);
    S.categories = categories;
    S.products = products.filter(p => p.variants?.length);
  } catch(e) {
    console.error(e);
    showToast('No se pudo cargar el catálogo. Intentá de nuevo.', 'error');
  }
  S.variantIndex = {};
  for (const p of S.products) {
    p.variants.sort((a, b) => sizeOrder(a.size) - sizeOrder(b.size));
    for (const v of p.variants) S.variantIndex[v.id] = { product: p, variant: v };
  }
  renderCategories();
  applyFilters();
}

const sizeOrder = size => {
  const i = (S.tenant.sizes || []).indexOf(size);
  return i < 0 ? 999 : i;
};

// ------------------------------------------------------------
// STOCK
// ------------------------------------------------------------
function unitsInCart(variantId) {
  return S.cart.filter(i => sameId(i.variantId, variantId))
    .reduce((s, i) => s + i.qty * Pricing.unitsPer(S.tenant, i.mode), 0);
}
function availableFor(variantId) {
  const found = lookup(variantId);
  return found ? found.variant.stock - unitsInCart(variantId) : 0;
}
function selectedVariant(p) {
  const chosen = p.variants.find(v => sameId(v.id, S.selected[p.id]));
  return chosen || p.variants.find(v => v.stock > 0) || p.variants[0];
}
const productStock = p => p.variants.reduce((s, v) => s + v.stock, 0);

// ------------------------------------------------------------
// CATÁLOGO
// ------------------------------------------------------------
function renderCategories() {
  const used = new Set(S.products.map(p => String(p.category_id)));
  const cats = S.categories.filter(c => used.has(String(c.id)));
  $('categories-bar').innerHTML =
    `<button class="pill-tab ${S.category === 'all' ? 'active' : ''}" onclick="filterByCategory('all')">✨ Todos</button>` +
    cats.map(c => `<button class="pill-tab ${sameId(S.category, c.id) ? 'active' : ''}" onclick="filterByCategory('${c.id}')">${esc(c.emoji)} ${esc(c.name)}</button>`).join('');
}

function filterByCategory(id) {
  S.category = id;
  renderCategories();
  applyFilters();
}

function applyFilters() {
  const q = ($('search-input').value || '').toLowerCase();
  const catName = id => S.categories.find(c => sameId(c.id, id))?.name || '';
  const list = S.products.filter(p =>
    (S.category === 'all' || sameId(p.category_id, S.category)) &&
    (!q || [p.name, p.description, catName(p.category_id), ...p.variants.map(v => v.size)]
      .some(f => String(f || '').toLowerCase().includes(q))));
  renderProducts(list);
}

function renderProducts(list) {
  $('products-count').textContent = `${list.length} producto${list.length !== 1 ? 's' : ''}`;
  $('products-grid').innerHTML = list.length ? list.map(cardHtml).join('') : `
    <div class="col-span-full text-center py-16 text-gray-400">
      <div style="font-size:64px; margin-bottom:16px;">🔍</div>
      <p style="font-size:18px; font-weight:700;">Sin resultados</p>
    </div>`;
}

function packPriceLines(p) {
  return packs().map(pk => {
    const pct = Number(pk.discount_pct) || 0;
    return `<p style="font-size:11px; font-weight:800; color:#d6335a;">${esc(pk.label)} x${pk.units}: ${fmt(Pricing.packTotal(S.tenant, pk, p.price))}${pct ? ` (−${pct}%)` : ''}</p>`;
  }).join('');
}

function sizeChips(p, v, handler) {
  return p.variants.map(x => `
    <button class="size-chip ${sameId(x.id, v.id) ? 'active' : ''}" ${x.stock <= 0 ? 'disabled' : ''}
      onclick="event.stopPropagation(); ${handler}('${p.id}', '${x.id}')" title="Talle ${esc(x.size)}">${esc(x.size)}</button>`).join('');
}

function cardHtml(p) {
  const v = selectedVariant(p);
  const cat = S.categories.find(c => sameId(c.id, p.category_id));
  const total = productStock(p);
  const low = S.tenant.low_stock_threshold;
  const stockCls = v.stock <= 0 ? 'stock-out' : v.stock <= low ? 'stock-low' : 'stock-ok';
  return `
  <div class="product-card fade-in" id="card-${p.id}" onclick="showProductDetail('${p.id}')">
    <div class="product-img-wrap">
      <img src="${esc(p.image_url)}" alt="${esc(p.name)}" loading="lazy" onerror="this.style.minHeight='200px'">
      ${total <= 0 ? '<span class="badge badge-out">Sin stock</span>' : ''}
    </div>
    <div style="padding:12px;">
      <p style="font-size:11px; color:var(--text-sec); font-weight:700; text-transform:uppercase; letter-spacing:0.5px;">
        ${cat ? `${esc(cat.emoji)} ${esc(cat.name)}` : ''}
      </p>
      <p style="font-size:14px; font-weight:800; margin:2px 0 4px; line-height:1.2;">${esc(p.name)}</p>
      <div style="display:flex; align-items:baseline; gap:4px;">
        <span style="font-size:18px; font-weight:900; color:var(--accent);">${fmt(p.price)}</span>
        <span style="font-size:11px; font-weight:700; color:var(--text-sec);">c/u</span>
      </div>
      <div style="margin:2px 0 8px;">${packPriceLines(p)}</div>
      <div style="display:flex; gap:4px; flex-wrap:wrap; margin-bottom:8px;">${sizeChips(p, v, 'selectSize')}</div>
      <div style="display:flex; gap:6px; flex-wrap:wrap; align-items:center;">
        <button class="btn-add" onclick="event.stopPropagation(); addToCart('${v.id}', 'unit')" title="Agregar 1 unidad"
          ${v.stock <= 0 ? 'disabled' : ''}>+</button>
        ${packs().map(pk => `
          <button class="btn-pack" onclick="event.stopPropagation(); addToCart('${v.id}', '${pk.key}')"
            ${v.stock < pk.units ? 'disabled' : ''}>+ ${esc(pk.label)} x${pk.units}</button>`).join('')}
      </div>
      <div style="display:flex; align-items:center; gap:4px; margin-top:8px;">
        <span class="stock-dot ${stockCls}"></span>
        <span style="font-size:11px; font-weight:700; color:var(--text-sec);">
          Talle ${esc(v.size)}: ${v.stock <= 0 ? 'sin stock' : `${v.stock} disponibles`}
        </span>
      </div>
    </div>
  </div>`;
}

function selectSize(productId, variantId) {
  S.selected[productId] = variantId;
  const p = S.products.find(x => sameId(x.id, productId));
  const card = $(`card-${productId}`);
  if (p && card) card.outerHTML = cardHtml(p).replace('fade-in', '');
}

// ------------------------------------------------------------
// DETALLE DE PRODUCTO
// ------------------------------------------------------------
function showProductDetail(productId) {
  const p = S.products.find(x => sameId(x.id, productId));
  if (!p) return;
  const v = selectedVariant(p);
  const cat = S.categories.find(c => sameId(c.id, p.category_id));

  const packBoxes = packs().map(pk => {
    const total = Pricing.packTotal(S.tenant, pk, p.price);
    const saving = p.price * pk.units - total;
    return `
      <div style="background:#fff0f3; border-radius:16px; padding:14px;">
        <span class="mode-badge mode-pack">${esc(pk.label)} x${pk.units}</span>
        <div style="font-size:22px; font-weight:900; color:var(--accent); margin-top:6px;">${fmt(total)}</div>
        <div style="font-size:12px; color:#d6335a; font-weight:700;">${fmt(total / pk.units)} c/u${saving > 0 ? ` · ahorrás ${fmt(saving)}` : ''}</div>
      </div>`;
  }).join('');

  const packButtons = packs().map(pk => `
    <button onclick="addToCart('${v.id}', '${pk.key}'); closeModal('product-modal')"
      class="w-full py-4 rounded-2xl font-black text-white text-lg transition-all hover:opacity-90"
      style="background:${v.stock >= pk.units ? 'linear-gradient(135deg,#FF6B8A,#FF9F5B)' : '#d2d2d7'}"
      ${v.stock >= pk.units ? '' : 'disabled'}>
      + ${esc(pk.label)} de ${pk.units} · ${fmt(Pricing.packTotal(S.tenant, pk, p.price))}
    </button>`).join('');

  $('product-modal-content').innerHTML = `
    <div style="display:flex; gap:20px; flex-wrap:wrap;">
      <img src="${esc(p.image_url)}" alt="${esc(p.name)}" style="width:100%; max-width:280px; border-radius:20px; object-fit:cover; aspect-ratio:3/4; margin:auto;">
      <div style="flex:1; min-width:220px;">
        <span style="font-size:11px; font-weight:700; color:var(--text-sec); text-transform:uppercase;">${cat ? `${esc(cat.emoji)} ${esc(cat.name)}` : ''}</span>
        <h2 style="font-size:24px; font-weight:900; margin:8px 0 4px;">${esc(p.name)}</h2>
        <p style="color:var(--text-sec); font-size:14px; font-weight:600; margin-bottom:16px;">${esc(p.description)}</p>

        <p class="label">Talle</p>
        <div style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:6px;">${sizeChips(p, v, 'selectSizeInModal')}</div>
        <p style="font-size:12px; font-weight:700; color:var(--text-sec); margin-bottom:16px;">
          Talle ${esc(v.size)}: ${v.stock <= 0 ? 'sin stock' : `${v.stock} disponibles`}
        </p>

        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(140px, 1fr)); gap:10px; margin-bottom:16px;">
          <div style="background:#f5f5f7; border-radius:16px; padding:14px;">
            <span class="mode-badge mode-unit">Por unidad</span>
            <div style="font-size:22px; font-weight:900; margin-top:6px;">${fmt(p.price)}</div>
            <div style="font-size:12px; color:var(--text-sec); font-weight:700;">precio por prenda</div>
          </div>
          ${packBoxes}
        </div>

        <div style="display:grid; gap:10px;">
          <button onclick="addToCart('${v.id}', 'unit'); closeModal('product-modal')"
            class="w-full py-3 rounded-2xl font-black text-lg" style="background:#f5f5f7;"
            ${v.stock <= 0 ? 'disabled' : ''}>+ 1 unidad · ${fmt(p.price)}</button>
          ${packButtons}
        </div>
      </div>
    </div>`;
  showModal('product-modal');
}

function selectSizeInModal(productId, variantId) {
  selectSize(productId, variantId);
  showProductDetail(productId);
}

// ------------------------------------------------------------
// CARRITO
// ------------------------------------------------------------
function addToCart(variantId, mode = 'unit') {
  const found = lookup(variantId);
  if (!found) return;
  const { product, variant } = found;
  const need = Pricing.unitsPer(S.tenant, mode);
  if (!need) return;
  if (availableFor(variantId) < need) {
    return showToast(`No hay stock suficiente de ${product.name} talle ${variant.size}`, 'error');
  }
  const line = S.cart.find(i => sameId(i.variantId, variantId) && i.mode === mode);
  if (line) line.qty++;
  else S.cart.push({ variantId: variant.id, mode, qty: 1 });
  updateCartUI();

  const pk = Pricing.pack(S.tenant, mode);
  showToast(pk ? `${pk.label} de ${product.name} (${variant.size}) agregada 🛒` : `${product.name} (${variant.size}) agregado 🛒`, 'success');
  $('cart-btn').style.animation = 'pulse 0.3s ease';
  setTimeout(() => { $('cart-btn').style.animation = ''; }, 300);
}

function findLine(variantId, mode) {
  return S.cart.find(i => sameId(i.variantId, variantId) && i.mode === mode);
}

function removeFromCart(variantId, mode) {
  S.cart = S.cart.filter(i => !(sameId(i.variantId, variantId) && i.mode === mode));
  updateCartUI();
}

function updateCartQty(variantId, mode, delta) {
  const line = findLine(variantId, mode);
  if (!line) return;
  if (line.qty + delta <= 0) return removeFromCart(variantId, mode);
  if (delta > 0 && availableFor(variantId) < Pricing.unitsPer(S.tenant, mode)) {
    return showToast('No hay más stock disponible', 'error');
  }
  line.qty += delta;
  updateCartUI();
}

// Pasa unidades sueltas del mismo talle al pack más grande posible (con descuento)
function convertToPack(variantId) {
  const unitLine = findLine(variantId, 'unit');
  if (!unitLine) return;
  let moved = 0;
  for (const pk of [...packs()].reverse()) {
    const n = Math.floor(unitLine.qty / pk.units);
    if (!n) continue;
    unitLine.qty -= n * pk.units;
    moved += n * pk.units;
    const packLine = findLine(variantId, pk.key);
    if (packLine) packLine.qty += n;
    else S.cart.push({ variantId, mode: pk.key, qty: n });
  }
  S.cart = S.cart.filter(i => i.qty > 0);
  updateCartUI();
  if (moved) showToast(`¡Listo! ${moved} unidades pasaron a precio mayorista`, 'success');
}

function clearCart() {
  S.cart = [];
  updateCartUI();
}

function updateCartUI() {
  store.set(cartKey(), S.cart);
  const t = Pricing.cartTotals(S.tenant, S.cart, lookup);
  const smallest = packs()[0];

  $('cart-count').textContent = t.units;
  $('cart-count').style.display = t.units > 0 ? 'flex' : 'none';

  $('cart-items').innerHTML = !t.lines.length ? `
    <div style="text-align:center; padding:40px; color:#aaa;">
      <div style="font-size:48px; margin-bottom:12px;">🛒</div>
      <p style="font-weight:700;">Tu carrito está vacío</p>
      <p style="font-size:13px; margin-top:4px;">Agregá prendas por unidad${smallest ? ' o por mayor' : ''}</p>
    </div>` :
    t.lines.map(({ item, product: p, variant: v, pack, units, gross, discount, total }) => {
      const canConvert = !pack && smallest && Number(smallest.discount_pct) > 0 && item.qty >= smallest.units;
      return `
      <div style="display:flex; gap:12px; align-items:center; background:${pack ? '#fff5f7' : '#f9f9fb'}; border-radius:16px; padding:12px;">
        <img src="${esc(p.image_url)}" style="width:60px; height:70px; object-fit:cover; border-radius:12px; flex-shrink:0;">
        <div style="flex:1; min-width:0;">
          <p style="font-size:13px; font-weight:800; margin-bottom:4px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${esc(p.name)} · ${esc(v.size)}</p>
          <p style="font-size:11px; color:var(--text-sec); font-weight:700; margin-bottom:6px; display:flex; gap:6px; align-items:center; flex-wrap:wrap;">
            <span class="mode-badge ${pack ? 'mode-pack' : 'mode-unit'}">${pack ? `${esc(pack.label)} x${pack.units}` : 'Unidad'}</span>
            ${pack ? `${units} u. · ${fmt(total / units)} c/u` : ''}
          </p>
          <div style="display:flex; align-items:center; justify-content:space-between;">
            <div>
              ${discount ? `<span style="display:block; font-size:11px; color:#aaa; font-weight:700; text-decoration:line-through;">${fmt(gross)}</span>` : ''}
              <span style="font-size:15px; font-weight:900; color:var(--accent);">${fmt(total)}</span>
            </div>
            <div class="qty-stepper">
              <button class="qty-btn" onclick="updateCartQty('${v.id}', '${item.mode}', -1)" aria-label="Menos">−</button>
              <span style="font-weight:800; font-size:14px; min-width:20px; text-align:center;">${item.qty}</span>
              <button class="qty-btn" onclick="updateCartQty('${v.id}', '${item.mode}', 1)" aria-label="Más">+</button>
            </div>
          </div>
          ${canConvert ? `<button onclick="convertToPack('${v.id}')" style="margin-top:8px; background:#fff0f3; color:#d6335a; border:none; border-radius:10px; padding:6px 10px; font-size:11px; font-weight:800; cursor:pointer; font-family:inherit;">
            Pasar a ${esc(smallest.label.toLowerCase())} y ahorrar →</button>` : ''}
        </div>
        <button onclick="removeFromCart('${v.id}', '${item.mode}')" style="color:#d2d2d7; font-size:18px; background:none; border:none; cursor:pointer;" title="Eliminar">✕</button>
      </div>`;
    }).join('');

  $('cart-subtotal').textContent = fmt(t.gross);
  $('cart-discount-row').style.display = t.discount > 0 ? 'flex' : 'none';
  $('cart-discount').textContent = `−${fmt(t.discount)}`;
  $('cart-total').textContent = fmt(t.total);
  $('checkout-btn').disabled = !t.lines.length;
  $('cart-pricing-info').textContent = `Precios en ${S.tenant.currency_code}` + (packs().length
    ? ' · Por mayor: ' + packs().map(pk => `${pk.label.toLowerCase()} (${pk.units} u. del mismo talle)${Number(pk.discount_pct) ? ` −${pk.discount_pct}%` : ''}`).join(', ')
    : '');
}

function toggleCart() {
  const open = !$('cart-drawer').classList.contains('open');
  $('cart-drawer').classList.toggle('open', open);
  $('cart-overlay').classList.toggle('show', open);
}

// ------------------------------------------------------------
// CHECKOUT POR WHATSAPP
// El pedido se arma acá y se manda como mensaje al WhatsApp de la tienda.
// El cobro y el envío se coordinan fuera del sistema.
// ------------------------------------------------------------
const PHONE_HINT = { AR: 'ej: 11 2345 6789', BO: 'ej: 70012345' };

function proceedToCheckout() {
  const t = Pricing.cartTotals(S.tenant, S.cart, lookup);
  if (!t.lines.length) return showToast('Tu carrito está vacío', 'warn');
  toggleCart();
  const saved = store.get('customer', {});

  const itemsList = t.lines.map(({ item, product: p, variant: v, pack, units, total }) => `
    <div style="display:flex; justify-content:space-between; gap:12px; font-size:13px; font-weight:600; padding:6px 0; border-bottom:1px solid #f0f0f5;">
      <span>${Pricing.describe(item.mode, item.qty, units, pack)} · ${esc(p.name)} · Talle ${esc(v.size)}</span>
      <span style="font-weight:800; white-space:nowrap;">${fmt(total)}</span>
    </div>`).join('');

  $('checkout-content').innerHTML = `
    <h2 style="font-size:24px; font-weight:900; margin-bottom:4px;">Finalizar por WhatsApp 💬</h2>
    <p style="color:var(--text-sec); font-size:14px; font-weight:600; margin-bottom:20px;">
      Te abrimos WhatsApp con tu pedido armado. ${esc(S.tenant.name)} te responde para coordinar el pago y el envío.
    </p>
    <div style="background:#f9f9fb; border-radius:20px; padding:16px; margin-bottom:20px;">
      <p style="font-weight:800; margin-bottom:10px; font-size:14px;">📦 Resumen del Pedido</p>
      ${itemsList}
      <div style="display:flex; justify-content:space-between; font-size:13px; font-weight:700; padding-top:10px; color:var(--text-sec);">
        <span>Subtotal</span><span>${fmt(t.gross)}</span>
      </div>
      ${t.discount ? `<div style="display:flex; justify-content:space-between; font-size:13px; font-weight:800; padding-top:4px; color:#d6335a;">
        <span>Descuento mayorista</span><span>−${fmt(t.discount)}</span></div>` : ''}
      <div style="display:flex; justify-content:space-between; font-size:18px; font-weight:900; padding-top:8px;">
        <span>TOTAL</span><span style="color:var(--accent);">${fmt(t.total)}</span>
      </div>
    </div>
    <div style="margin-bottom:20px;">
      <p style="font-weight:800; margin-bottom:12px; font-size:14px;">👤 Tus Datos</p>
      <div style="display:grid; gap:10px;">
        <input id="co-name" type="text" placeholder="Nombre y apellido *" class="field" value="${esc(saved.name)}" autocomplete="name">
        <input id="co-phone" type="tel" placeholder="Tu WhatsApp * (${PHONE_HINT[S.tenant.country] || 'con código de área'})" class="field" value="${esc(saved.phone)}" autocomplete="tel">
        <input id="co-location" type="text" placeholder="Ciudad / localidad *" class="field" value="${esc(saved.location)}">
        <select id="co-delivery" class="field">
          ${['Envío a domicilio', 'Retiro en persona', 'A coordinar'].map(o => `<option ${saved.delivery === o ? 'selected' : ''}>${o}</option>`).join('')}
        </select>
        <textarea id="co-notes" rows="2" placeholder="Nota para la tienda (opcional)" class="field" style="resize:none;"></textarea>
      </div>
    </div>
    <button onclick="sendOrderWhatsApp()" class="btn-wa w-full py-4 rounded-2xl font-black text-lg transition-all">
      Enviar pedido por WhatsApp
    </button>
    <p style="font-size:12px; color:var(--text-sec); font-weight:600; text-align:center; margin-top:10px;">
      No se cobra nada ahora: el pago se coordina con la tienda por WhatsApp.
    </p>`;
  showModal('checkout-modal');
}

function buildOrder(customer, t) {
  return {
    id: newUuid(),
    ref: newOrderRef(),
    customer_name: customer.name,
    customer_phone: customer.phone,
    customer_location: customer.location,
    delivery_method: customer.delivery,
    notes: customer.notes || null,
    items: t.lines.map(l => ({
      variant_id: l.variant.id, product_id: l.product.id,
      name: l.product.name, size: l.variant.size,
      mode: l.item.mode, qty: l.item.qty, units: l.units,
      pack: l.pack ? { label: l.pack.label, plural: l.pack.plural, units: l.pack.units, discount_pct: l.pack.discount_pct } : null,
      unit_price: l.unitPrice, discount: l.discount, total: l.total
    })),
    units: t.units,
    subtotal: t.gross,
    discount: t.discount,
    total: t.total,
    currency_code: S.tenant.currency_code,
    status: 'nuevo'
  };
}

function buildWhatsAppMessage(o) {
  const lines = o.items.map(i => {
    const price = i.discount ? `${fmt(i.total)} (en vez de ${fmt(i.total + i.discount)})` : fmt(i.total);
    return `• ${Pricing.describe(i.mode, i.qty, i.units, i.pack)} ${i.name} · Talle ${i.size} — ${price}`;
  });
  return [
    `¡Hola ${S.tenant.name}! Quiero hacer este pedido:`,
    '',
    `*Pedido ${o.ref}*`,
    ...lines,
    '',
    `Subtotal: ${fmt(o.subtotal)}`,
    ...(o.discount ? [`Descuento mayorista: -${fmt(o.discount)}`] : []),
    `*TOTAL: ${fmt(o.total)} (${o.currency_code})*`,
    '',
    '*Mis datos*',
    `Nombre: ${o.customer_name}`,
    `WhatsApp: +${o.customer_phone}`,
    `Localidad: ${o.customer_location}`,
    `Entrega: ${o.delivery_method}`,
    ...(o.notes ? [`Nota: ${o.notes}`] : []),
    '',
    '¿Me confirman disponibilidad y forma de pago? ¡Gracias!'
  ].join('\n');
}

function sendOrderWhatsApp() {
  const rawPhone = val('co-phone');
  const customer = {
    name: val('co-name'),
    phone: normalizeWaNumber(rawPhone, S.tenant.country),
    location: val('co-location'),
    delivery: val('co-delivery'),
    notes: val('co-notes')
  };
  if (!customer.name || !rawPhone || !customer.location) return showToast('Completá nombre, WhatsApp y localidad', 'warn');
  if (!isValidWaNumber(customer.phone)) return showToast('Revisá tu WhatsApp: código de área + número', 'warn');
  const t = Pricing.cartTotals(S.tenant, S.cart, lookup);
  if (!t.lines.length) return showToast('Tu carrito está vacío', 'warn');

  const order = buildOrder(customer, t);
  const url = whatsappUrl(S.tenant.whatsapp_number, buildWhatsAppMessage(order));

  // Registrar el pedido y abrir WhatsApp en el mismo click (si no, el navegador bloquea la ventana)
  Data.createOrder(S.tenant, order).catch(e => console.error('No se pudo registrar el pedido', e));
  const win = window.open(url, '_blank');
  if (win) win.opener = null;
  else location.href = url;

  store.set('customer', { name: customer.name, phone: rawPhone, location: customer.location, delivery: customer.delivery });
  S.cart = [];
  updateCartUI();
  showOrderSent(order, url);
}

function showOrderSent(order, url) {
  $('checkout-content').innerHTML = `
    <div style="text-align:center; padding:20px 0;">
      <div style="font-size:72px; margin-bottom:16px; animation:bounce 1s ease infinite;">💬</div>
      <h2 style="font-size:26px; font-weight:900; margin-bottom:8px;">¡Tu pedido está listo!</h2>
      <p style="color:var(--text-sec); font-weight:600; margin-bottom:24px;">
        Abrimos WhatsApp con el pedido armado, ${esc(order.customer_name.split(' ')[0])}. Solo falta tocar <b>Enviar</b>. 💖
      </p>
      <div style="background:#f9f9fb; border-radius:20px; padding:20px; text-align:left; margin-bottom:20px;">
        <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
          <span style="font-size:13px; font-weight:700; color:var(--text-sec);">Nro. Pedido</span>
          <span style="font-size:13px; font-weight:900; font-family:monospace;">${order.ref}</span>
        </div>
        <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
          <span style="font-size:13px; font-weight:700; color:var(--text-sec);">Prendas</span>
          <span style="font-size:13px; font-weight:900;">${order.units} u.</span>
        </div>
        ${order.discount ? `<div style="display:flex; justify-content:space-between; margin-bottom:8px;">
          <span style="font-size:13px; font-weight:700; color:#d6335a;">Ahorro mayorista</span>
          <span style="font-size:13px; font-weight:900; color:#d6335a;">−${fmt(order.discount)}</span></div>` : ''}
        <div style="display:flex; justify-content:space-between; padding-top:12px; border-top:2px solid #e8e8ed; margin-top:8px;">
          <span style="font-size:16px; font-weight:900;">TOTAL</span>
          <span style="font-size:20px; font-weight:900; color:var(--accent);">${fmt(order.total)}</span>
        </div>
      </div>
      ${S.tenant.payment_instructions ? `
      <div style="background:#f5f9ff; border-radius:20px; padding:16px; text-align:left; margin-bottom:20px;">
        <p style="font-size:13px; font-weight:900; margin-bottom:6px;">💳 Datos para el pago</p>
        <p style="font-size:13px; font-weight:700; white-space:pre-line;">${esc(S.tenant.payment_instructions)}</p>
        <p style="font-size:12px; color:var(--text-sec); font-weight:600; margin-top:8px;">
          Cuando ${esc(S.tenant.name)} te confirme la disponibilidad, pagá y mandá el comprobante por el mismo chat.
          ${S.tenant.order_expiry_hours ? `El pedido se reserva ${S.tenant.order_expiry_hours} h.` : ''}
        </p>
      </div>` : ''}
      <a href="${esc(url)}" target="_blank" rel="noopener" class="btn-wa block w-full py-4 rounded-2xl font-black text-lg mb-2">¿No se abrió? Abrir WhatsApp</a>
      <button onclick="closeModal('checkout-modal')" class="w-full py-3 rounded-2xl font-bold text-sm bg-gray-100">Seguir comprando</button>
      ${suggestionsHtml(order)}
    </div>`;
}

// "Te puede interesar": productos con stock que no estaban en el pedido, primero de las mismas categorías
function suggestionsHtml(order) {
  const bought = new Set(order.items.map(i => String(i.product_id)));
  const cats = new Set(order.items.map(i => String(S.products.find(p => sameId(p.id, i.product_id))?.category_id)));
  const list = S.products
    .filter(p => !bought.has(String(p.id)) && productStock(p) > 0)
    .sort((a, b) => cats.has(String(b.category_id)) - cats.has(String(a.category_id)))
    .slice(0, 4);
  if (!list.length) return '';
  return `
    <div style="text-align:left; margin-top:24px;">
      <p style="font-size:15px; font-weight:900; margin-bottom:10px;">Te puede interesar ✨</p>
      <div style="display:grid; grid-template-columns:repeat(2, 1fr); gap:10px;">
        ${list.map(p => `
          <button onclick="closeModal('checkout-modal'); showProductDetail('${p.id}')"
            style="text-align:left; background:#f9f9fb; border:none; border-radius:16px; padding:8px; cursor:pointer; font-family:inherit;">
            <img src="${esc(p.image_url)}" alt="" style="width:100%; aspect-ratio:1; object-fit:cover; border-radius:12px;">
            <p style="font-size:12px; font-weight:800; margin-top:6px;">${esc(p.name)}</p>
            <p style="font-size:13px; font-weight:900; color:var(--accent);">${fmt(p.price)}</p>
          </button>`).join('')}
      </div>
    </div>`;
}
