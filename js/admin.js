// ============================================================
// BACKOFFICE (admin.html) — inventario, productos y fotos, categorías,
// pedidos y configuración de la tienda
// ============================================================

const A = {
  tenant: null,
  categories: [],
  products: [],
  orders: [],
  invCategory: 'all',
  orderFilter: 'nuevo',
  form: null,          // producto en edición: { id, isNew, file, imageUrl, oldImageUrl }
  quickProductId: null,
  pendingStock: {}     // variantId → stock que se está guardando
};

const afmt = n => money(A.tenant, n);
const catOf = id => A.categories.find(c => sameId(c.id, id));
const sizesOrder = () => A.tenant.sizes || [];
const sortSizes = list => [...list].sort((a, b) => {
  const ia = sizesOrder().indexOf(a), ib = sizesOrder().indexOf(b);
  return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
});

// ------------------------------------------------------------
// INICIO Y ACCESO
// ------------------------------------------------------------
window.addEventListener('DOMContentLoaded', async () => {
  const slug = resolveTenantSlug();
  try {
    A.tenant = await Data.loadTenant(slug);
  } catch(e) {
    console.error(e);
  }
  if (!A.tenant) {
    document.body.innerHTML = `<div class="admin-shell" style="text-align:center; padding-top:120px;">
      <div style="font-size:56px;">🏬</div><h1 style="font-size:22px; font-weight:900;">Tienda "${esc(slug)}" no encontrada</h1></div>`;
    return;
  }
  applyBranding(A.tenant);
  document.title = `Backoffice · ${A.tenant.name}`;
  if (Data.onAuthChange) Data.onAuthChange(session => { if (session) checkAccess(); });
  checkAccess();
});

async function checkAccess() {
  const session = await Data.session();
  if (!session) return showLogin();
  if (!(await Data.canManage(A.tenant))) {
    showLogin();
    $('login-form').style.display = 'none';
    $('login-denied').style.display = 'block';
    $('denied-email').textContent = session.email;
    return;
  }
  $('admin-user').textContent = Data.isDemo ? 'modo demo' : session.email;
  enterAdmin();
}

function showLogin() {
  $('admin-view').style.display = 'none';
  $('login-view').style.display = 'block';
}

async function sendLoginLink() {
  const email = val('login-email');
  if (!email) return showToast('Escribí tu correo', 'warn');
  try {
    await Data.signIn(email);
    $('login-status').textContent = '✅ Listo: revisá tu correo y abrí el enlace desde este mismo navegador.';
    $('login-status').style.color = 'var(--green)';
  } catch(e) {
    $('login-status').textContent = '❌ ' + (/signups not allowed|not found/i.test(e.message)
      ? 'Ese correo no está invitado. Pedile al administrador de la plataforma que te dé acceso.'
      : e.message);
    $('login-status').style.color = '#ff3b30';
  }
}

async function logout() {
  await Data.signOut();
  location.reload();
}

async function enterAdmin() {
  if ($('admin-view').style.display === 'block') return;
  $('login-view').style.display = 'none';
  $('admin-view').style.display = 'block';
  $('store-link').href = tenantLink('index.html', A.tenant.slug);
  if (Data.isDemo) {
    $('demo-banner').style.display = 'block';
    $('logout-btn').style.display = 'none';
    $('reset-demo-btn').style.display = 'inline-block';
    const sw = $('demo-switch');
    sw.style.display = 'inline-flex';
    sw.innerHTML = `<select class="field" style="padding:8px 12px;" onchange="location.href='admin.html?tienda='+this.value" aria-label="Tienda demo">
      ${Object.values(window.DEMO_TENANTS || {}).map(d => `<option value="${d.tenant.slug}" ${d.tenant.slug === A.tenant.slug ? 'selected' : ''}>${esc(d.tenant.name)}</option>`).join('')}
    </select>`;
  }
  document.querySelectorAll('#admin-tabs .pill-tab').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));
  await Promise.all([loadCatalog(), loadOrders()]);
  fillConfigForm();
}

function showTab(tab) {
  document.querySelectorAll('#admin-tabs .pill-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === `panel-${tab}`));
  if (tab === 'orders') loadOrders();
}

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
  setTimeout(() => {
    if (btn.dataset.armed) { delete btn.dataset.armed; btn.textContent = btn.dataset.label; }
  }, 3000);
}

// ------------------------------------------------------------
// CATÁLOGO
// ------------------------------------------------------------
async function loadCatalog() {
  try {
    const { categories, products } = await Data.loadCatalog(A.tenant, { admin: true });
    A.categories = categories;
    A.products = products;
  } catch(e) {
    console.error(e);
    showToast('No se pudo cargar el catálogo: ' + e.message, 'error');
  }
  renderAll();
}

