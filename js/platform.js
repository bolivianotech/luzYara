// ============================================================
// CONSOLA DE PLATAFORMA (plataforma.html) — solo superadministradores.
// Todas las tiendas: alta, pausa, administradores y métricas del mes.
// ============================================================

const P = {
  tenants: [],
  orders: [],
  products: [],
  adminsOf: null     // tienda cuyo equipo se está editando
};

const PACK_PRESETS_PLATFORM = {
  curva: [{ key: 'curva', label: 'Curva', plural: 'Curvas', units: 5, discount_pct: 10 }],
  docenas: [
    { key: 'media-docena', label: 'Media docena', plural: 'Medias docenas', units: 6, discount_pct: 5 },
    { key: 'docena', label: 'Docena', plural: 'Docenas', units: 12, discount_pct: 10 }
  ],
  none: []
};

const slugify = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

// Botón de doble confirmación (sin ventanas emergentes)
function confirmClick(btn, fn) {
  if (btn.dataset.armed) {
    delete btn.dataset.armed;
    btn.textContent = btn.dataset.label;
    return fn();
  }
  btn.dataset.armed = '1';
  btn.dataset.label = btn.textContent;
  btn.textContent = '¿Seguro? Tocá de nuevo';
  setTimeout(() => { if (btn.dataset.armed) { delete btn.dataset.armed; btn.textContent = btn.dataset.label; } }, 3000);
}

// ------------------------------------------------------------
// ACCESO
// ------------------------------------------------------------
window.addEventListener('DOMContentLoaded', () => {
  if (Data.onAuthChange) Data.onAuthChange(s => { if (s) checkAccess(); });
  checkAccess();
});

async function checkAccess() {
  const session = await Data.session();
  if (!session) return showLogin();
  if (!(await Data.isPlatformAdmin())) {
    showLogin();
    $('login-form').style.display = 'none';
    $('login-denied').style.display = 'block';
    $('denied-email').textContent = session.email;
    return;
  }
  if ($('platform-view').style.display === 'block') return;
  $('login-view').style.display = 'none';
  $('platform-view').style.display = 'block';
  $('platform-user').textContent = session.email + (Data.isDemo ? ' (demo)' : '');
  if (Data.isDemo) $('demo-banner').style.display = 'block';
  $('nt-currency').innerHTML = CURRENCY_PRESETS.map(c => `<option value="${c.code}">${c.country} · ${c.code} ${c.name}</option>`).join('');
  loadAll();
}

function showLogin() {
  $('platform-view').style.display = 'none';
  $('login-view').style.display = 'block';
  if (Data.isDemo) $('demo-hint').style.display = 'block';
}

async function sendLoginLink() {
  const email = val('login-email');
  if (!email) return showToast('Escribí tu correo', 'warn');
  try {
    await Data.signIn(email);
    if (Data.isDemo) return location.reload();
    $('login-status').textContent = '✅ Revisá tu correo y abrí el enlace desde este navegador.';
    $('login-status').style.color = 'var(--green)';
  } catch(e) {
    $('login-status').textContent = '❌ ' + e.message;
    $('login-status').style.color = '#ff3b30';
  }
}

async function logout() {
  await Data.signOut();
  location.reload();
}

// ------------------------------------------------------------
// TIENDAS Y MÉTRICAS
// ------------------------------------------------------------
async function loadAll() {
  try {
    [P.tenants, P.orders, P.products] = await Promise.all([Data.listTenants(), Data.platformOrders(), Data.platformProducts()]);
  } catch(e) {
    console.error(e);
    return showToast('No se pudieron cargar las tiendas: ' + e.message, 'error');
  }
  render();
}

function tenantStats(t) {
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const orders = P.orders.filter(o => sameId(o.tenant_id, t.id));
  const paid = orders.filter(o => o.status === 'pagado' && o.payment_registered_at && new Date(o.payment_registered_at) >= monthStart);
  const products = P.products.filter(p => sameId(p.tenant_id, t.id));
  return {
    products: products.length,
    units: products.reduce((s, p) => s + (p.variants || []).reduce((a, v) => a + v.stock, 0), 0),
    pending: orders.filter(o => o.status === 'nuevo' || o.status === 'contactado').length,
    paidCount: paid.length,
    paidTotal: paid.reduce((s, o) => s + Number(o.payment_amount ?? o.total), 0)
  };
}

