// ============================================================
// NÚCLEO COMPARTIDO (tienda + backoffice)
// Tienda actual, formato de moneda, teléfonos, motor de precios y UI común.
// ============================================================

const IS_LIVE = !!(window.APP_CONFIG && APP_CONFIG.supabaseUrl && !APP_CONFIG.supabaseUrl.startsWith('YOUR_'));

// localStorage puede no estar disponible (modo privado): nunca debe romper la app
const store = {
  get(key, fallback) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch(e) { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch(e) { return false; }
  },
  remove(key) {
    try { localStorage.removeItem(key); } catch(e) {}
  }
};

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const val = id => (document.getElementById(id)?.value || '').trim();
const $ = id => document.getElementById(id);
const sameId = (a, b) => String(a) === String(b);

function newUuid() {
  if (window.crypto?.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

function newOrderRef() {
  const d = new Date();
  const ymd = String(d.getFullYear()).slice(2) + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
  const rnd = Array.from({ length: 4 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.random() * 32 | 0]).join('');
  return `PED-${ymd}-${rnd}`;
}

// ------------------------------------------------------------
// TIENDA ACTUAL (multitenant)
// Orden: ?tienda=slug  →  dominio propio (APP_CONFIG.domains)  →  última visitada  →  defaultTenant
// ------------------------------------------------------------
function resolveTenantSlug() {
  const clean = s => String(s || '').toLowerCase().replace(/[^a-z0-9-]/g, '');
  const fromUrl = clean(new URLSearchParams(location.search).get('tienda'));
  if (fromUrl) {
    try { sessionStorage.setItem('tienda', fromUrl); } catch(e) {}
    return fromUrl;
  }
  const host = location.hostname.replace(/^www\./, '');
  const byDomain = APP_CONFIG.domains?.[host];
  if (byDomain) return byDomain;
  try { const s = clean(sessionStorage.getItem('tienda')); if (s) return s; } catch(e) {}
  return APP_CONFIG.defaultTenant;
}

// Link a otra página de la misma tienda (conserva ?tienda= si hace falta)
function tenantLink(page, slug) {
  const host = location.hostname.replace(/^www\./, '');
  const needsParam = !APP_CONFIG.domains?.[host];
  return needsParam ? `${page}?tienda=${encodeURIComponent(slug)}` : page;
}

// ------------------------------------------------------------
// MONEDAS
// ------------------------------------------------------------
const CURRENCY_PRESETS = [
  { code: 'ARS', name: 'Peso argentino',   locale: 'es-AR', country: 'AR', decimals: 0 },
  { code: 'BOB', name: 'Boliviano',        locale: 'es-BO', country: 'BO', decimals: 0 },
  { code: 'CLP', name: 'Peso chileno',     locale: 'es-CL', country: 'CL', decimals: 0 },
  { code: 'PEN', name: 'Sol peruano',      locale: 'es-PE', country: 'PE', decimals: 2 },
  { code: 'UYU', name: 'Peso uruguayo',    locale: 'es-UY', country: 'UY', decimals: 0 },
  { code: 'PYG', name: 'Guaraní',          locale: 'es-PY', country: 'PY', decimals: 0 },
  { code: 'MXN', name: 'Peso mexicano',    locale: 'es-MX', country: 'MX', decimals: 2 },
  { code: 'USD', name: 'Dólar',            locale: 'en-US', country: 'US', decimals: 2 }
];

const _formatters = {};
function money(tenant, n) {
  const key = `${tenant.locale}|${tenant.currency_code}|${tenant.currency_decimals}`;
  if (!_formatters[key]) {
    try {
      _formatters[key] = new Intl.NumberFormat(tenant.locale, {
        style: 'currency', currency: tenant.currency_code,
        minimumFractionDigits: tenant.currency_decimals, maximumFractionDigits: tenant.currency_decimals
      });
    } catch(e) {
      _formatters[key] = { format: v => `${tenant.currency_code} ${Number(v).toFixed(tenant.currency_decimals)}` };
    }
  }
  const factor = 10 ** (tenant.currency_decimals || 0);
  return _formatters[key].format(Math.round((n || 0) * factor) / factor);
}

const roundMoney = (tenant, n) => {
  const factor = 10 ** (tenant.currency_decimals || 0);
  return Math.round(n * factor) / factor;
};

// ------------------------------------------------------------
// TELÉFONOS → formato wa.me (solo dígitos, con código de país)
// "+..." siempre se respeta como internacional. Sin "+", se asume el país de la tienda.
// Argentina: 549 + área + número (se quitan el 0 y el 15).
// ------------------------------------------------------------
const CALLING_CODES = { AR: '54', BO: '591', CL: '56', PE: '51', UY: '598', PY: '595', MX: '52', US: '1' };

function normalizeArNational(d) {
  if (d.startsWith('9')) d = d.slice(1);
  if (d.startsWith('0')) d = d.slice(1);
  if (d.length === 12) {
    // "15" del celular después del código de área (2 a 4 dígitos): 11 15 2345 6789 → 11 2345 6789
    for (const k of [2, 3, 4]) {
      if (d.substr(k, 2) === '15') { d = d.slice(0, k) + d.slice(k + 2); break; }
    }
  }
  return '549' + d;
}

function normalizeWaNumber(raw, country = 'AR') {
  const txt = String(raw || '').trim();
  let d = txt.replace(/\D/g, '');
  if (!d) return '';
  let intl = txt.startsWith('+');
  if (d.startsWith('00')) { d = d.slice(2); intl = true; }
  if (d.startsWith('54') && (intl || (country === 'AR' && d.length >= 12))) return normalizeArNational(d.slice(2));
  if (intl) return d;
  if (country === 'AR') {
    // Un número argentino tiene 10 dígitos (11 con 0 o 9 adelante, 12-13 con 15).
    // 11 dígitos que no empiezan con 0 ni 9 = número de otro país escrito sin "+".
    if (d.length === 11 && !/^[09]/.test(d)) return d;
    return normalizeArNational(d);
  }
  const code = CALLING_CODES[country] || '';
  d = d.replace(/^0+/, '');
  if (code && d.startsWith(code) && d.length > 9) return d;
  return code + d;
}

const isValidWaNumber = n => /^\d{10,15}$/.test(n) && (!n.startsWith('549') || n.length === 13);
const whatsappUrl = (number, text) => `https://wa.me/${number}?text=${encodeURIComponent(text)}`;

// ------------------------------------------------------------
// MOTOR DE PRECIOS
// Un "pack" es una forma de venta mayorista: curva (5), media docena (6), docena (12)...
// Regla actual: N unidades del MISMO artículo (producto + talle) con X% de descuento.
// Para combos mixtos, se cambia solo este bloque: carrito, checkout, WhatsApp y
// backoffice consumen priceLine() / cartTotals().
// ------------------------------------------------------------
const Pricing = {
  packs(tenant) {
    return (tenant.packs || []).filter(p => p && p.units >= 2).sort((a, b) => a.units - b.units);
  },
  pack(tenant, key) {
    return Pricing.packs(tenant).find(p => p.key === key) || null;
  },
  unitsPer(tenant, mode) {
    if (mode === 'unit') return 1;
    return Pricing.pack(tenant, mode)?.units || 0;
  },
  packTotal(tenant, pack, unitPrice) {
    const gross = unitPrice * pack.units;
    return gross - roundMoney(tenant, gross * (Number(pack.discount_pct) || 0) / 100);
  },
  // item: { variantId, mode: 'unit' | pack.key, qty }; lookup(variantId) → { product, variant }
  line(tenant, item, lookup) {
    const found = lookup(item.variantId);
    if (!found) return null;
    const { product, variant } = found;
    const unitPrice = Number(product.price) || 0;
    const pack = item.mode === 'unit' ? null : Pricing.pack(tenant, item.mode);
    if (item.mode !== 'unit' && !pack) return null;   // el pack ya no existe en la configuración
    const units = pack ? item.qty * pack.units : item.qty;
    const gross = unitPrice * units;
    const discount = pack ? roundMoney(tenant, gross * (Number(pack.discount_pct) || 0) / 100) : 0;
    return { item, product, variant, pack, unitPrice, units, gross, discount, total: gross - discount };
  },
  cartTotals(tenant, cart, lookup) {
    const lines = cart.map(i => Pricing.line(tenant, i, lookup)).filter(Boolean);
    const sum = k => lines.reduce((s, l) => s + l[k], 0);
    return { lines, units: sum('units'), gross: sum('gross'), discount: sum('discount'), total: sum('total') };
  },
  // "2 curvas x5 (10 u.)" / "1 docena (12 u.)" / "3 u."
  describe(mode, qty, units, pack) {
    if (mode === 'unit' || !pack) return `${units} u.`;
    const name = (qty === 1 ? pack.label : pack.plural || pack.label).toLowerCase();
    return `${qty} ${name} (${units} u.)`;
  }
};

// ------------------------------------------------------------
// UI COMÚN
// ------------------------------------------------------------
function showToast(msg, type = '') {
  const container = $('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  const icons = { success: '✓', error: '✕', warn: '⚠️', '': 'ℹ️' };
  toast.innerHTML = `<span>${icons[type] || 'ℹ️'}</span> ${esc(msg)}`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(20px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

function showModal(id) {
  $(id).classList.add('show');
  document.body.style.overflow = 'hidden';
}
function closeModal(id) {
  $(id).classList.remove('show');
  document.body.style.overflow = '';
}
document.addEventListener('click', e => {
  if (e.target.classList?.contains('modal-overlay')) closeModal(e.target.id);
});

function applyBranding(tenant) {
  document.title = tenant.name;
  document.querySelectorAll('[data-brand="name"]').forEach(el => { el.textContent = tenant.name; });
  document.querySelectorAll('[data-brand="emoji"]').forEach(el => { el.textContent = tenant.brand?.emoji || '🛍️'; });
}

// Reduce una foto antes de subirla (celulares sacan fotos de 4-8 MB)
function resizeImage(file, maxSide = 1200, quality = 0.85) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith('image/')) return reject(new Error('El archivo no es una imagen'));
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob(b => b ? resolve(b) : reject(new Error('No se pudo procesar la imagen')), 'image/jpeg', quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo leer la imagen')); };
    img.src = url;
  });
}

const blobToDataUrl = blob => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(r.result);
  r.onerror = reject;
  r.readAsDataURL(blob);
});