function renderAll() {
  renderKpis();
  renderInventory();
  renderProducts();
  renderCategories();
}

function stockClass(stock) {
  if (stock <= 0) return 'out';
  if (stock <= A.tenant.low_stock_threshold) return 'low';
  return '';
}

function renderKpis() {
  const variants = A.products.filter(p => p.active).flatMap(p => p.variants);
  $('kpi-units').textContent = variants.reduce((s, v) => s + v.stock, 0).toLocaleString(A.tenant.locale);
  $('kpi-out').textContent = variants.filter(v => v.stock <= 0).length;
  $('kpi-low').textContent = variants.filter(v => v.stock > 0 && v.stock <= A.tenant.low_stock_threshold).length;
  $('kpi-orders').textContent = A.orders.filter(o => o.status === 'nuevo').length;
}

// ------------------------------------------------------------
// INVENTARIO — prendas por categoría y talle, editable en línea
// ------------------------------------------------------------
function inventoryGroups() {
  const groups = A.categories.map(c => ({ cat: c, products: A.products.filter(p => sameId(p.category_id, c.id)) }));
  const orphans = A.products.filter(p => !catOf(p.category_id));
  if (orphans.length) groups.push({ cat: { id: 'none', name: 'Sin categoría', emoji: '❔' }, products: orphans });
  return groups;
}