function render() {
  const stats = P.tenants.map(t => ({ t, s: tenantStats(t) }));
  $('kpi-tenants').textContent = P.tenants.filter(t => t.active).length;
  $('kpi-pending').textContent = stats.reduce((a, x) => a + x.s.pending, 0);
  $('kpi-paid').textContent = stats.reduce((a, x) => a + x.s.paidCount, 0);
  $('kpi-units').textContent = stats.reduce((a, x) => a + x.s.units, 0);

  const btn = 'font-size:12px; padding:5px 10px; margin:2px;';
  $('tenants-table').innerHTML = `
    <thead><tr><th>Tienda</th><th>Moneda</th><th>Venta por mayor</th><th>Catálogo</th><th>Pendientes</th><th>Pagado este mes</th><th>Estado</th><th>Acciones</th></tr></thead>
    <tbody>${stats.map(({ t, s }) => `
      <tr style="${t.active ? '' : 'opacity:0.55;'}">
        <td style="min-width:170px;"><span style="font-size:20px;">${esc(t.brand?.emoji || '🛍️')}</span> <b>${esc(t.name)}</b>
          <div class="hint" style="margin:0; font-family:monospace;">${esc(t.slug)}</div></td>
        <td style="white-space:nowrap;">${esc(t.country)} · ${esc(t.currency_code)}</td>
        <td style="font-size:12px;">${Pricing.packs(t).map(p => `${esc(p.label)} x${p.units}`).join('<br>') || 'Solo unidad'}</td>
        <td style="font-size:12px;">${s.products} productos<br><b>${s.units}</b> prendas</td>
        <td style="font-weight:900; color:var(--blue);">${s.pending}</td>
        <td style="white-space:nowrap;"><b>${money(t, s.paidTotal)}</b><div class="hint" style="margin:0;">${s.paidCount} ventas</div></td>
        <td><span style="background:${t.active ? '#e8f8f0' : '#f5f5f7'}; color:${t.active ? '#1a7f3a' : '#999'}; padding:4px 10px; border-radius:99px; font-size:11px; font-weight:800; white-space:nowrap;">${t.active ? '● Activa' : '○ Pausada'}</span></td>
        <td style="min-width:230px;">
          <a class="btn btn-soft" style="${btn}" href="index.html?tienda=${encodeURIComponent(t.slug)}" target="_blank">Tienda ↗</a>
          <a class="btn btn-primary" style="${btn}" href="admin.html?tienda=${encodeURIComponent(t.slug)}" target="_blank">Backoffice ↗</a>
          <button class="btn btn-soft" style="${btn}" onclick="openAdmins('${t.id}')">👤 Admins</button>
          <button class="btn ${t.active ? 'btn-danger' : 'btn-soft'}" style="${btn}" onclick="confirmClick(this, () => toggleTenant('${t.id}'))">${t.active ? 'Pausar' : 'Activar'}</button>
        </td>
      </tr>`).join('') || '<tr><td colspan="8" style="text-align:center; padding:40px; color:#999;">No hay tiendas</td></tr>'}</tbody>`;
}

async function toggleTenant(id) {
  const t = P.tenants.find(x => sameId(x.id, id));
  try {
    const saved = await Data.updateTenant(t, { active: !t.active });
    Object.assign(t, saved);
    render();
    showToast(t.active ? `${t.name} activada` : `${t.name} pausada: ya no se ve en internet`, 'success');
  } catch(e) {
    showToast('Error: ' + e.message, 'error');
  }
}