function renderInventory() {
  const groups = inventoryGroups();
  const low = A.tenant.low_stock_threshold;

  // Resumen por categoría
  const sum = (list, f) => list.reduce((s, x) => s + f(x), 0);
  const rows = groups.map(({ cat, products }) => {
    const vs = products.flatMap(p => p.variants);
    return `<tr>
      <td style="font-weight:800;">${esc(cat.emoji)} ${esc(cat.name)}</td>
      <td>${products.length}</td>
      <td style="font-weight:900;">${sum(vs, v => v.stock)}</td>
      <td style="color:#ff3b30; font-weight:800;">${vs.filter(v => v.stock <= 0).length || '—'}</td>
      <td style="color:#ff9f0a; font-weight:800;">${vs.filter(v => v.stock > 0 && v.stock <= low).length || '—'}</td>
    </tr>`;
  });
  const allV = A.products.flatMap(p => p.variants);
  $('inv-summary').innerHTML = `
    <thead><tr><th>Categoría</th><th>Productos</th><th>Prendas</th><th>Talles sin stock</th><th>Talles stock bajo</th></tr></thead>
    <tbody>${rows.join('')}
      <tr style="background:#fafafa;"><td style="font-weight:900;">Total</td><td style="font-weight:900;">${A.products.length}</td>
        <td style="font-weight:900;">${sum(allV, v => v.stock)}</td><td></td><td></td></tr>
    </tbody>`;

  // Filtro
  $('inv-filter').innerHTML = [{ id: 'all', name: 'Todas', emoji: '✨' }, ...groups.map(g => g.cat)].map(c =>
    `<button class="pill-tab ${sameId(A.invCategory, c.id) ? 'active' : ''}" onclick="A.invCategory='${c.id}'; renderInventory()">${esc(c.emoji)} ${esc(c.name)}</button>`).join('');

  // Tablas por categoría: filas = productos, columnas = talles
  const q = val('inv-search').toLowerCase();
  const html = groups
    .filter(g => A.invCategory === 'all' || sameId(g.cat.id, A.invCategory))
    .map(({ cat, products }) => {
      const list = products.filter(p => !q || p.name.toLowerCase().includes(q));
      if (!list.length) return '';
      const sizes = sortSizes([...new Set(list.flatMap(p => p.variants.map(v => v.size)))]);
      return `
      <div class="card mb-4" style="padding:0; overflow:hidden;">
        <div style="padding:14px 20px; display:flex; justify-content:space-between; align-items:center;">
          <h3 style="font-size:16px; font-weight:900;">${esc(cat.emoji)} ${esc(cat.name)}</h3>
          <span class="hint" style="margin:0;">${sum(list.flatMap(p => p.variants), v => v.stock)} prendas</span>
        </div>
        <div style="overflow-x:auto;">
          <table class="admin-table">
            <thead><tr><th>Producto</th>${sizes.map(s => `<th style="text-align:center;">${esc(s)}</th>`).join('')}<th style="text-align:center;">Total</th></tr></thead>
            <tbody>${list.map(p => `
              <tr style="${p.active ? '' : 'opacity:0.5;'}">
                <td style="min-width:200px;">
                  <div class="flex items-center gap-3">
                    <img src="${esc(p.image_url)}" style="width:36px; height:44px; object-fit:cover; border-radius:8px; background:#f0f0f5;" onerror="this.style.visibility='hidden'">
                    <div><div style="font-weight:800;">${esc(p.name)}</div>${p.active ? '' : '<div class="hint" style="margin:0;">oculto en la tienda</div>'}</div>
                  </div>
                </td>
                ${sizes.map(s => {
                  const v = p.variants.find(x => x.size === s);
                  return `<td style="text-align:center;">${v
                    ? `<input type="number" min="0" class="stock-input ${stockClass(v.stock)}" value="${v.stock}"
                         data-product="${p.id}" data-variant="${v.id}" onchange="saveStock(this)" aria-label="Stock ${esc(p.name)} talle ${esc(s)}">`
                    : '<span style="color:#d2d2d7;">—</span>'}</td>`;
                }).join('')}
                <td style="text-align:center; font-weight:900;" id="rowtotal-${p.id}">${sum(p.variants, v => v.stock)}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>`;
    }).join('');
  $('inv-groups').innerHTML = html || '<p class="hint">No hay productos. Crealos en la pestaña 👕 Productos.</p>';
}

async function saveStock(input) {
  const stock = parseInt(input.value, 10);
  const p = A.products.find(x => sameId(x.id, input.dataset.product));
  const v = p?.variants.find(x => sameId(x.id, input.dataset.variant));
  if (!v) return;
  if (!(stock >= 0)) { input.value = v.stock; return showToast('El stock debe ser 0 o más', 'warn'); }
  // Evita guardar dos veces el mismo valor (el navegador puede disparar "change" de nuevo al redibujar)
  if (stock === v.stock || A.pendingStock[v.id] === stock) return;
  A.pendingStock[v.id] = stock;
  input.classList.add('saving');
  try {
    await Data.setStock(A.tenant, v.id, stock);
    v.stock = stock;
    // Re-dibuja totales por categoría sin sacar el cursor del casillero en el que está el usuario
    const focused = document.activeElement?.dataset?.variant;
    renderKpis();
    renderInventory();
    renderProducts();
    const next = focused && document.querySelector(`[data-variant="${focused}"]`);
    if (next) { next.focus(); next.select(); }
    showToast(`${p.name} · ${v.size}: ${stock} u.`, 'success');
  } catch(e) {
    input.value = v.stock;
    showToast('No se pudo guardar: ' + e.message, 'error');
  } finally {
    delete A.pendingStock[v.id];
    input.classList.remove('saving');
  }
}

// ------------------------------------------------------------
// PRODUCTOS
// ------------------------------------------------------------
function renderProducts() {
  const packs = Pricing.packs(A.tenant);
  $('products-list').innerHTML = A.products.length ? A.products.map(p => {
    const cat = catOf(p.category_id);
    const total = p.variants.reduce((s, v) => s + v.stock, 0);
    return `
    <div class="product-card" style="cursor:default; ${p.active ? '' : 'opacity:0.6;'}">
      <div class="product-img-wrap" style="cursor:pointer;" onclick="quickPhoto('${p.id}')" title="Cambiar foto">
        <img src="${esc(p.image_url)}" alt="" onerror="this.style.minHeight='200px'">
        <span class="badge" style="background:rgba(0,0,0,0.6); color:#fff;">📷 Cambiar foto</span>
        ${p.active ? '' : '<span class="badge badge-out" style="left:auto; right:10px;">Oculto</span>'}
      </div>
      <div style="padding:12px;">
        <p style="font-size:11px; color:var(--text-sec); font-weight:700; text-transform:uppercase;">${cat ? `${esc(cat.emoji)} ${esc(cat.name)}` : 'Sin categoría'}</p>
        <p style="font-size:14px; font-weight:800; margin:2px 0;">${esc(p.name)}</p>
        <p style="font-size:16px; font-weight:900; color:var(--accent);">${afmt(p.price)} <span style="font-size:11px; color:var(--text-sec);">c/u</span></p>
        ${packs.map(pk => `<p style="font-size:11px; font-weight:700; color:#d6335a;">${esc(pk.label)} x${pk.units}: ${afmt(Pricing.packTotal(A.tenant, pk, p.price))}</p>`).join('')}
        <p style="font-size:12px; font-weight:700; color:var(--text-sec); margin:6px 0 10px;">
          ${p.variants.length ? sortSizes(p.variants.map(v => v.size)).map(s => `${esc(s)}: ${p.variants.find(v => v.size === s).stock}`).join(' · ') : 'Sin talles'} · <b>${total} u.</b>
        </p>
        <div class="flex gap-2 flex-wrap">
          <button class="btn btn-primary" style="font-size:12px; padding:8px 12px;" onclick="openProductForm('${p.id}')">Editar</button>
          <button class="btn btn-soft" style="font-size:12px; padding:8px 12px;" onclick="toggleProductActive('${p.id}')">${p.active ? 'Ocultar' : 'Mostrar'}</button>
        </div>
      </div>
    </div>`;
  }).join('') : '<p class="hint">Todavía no hay productos. Tocá "+ Nuevo producto".</p>';
}

function openProductForm(id) {
  if (!A.categories.length) {
    showTab('categories');
    return showToast('Primero creá una categoría', 'warn');
  }
  const p = id ? A.products.find(x => sameId(x.id, id)) : null;
  A.form = { id: p ? p.id : newUuid(), isNew: !p, file: null, imageUrl: p?.image_url || '', oldImageUrl: p?.image_url || '' };

  $('pf-title').textContent = p ? 'Editar producto' : 'Nuevo producto';
  $('pf-name').value = p?.name || '';
  $('pf-category').innerHTML = A.categories.map(c => `<option value="${c.id}">${esc(c.emoji)} ${esc(c.name)}</option>`).join('');
  $('pf-category').value = p?.category_id || (A.invCategory !== 'all' && catOf(A.invCategory) ? A.invCategory : A.categories[0].id);
  $('pf-price-label').textContent = `Precio por unidad (${A.tenant.currency_code})`;
  $('pf-price').value = p?.price ?? '';
  $('pf-desc').value = p?.description || '';
  $('pf-active').checked = p ? p.active : true;
  $('pf-delete').style.display = p ? 'inline-block' : 'none';

  const sizes = sortSizes([...new Set([...sizesOrder(), ...(p?.variants || []).map(v => v.size)])]);
  $('pf-sizes').innerHTML = sizes.map((s, i) => {
    const v = p?.variants.find(x => x.size === s);
    return `
      <label class="flex items-center gap-2" style="background:#f5f5f7; border-radius:12px; padding:6px 10px;">
        <input type="checkbox" data-size-check="${i}" ${v || !p ? 'checked' : ''} onchange="this.parentElement.querySelector('input[type=number]').disabled=!this.checked">
        <span style="font-weight:900; min-width:28px;" data-size-name="${i}">${esc(s)}</span>
        <input type="number" min="0" class="stock-input" style="width:60px;" data-size-stock="${i}" value="${v ? v.stock : 0}" ${v || !p ? '' : 'disabled'} aria-label="Stock talle ${esc(s)}">
      </label>`;
  }).join('');

  setFormPreview(A.form.imageUrl);
  renderPackPreview();
  showModal('product-form-modal');
}

function renderPackPreview() {
  const price = parseFloat($('pf-price').value);
  $('pf-pack-preview').textContent = price > 0
    ? Pricing.packs(A.tenant).map(pk => `${pk.label} x${pk.units}: ${afmt(Pricing.packTotal(A.tenant, pk, price))}`).join(' · ')
    : '';
}

function setFormPreview(src) {
  $('pf-preview').style.display = src ? 'block' : 'none';
  $('pf-drop-empty').style.display = src ? 'none' : 'block';
  if (src) $('pf-preview').src = src;
}

function pickProductPhoto(file) {
  if (!file) return;
  if (!file.type.startsWith('image/')) return showToast('Elegí una imagen (JPG, PNG o WEBP)', 'warn');
  if (file.size > 15 * 1024 * 1024) return showToast('La foto pesa más de 15 MB', 'warn');
  A.form.file = file;
  setFormPreview(URL.createObjectURL(file));
  $('pf-file').value = '';
}

function clearProductPhoto() {
  A.form.file = null;
  A.form.imageUrl = '';
  setFormPreview('');
}

// Arrastrar y soltar la foto sobre el recuadro
(() => {
  const dz = () => $('pf-dropzone');
  document.addEventListener('dragover', e => { if (dz()?.contains(e.target)) { e.preventDefault(); dz().classList.add('drag-over'); } });
  document.addEventListener('dragleave', e => { if (dz()?.contains(e.target)) dz().classList.remove('drag-over'); });
  document.addEventListener('drop', e => {
    if (!dz()?.contains(e.target)) return;
    e.preventDefault();
    dz().classList.remove('drag-over');
    pickProductPhoto(e.dataTransfer.files[0]);
  });
})();

function readFormVariants() {
  return [...document.querySelectorAll('[data-size-check]')]
    .filter(chk => chk.checked)
    .map(chk => {
      const i = chk.dataset.sizeCheck;
      return {
        size: document.querySelector(`[data-size-name="${i}"]`).textContent,
        stock: Math.max(0, parseInt(document.querySelector(`[data-size-stock="${i}"]`).value, 10) || 0)
      };
    });
}

async function saveProductForm() {
  const f = A.form;
  const product = {
    id: f.id,
    name: val('pf-name'),
    category_id: $('pf-category').value,
    price: parseFloat($('pf-price').value),
    description: val('pf-desc'),
    active: $('pf-active').checked,
    image_url: f.imageUrl
  };
  const variants = readFormVariants();
  if (!product.name) return showToast('Poné un nombre', 'warn');
  if (!(product.price > 0)) return showToast('Poné un precio mayor a 0', 'warn');
  if (!variants.length) return showToast('Marcá al menos un talle', 'warn');

  const btn = $('pf-save');
  btn.disabled = true;
  btn.textContent = f.file ? 'Subiendo foto…' : 'Guardando…';
  try {
    if (f.file) product.image_url = await Data.uploadImage(A.tenant, f.id, f.file);
    if (f.isNew) product.sort = A.products.length + 1;
    const saved = await Data.saveProduct(A.tenant, product, variants);
    if (f.oldImageUrl && f.oldImageUrl !== saved.image_url) Data.removeImage(f.oldImageUrl).catch(() => {});
    const i = A.products.findIndex(p => sameId(p.id, saved.id));
    if (i >= 0) A.products[i] = saved; else A.products.push(saved);
    closeModal('product-form-modal');
    renderAll();
    showToast(f.isNew ? 'Producto creado ✓' : 'Producto actualizado ✓', 'success');
  } catch(e) {
    console.error(e);
    showToast('No se pudo guardar: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Guardar producto';
  }
}

async function deleteProductForm() {
  const f = A.form;
  try {
    await Data.deleteProduct(A.tenant, f.id);
    if (f.oldImageUrl) Data.removeImage(f.oldImageUrl).catch(() => {});
    A.products = A.products.filter(p => !sameId(p.id, f.id));
    closeModal('product-form-modal');
    renderAll();
    showToast('Producto eliminado', 'success');
  } catch(e) {
    showToast('No se pudo eliminar: ' + e.message, 'error');
  }
}

async function toggleProductActive(id) {
  const p = A.products.find(x => sameId(x.id, id));
  try {
    const saved = await Data.saveProduct(A.tenant, { ...p, active: !p.active }, p.variants);
    Object.assign(p, saved);
    renderAll();
    showToast(p.active ? 'Producto visible en la tienda' : 'Producto oculto', 'success');
  } catch(e) {
    showToast('Error: ' + e.message, 'error');
  }
}

// Cambio rápido de foto: clic sobre la foto en la lista de productos
function quickPhoto(id) {
  A.quickProductId = id;
  $('quick-photo').click();
}

async function quickPhotoPicked(input) {
  const file = input.files[0];
  input.value = '';
  const p = A.products.find(x => sameId(x.id, A.quickProductId));
  if (!file || !p) return;
  showToast('Subiendo foto…');
  try {
    const url = await Data.uploadImage(A.tenant, p.id, file);
    const old = p.image_url;
    const saved = await Data.saveProduct(A.tenant, { ...p, image_url: url }, p.variants);
    Object.assign(p, saved);
    if (old && old !== url) Data.removeImage(old).catch(() => {});
    renderAll();
    showToast('Foto actualizada ✓', 'success');
  } catch(e) {
    showToast('No se pudo subir la foto: ' + e.message, 'error');
  }
}

// ------------------------------------------------------------
// CATEGORÍAS
// ------------------------------------------------------------
function renderCategories() {
  $('categories-table').innerHTML = `
    <thead><tr><th>Emoji</th><th>Nombre</th><th>Orden</th><th>Visible</th><th>Productos</th><th></th></tr></thead>
    <tbody>${A.categories.map(c => {
      const count = A.products.filter(p => sameId(p.category_id, c.id)).length;
      return `<tr>
        <td><input class="field" style="width:60px; padding:8px; text-align:center;" maxlength="4" value="${esc(c.emoji)}" id="cat-emoji-${c.id}" aria-label="Emoji"></td>
        <td><input class="field" style="min-width:180px; padding:8px 12px;" value="${esc(c.name)}" id="cat-name-${c.id}" aria-label="Nombre"></td>
        <td><input type="number" class="field" style="width:70px; padding:8px;" value="${c.sort}" id="cat-sort-${c.id}" aria-label="Orden"></td>
        <td><input type="checkbox" ${c.active ? 'checked' : ''} id="cat-active-${c.id}" aria-label="Visible"></td>
        <td style="font-weight:800;">${count}</td>
        <td style="white-space:nowrap;">
          <button class="btn btn-primary" style="font-size:12px; padding:6px 12px;" onclick="saveCategoryRow('${c.id}')">Guardar</button>
          ${count ? '' : `<button class="btn btn-danger" style="font-size:12px; padding:6px 12px;" onclick="confirmClick(this, () => deleteCategoryRow('${c.id}'))">Eliminar</button>`}
        </td>
      </tr>`;
    }).join('') || '<tr><td colspan="6" style="text-align:center; padding:30px; color:#999;">Sin categorías</td></tr>'}</tbody>`;
}

async function addCategory() {
  const name = val('newcat-name');
  if (!name) return showToast('Escribí el nombre de la categoría', 'warn');
  try {
    const cat = await Data.saveCategory(A.tenant, {
      name, emoji: val('newcat-emoji') || '🏷️', active: true,
      sort: Math.max(0, ...A.categories.map(c => c.sort || 0)) + 1
    });
    A.categories.push(cat);
    $('newcat-name').value = '';
    renderAll();
    showToast('Categoría creada ✓', 'success');
  } catch(e) {
    showToast('Error: ' + e.message, 'error');
  }
}

async function saveCategoryRow(id) {
  const c = catOf(id);
  try {
    const saved = await Data.saveCategory(A.tenant, {
      ...c,
      emoji: val(`cat-emoji-${id}`) || '🏷️',
      name: val(`cat-name-${id}`) || c.name,
      sort: parseInt(val(`cat-sort-${id}`), 10) || 0,
      active: $(`cat-active-${id}`).checked
    });
    Object.assign(c, saved);
    A.categories.sort((a, b) => a.sort - b.sort);
    renderAll();
    showToast('Categoría guardada ✓', 'success');
  } catch(e) {
    showToast('Error: ' + e.message, 'error');
  }
}

async function deleteCategoryRow(id) {
  try {
    await Data.deleteCategory(A.tenant, id);
    A.categories = A.categories.filter(c => !sameId(c.id, id));
    renderAll();
    showToast('Categoría eliminada', 'success');
  } catch(e) {
    showToast(e.message, 'error');
  }
}

// ------------------------------------------------------------
// PEDIDOS
// ------------------------------------------------------------
const ORDER_STATUS = {
  nuevo:      { label: '🆕 Nuevo',       bg: '#e8f0fd', fg: '#004a9f' },
  contactado: { label: '💬 Contactado',  bg: '#fff8e8', fg: '#7a4f00' },
  confirmado: { label: '✓ Venta cerrada', bg: '#e8f8f0', fg: '#1a7f3a' },
  cancelado:  { label: '✕ Cancelado',    bg: '#f5f5f7', fg: '#999' }
};

async function loadOrders() {
  try {
    A.orders = await Data.listOrders(A.tenant);
  } catch(e) {
    console.error(e);
    showToast('No se pudieron cargar los pedidos: ' + e.message, 'error');
  }
  renderOrders();
  renderKpis();
}

function renderOrders() {
  const counts = s => A.orders.filter(o => s === 'all' || o.status === s).length;
  $('orders-filter').innerHTML = [['nuevo', 'Nuevos'], ['contactado', 'Contactados'], ['confirmado', 'Cerrados'], ['cancelado', 'Cancelados'], ['all', 'Todos']]
    .map(([k, l]) => `<button class="pill-tab ${A.orderFilter === k ? 'active' : ''}" onclick="A.orderFilter='${k}'; renderOrders()">${l} (${counts(k)})</button>`).join('');

  const list = A.orders.filter(o => A.orderFilter === 'all' || o.status === A.orderFilter);
  const btn = 'font-size:12px; padding:5px 10px; margin:2px;';
  $('orders-table').innerHTML = `
    <thead><tr><th>Pedido</th><th>Cliente</th><th>Detalle</th><th>Total</th><th>Estado</th><th>Fecha</th><th>Acciones</th></tr></thead>
    <tbody>${list.map(o => {
      const st = ORDER_STATUS[o.status] || { label: esc(o.status), bg: '#f0f0f5', fg: '#666' };
      const open = o.status === 'nuevo' || o.status === 'contactado';
      const detail = (o.items || []).map(i => `${Pricing.describe(i.mode, i.qty, i.units, i.pack)} ${esc(i.name)} · ${esc(i.size)}`).join('<br>');
      return `<tr>
        <td style="font-size:11px; font-family:monospace; font-weight:700;">${esc(o.ref)}</td>
        <td style="font-size:13px; font-weight:700; min-width:150px;">${esc(o.customer_name)}
          <div class="hint" style="margin:0;">+${esc(o.customer_phone)}</div>
          <div class="hint" style="margin:0;">${esc(o.customer_location)} · ${esc(o.delivery_method)}</div></td>
        <td style="font-size:12px; font-weight:600; min-width:200px;">${detail}${o.notes ? `<div class="hint">📝 ${esc(o.notes)}</div>` : ''}</td>
        <td style="font-weight:800; white-space:nowrap;">${afmt(o.total)}${Number(o.discount) ? `<div style="font-size:11px; color:#d6335a;">−${afmt(o.discount)} mayorista</div>` : ''}</td>
        <td><span style="background:${st.bg}; color:${st.fg}; padding:4px 10px; border-radius:99px; font-size:11px; font-weight:800; white-space:nowrap;">${st.label}</span></td>
        <td style="font-size:12px; color:var(--text-sec); white-space:nowrap;">${new Date(o.created_at).toLocaleString(A.tenant.locale, { dateStyle: 'short', timeStyle: 'short' })}</td>
        <td style="min-width:170px;">
          <button class="btn btn-wa" style="${btn}" onclick="contactCustomer('${o.id}')">💬 Contactar</button>
          ${o.status === 'nuevo' ? `<button class="btn" style="${btn} background:#fff8e8; color:#7a4f00;" onclick="setOrderStatus('${o.id}', 'contactado')">Contactado</button>` : ''}
          ${open ? `<button class="btn" style="${btn} background:#e8f8f0; color:#1a7f3a;" onclick="confirmClick(this, () => setOrderStatus('${o.id}', 'confirmado'))">✓ Venta cerrada</button>
                    <button class="btn btn-soft" style="${btn}" onclick="confirmClick(this, () => setOrderStatus('${o.id}', 'cancelado'))">Cancelar</button>` : ''}
        </td>
      </tr>`;
    }).join('') || '<tr><td colspan="7" style="text-align:center; padding:40px; color:#999;">Sin pedidos en este estado</td></tr>'}</tbody>`;
}

function contactCustomer(id) {
  const o = A.orders.find(x => sameId(x.id, id));
  if (!o) return;
  const text = `¡Hola ${o.customer_name.split(' ')[0]}! Te escribimos de ${A.tenant.name} por tu pedido ${o.ref} de ${afmt(o.total)}. ` +
    'Te confirmamos disponibilidad y te pasamos los datos para el pago y el envío.';
  window.open(whatsappUrl(o.customer_phone, text), '_blank');
}

// "confirmado" = venta cerrada: descuenta el stock de cada talle del pedido
async function setOrderStatus(id, status) {
  try {
    await Data.setOrderStatus(A.tenant, id, status);
    showToast(status === 'confirmado' ? 'Venta cerrada ✓ Stock actualizado' : `Pedido: ${ORDER_STATUS[status].label}`, 'success');
    await loadOrders();
    if (status === 'confirmado') await loadCatalog();
  } catch(e) {
    showToast('Error: ' + e.message, 'error');
  }
}

// ------------------------------------------------------------
// CONFIGURACIÓN
// ------------------------------------------------------------
function fillConfigForm() {
  const t = A.tenant, b = t.brand || {};
  $('cfg-name').value = t.name;
  $('cfg-emoji').value = b.emoji || '';
  $('cfg-kicker').value = b.kicker || '';
  $('cfg-title').value = b.title || '';
  $('cfg-subtitle').value = b.subtitle || '';
  $('cfg-whatsapp').value = '+' + t.whatsapp_number;
  $('cfg-whatsapp').oninput = previewWhatsApp;
  previewWhatsApp();
  $('cfg-currency').innerHTML = CURRENCY_PRESETS.map(c =>
    `<option value="${c.code}" ${c.code === t.currency_code ? 'selected' : ''}>${c.code} · ${c.name}</option>`).join('');
  previewCurrency();
  $('cfg-sizes').value = (t.sizes || []).join(', ');
  $('cfg-low').value = t.low_stock_threshold;
  renderPackRows(t.packs || []);
}

function currencyFromForm() {
  const c = CURRENCY_PRESETS.find(x => x.code === $('cfg-currency').value) || CURRENCY_PRESETS[0];
  return { currency_code: c.code, locale: c.locale, country: c.country, currency_decimals: c.decimals };
}

function previewCurrency() {
  $('cfg-currency-preview').textContent = 'Así se verán los precios: ' + money(currencyFromForm(), 12345.5);
}

function previewWhatsApp() {
  const n = normalizeWaNumber(val('cfg-whatsapp'), currencyFromForm().country);
  $('cfg-whatsapp-preview').textContent = isValidWaNumber(n) ? `Se guardará como wa.me/${n}` : 'Número incompleto o inválido';
}

function testWhatsApp() {
  const n = normalizeWaNumber(val('cfg-whatsapp'), currencyFromForm().country);
  if (!isValidWaNumber(n)) return showToast('Número de WhatsApp inválido', 'warn');
  window.open(whatsappUrl(n, `Prueba de pedido desde la tienda ${val('cfg-name')} ✅`), '_blank');
}

const PACK_PRESETS = {
  curva: [{ label: 'Curva', plural: 'Curvas', units: 5, discount_pct: 10 }],
  docenas: [
    { label: 'Media docena', plural: 'Medias docenas', units: 6, discount_pct: 5 },
    { label: 'Docena', plural: 'Docenas', units: 12, discount_pct: 10 }
  ],
  none: []
};

function renderPackRows(packs) {
  $('cfg-packs').innerHTML = packs.map(pk => packRowHtml(pk)).join('') ||
    '<p class="hint" id="no-packs">Solo venta por unidad.</p>';
}

function packRowHtml(pk = { label: '', plural: '', units: 5, discount_pct: 10 }) {
  return `<div class="pack-row" data-pack-row>
    <input class="field" style="padding:8px 12px;" placeholder="Curva" value="${esc(pk.label)}" data-f="label" aria-label="Nombre">
    <input class="field" style="padding:8px 12px;" placeholder="Curvas" value="${esc(pk.plural)}" data-f="plural" aria-label="Plural">
    <input class="field" style="padding:8px 12px;" type="number" min="2" value="${pk.units}" data-f="units" aria-label="Unidades">
    <input class="field" style="padding:8px 12px;" type="number" min="0" max="90" step="0.5" value="${pk.discount_pct}" data-f="discount_pct" aria-label="Descuento">
    <button class="btn btn-danger" style="padding:8px 12px;" onclick="this.parentElement.remove()" aria-label="Quitar">✕</button>
  </div>`;
}

function addPackRow() {
  $('no-packs')?.remove();
  $('cfg-packs').insertAdjacentHTML('beforeend', packRowHtml());
}

function packPreset(name) {
  renderPackRows(PACK_PRESETS[name]);
}

const slugify = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function readPacks() {
  const packs = [...document.querySelectorAll('[data-pack-row]')].map(row => {
    const f = k => row.querySelector(`[data-f="${k}"]`).value.trim();
    const label = f('label');
    return { key: slugify(label), label, plural: f('plural') || label + 's', units: parseInt(f('units'), 10), discount_pct: parseFloat(f('discount_pct')) || 0 };
  });
  for (const p of packs) {
    if (!p.label) throw new Error('Cada forma de venta necesita un nombre');
    if (!(p.units >= 2)) throw new Error(`"${p.label}": las unidades deben ser 2 o más`);
    if (p.discount_pct < 0 || p.discount_pct > 90) throw new Error(`"${p.label}": el descuento debe estar entre 0 y 90%`);
  }
  if (new Set(packs.map(p => p.key)).size !== packs.length) throw new Error('Hay dos formas de venta con el mismo nombre');
  return packs;
}

async function saveConfig() {
  let patch;
  try {
    const currency = currencyFromForm();
    const whatsapp = normalizeWaNumber(val('cfg-whatsapp'), currency.country);
    if (!isValidWaNumber(whatsapp)) throw new Error('Número de WhatsApp inválido');
    const sizes = [...new Set(val('cfg-sizes').split(',').map(s => s.trim()).filter(Boolean))];
    if (!sizes.length) throw new Error('Cargá al menos un talle');
    patch = {
      name: val('cfg-name') || A.tenant.name,
      brand: { emoji: val('cfg-emoji'), kicker: val('cfg-kicker'), title: val('cfg-title'), subtitle: val('cfg-subtitle') },
      whatsapp_number: whatsapp,
      ...currency,
      sizes,
      packs: readPacks(),
      low_stock_threshold: Math.max(0, parseInt(val('cfg-low'), 10) || 0)
    };
  } catch(e) {
    return showToast(e.message, 'warn');
  }
  try {
    A.tenant = await Data.updateTenant(A.tenant, patch);
    applyBranding(A.tenant);
    document.title = `Backoffice · ${A.tenant.name}`;
    fillConfigForm();
    renderAll();
    showToast('Configuración guardada ✓', 'success');
  } catch(e) {
    showToast('No se pudo guardar: ' + e.message, 'error');
  }
}

function resetDemo() {
  DemoBackend.reset(A.tenant.slug);
  location.reload();
}