// ------------------------------------------------------------
// ALTA DE TIENDA
// ------------------------------------------------------------
function openTenantForm() {
  ['nt-name', 'nt-slug', 'nt-whatsapp', 'nt-admin'].forEach(id => { $(id).value = ''; });
  $('nt-emoji').value = '🛍️';
  $('nt-sizes').value = 'S, M, L, XL';
  $('nt-invite-hint').style.display = Data.isDemo ? 'none' : 'block';
  showModal('tenant-modal');
}

async function createTenant() {
  const c = CURRENCY_PRESETS.find(x => x.code === $('nt-currency').value) || CURRENCY_PRESETS[0];
  const slug = slugify(val('nt-slug') || val('nt-name'));
  const whatsapp = normalizeWaNumber(val('nt-whatsapp'), c.country);
  const admin = val('nt-admin').toLowerCase();
  const name = val('nt-name');
  if (!name) return showToast('Poné el nombre de la tienda', 'warn');
  if (slug.length < 2) return showToast('El identificador debe tener al menos 2 letras', 'warn');
  if (!isValidWaNumber(whatsapp)) return showToast('WhatsApp inválido (para otro país empezá con +)', 'warn');
  if (!/^\S+@\S+\.\S+$/.test(admin)) return showToast('Correo del dueño inválido', 'warn');
  const sizes = [...new Set(val('nt-sizes').split(',').map(s => s.trim()).filter(Boolean))];

  const tenant = {
    slug, name,
    country: c.country, currency_code: c.code, locale: c.locale, currency_decimals: c.decimals,
    whatsapp_number: whatsapp,
    brand: { emoji: val('nt-emoji') || '🛍️', kicker: 'Nueva colección', title: name, subtitle: 'Pedidos por WhatsApp' },
    sizes: sizes.length ? sizes : ['S', 'M', 'L', 'XL'],
    packs: PACK_PRESETS_PLATFORM[$('nt-packs').value],
    low_stock_threshold: 5,
    order_expiry_hours: 48,
    payment_instructions: ''
  };
  try {
    await Data.createTenant(tenant, [admin]);
    closeModal('tenant-modal');
    showToast(`Tienda ${name} creada ✓`, 'success');
    loadAll();
  } catch(e) {
    showToast(/duplicate|unique|ya existe/i.test(e.message) ? `Ya existe una tienda "${slug}"` : e.message, 'error');
  }
}

// ------------------------------------------------------------
// ADMINISTRADORES POR TIENDA
// ------------------------------------------------------------
async function openAdmins(id) {
  P.adminsOf = P.tenants.find(x => sameId(x.id, id));
  $('admins-title').textContent = `Administradores · ${P.adminsOf.name}`;
  $('admins-new').value = '';
  $('admins-invite-hint').style.display = Data.isDemo ? 'none' : 'block';
  await renderAdmins();
  showModal('admins-modal');
}

async function renderAdmins() {
  try {
    const list = await Data.listTenantAdmins(P.adminsOf);
    $('admins-list').innerHTML = list.map(email => `
      <div class="flex items-center justify-between" style="padding:8px 0; border-bottom:1px solid #f0f0f5;">
        <span style="font-weight:700;">${esc(email)}</span>
        <button class="btn btn-danger" style="font-size:12px; padding:5px 10px;" onclick="confirmClick(this, () => removeAdmin('${esc(email)}'))">Quitar</button>
      </div>`).join('') || '<p class="hint">Sin administradores.</p>';
  } catch(e) {
    showToast('Error: ' + e.message, 'error');
  }
}

async function addAdmin() {
  const email = val('admins-new').toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) return showToast('Correo inválido', 'warn');
  try {
    await Data.addTenantAdmin(P.adminsOf, email);
    $('admins-new').value = '';
    renderAdmins();
    showToast('Administrador agregado ✓', 'success');
  } catch(e) {
    showToast('Error: ' + e.message, 'error');
  }
}

async function removeAdmin(email) {
  try {
    await Data.removeTenantAdmin(P.adminsOf, email);
    renderAdmins();
    showToast('Administrador quitado', 'success');
  } catch(e) {
    showToast('Error: ' + e.message, 'error');
  }
}

function resetAllDemo() {
  DemoBackend.resetAll();
  location.reload();
}
