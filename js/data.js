// ============================================================
// CAPA DE DATOS — la misma interfaz para Supabase (producción) y demo (navegador).
// La tienda y el backoffice solo usan `Data.*`; nunca llaman a Supabase directo.
// ============================================================

const sortBy = key => (a, b) => (a[key] ?? 0) - (b[key] ?? 0) || String(a.name).localeCompare(String(b.name));

// ------------------------------------------------------------
// DEMO: datos en localStorage de este navegador (uno por tienda)
// ------------------------------------------------------------
const DemoBackend = {
  isDemo: true,
  _key: slug => `demo_db_${slug}`,

  _db(slug) {
    let db = store.get(this._key(slug), null);
    if (!db) {
      const seed = window.DEMO_TENANTS?.[slug];
      if (!seed) return null;
      db = JSON.parse(JSON.stringify(seed));
      db.orders = [];
      this._save(db);
    }
    return db;
  },
  _save(db) {
    if (!store.set(this._key(db.tenant.slug), db)) {
      throw new Error('No hay espacio en el navegador para guardar (probá con fotos más livianas)');
    }
  },

  async loadTenant(slug) {
    return this._db(slug)?.tenant || null;
  },

  async loadCatalog(tenant, { admin = false } = {}) {
    const db = this._db(tenant.slug);
    const categories = db.categories.filter(c => admin || c.active).sort(sortBy('sort'));
    const products = db.products
      .filter(p => admin || p.active)
      .map(p => ({ ...p, variants: [...p.variants] }))
      .sort(sortBy('sort'));
    return { categories, products };
  },

  async createOrder(tenant, order) {
    const db = this._db(tenant.slug);
    db.orders.unshift({ ...order, tenant_id: tenant.id, created_at: new Date().toISOString() });
    db.orders = db.orders.slice(0, 200);
    this._save(db);
  },

  async session() { return { email: 'demo@local' }; },
  async signIn() {},
  async signOut() {},
  async canManage() { return true; },

  async updateTenant(tenant, patch) {
    const db = this._db(tenant.slug);
    Object.assign(db.tenant, patch);
    this._save(db);
    return { ...db.tenant };
  },

  async saveCategory(tenant, cat) {
    const db = this._db(tenant.slug);
    const row = { active: true, sort: db.categories.length + 1, emoji: '🏷️', ...cat, id: cat.id || newUuid() };
    const i = db.categories.findIndex(c => sameId(c.id, row.id));
    if (i >= 0) db.categories[i] = { ...db.categories[i], ...row }; else db.categories.push(row);
    this._save(db);
    return row;
  },

  async deleteCategory(tenant, id) {
    const db = this._db(tenant.slug);
    if (db.products.some(p => sameId(p.category_id, id))) throw new Error('La categoría tiene productos: movelos o desactivala');
    db.categories = db.categories.filter(c => !sameId(c.id, id));
    this._save(db);
  },

  async saveProduct(tenant, product, variants) {
    const db = this._db(tenant.slug);
    const i = db.products.findIndex(p => sameId(p.id, product.id));
    const prev = i >= 0 ? db.products[i] : null;
    const row = {
      sort: db.products.length + 1, ...prev, ...product,
      variants: variants.map(v => ({
        id: prev?.variants.find(x => x.size === v.size)?.id || newUuid(),
        size: v.size, stock: v.stock
      }))
    };
    if (i >= 0) db.products[i] = row; else db.products.push(row);
    this._save(db);
    return row;
  },

  async deleteProduct(tenant, id) {
    const db = this._db(tenant.slug);
    db.products = db.products.filter(p => !sameId(p.id, id));
    this._save(db);
  },

  async setStock(tenant, variantId, stock) {
    const db = this._db(tenant.slug);
    for (const p of db.products) {
      const v = p.variants.find(x => sameId(x.id, variantId));
      if (v) { v.stock = stock; this._save(db); return; }
    }
    throw new Error('Talle no encontrado');
  },

  // En demo la foto se guarda dentro del navegador: se achica más para que entre
  async uploadImage(tenant, productId, file) {
    return blobToDataUrl(await resizeImage(file, 700, 0.8));
  },
  async removeImage() {},

  async listOrders(tenant) {
    return this._db(tenant.slug).orders;
  },

  async setOrderStatus(tenant, orderId, status) {
    const db = this._db(tenant.slug);
    const o = db.orders.find(x => sameId(x.id, orderId));
    if (!o) throw new Error('Pedido no encontrado');
    if (status === 'confirmado') {
      if (!['nuevo', 'contactado'].includes(o.status)) throw new Error('El pedido ya fue cerrado o cancelado');
      for (const it of o.items) {
        for (const p of db.products) {
          const v = p.variants.find(x => sameId(x.id, it.variant_id));
          if (v) v.stock = Math.max(0, v.stock - it.units);
        }
      }
    }
    o.status = status;
    this._save(db);
  },

  reset(slug) {
    store.remove(this._key(slug));
  }
};

// ------------------------------------------------------------
// SUPABASE: producción. La seguridad la dan las políticas RLS (supabase/schema.sql)
// ------------------------------------------------------------
const SupabaseBackend = {
  isDemo: false,
  _sb: null,
  get sb() {
    if (!this._sb) this._sb = window.supabase.createClient(APP_CONFIG.supabaseUrl, APP_CONFIG.supabaseAnonKey);
    return this._sb;
  },
  _check({ data, error }) {
    if (error) throw new Error(error.message);
    return data;
  },

  async loadTenant(slug) {
    return this._check(await this.sb.from('tenants').select('*').eq('slug', slug).maybeSingle());
  },

  async loadCatalog(tenant, { admin = false } = {}) {
    const [cats, prods] = await Promise.all([
      this.sb.from('categories').select('*').eq('tenant_id', tenant.id).order('sort'),
      this.sb.from('products').select('*, variants(*)').eq('tenant_id', tenant.id).order('sort')
    ]);
    const categories = this._check(cats).filter(c => admin || c.active).sort(sortBy('sort'));
    const products = this._check(prods).filter(p => admin || p.active).sort(sortBy('sort'));
    return { categories, products };
  },

  async createOrder(tenant, order) {
    // Sin .select(): el público puede crear pedidos pero no leerlos
    this._check(await this.sb.from('orders').insert([{ ...order, tenant_id: tenant.id }]));
  },

  async session() {
    const { data } = await this.sb.auth.getSession();
    return data.session ? { email: data.session.user.email } : null;
  },
  async signIn(email) {
    // shouldCreateUser:false → solo entran usuarios invitados desde Supabase
    this._check(await this.sb.auth.signInWithOtp({
      email, options: { emailRedirectTo: location.href, shouldCreateUser: false }
    }));
  },
  async signOut() { await this.sb.auth.signOut(); },
  async canManage(tenant) {
    return !!this._check(await this.sb.rpc('is_tenant_admin', { p_tenant: tenant.id }));
  },
  onAuthChange(cb) { this.sb.auth.onAuthStateChange((_e, s) => cb(s)); },

  async updateTenant(tenant, patch) {
    return this._check(await this.sb.from('tenants').update(patch).eq('id', tenant.id).select().single());
  },

  async saveCategory(tenant, cat) {
    const row = { ...cat, id: cat.id || newUuid(), tenant_id: tenant.id };
    return this._check(await this.sb.from('categories').upsert(row).select().single());
  },

  async deleteCategory(tenant, id) {
    const { count } = await this.sb.from('products').select('id', { count: 'exact', head: true }).eq('category_id', id);
    if (count) throw new Error('La categoría tiene productos: movelos o desactivala');
    this._check(await this.sb.from('categories').delete().eq('id', id));
  },

  async saveProduct(tenant, product, variants) {
    const { variants: _omit, ...fields } = product;
    this._check(await this.sb.from('products').upsert({ ...fields, tenant_id: tenant.id }));
    const sizes = variants.map(v => v.size);
    if (variants.length) {
      this._check(await this.sb.from('variants').upsert(
        variants.map(v => ({ tenant_id: tenant.id, product_id: product.id, size: v.size, stock: v.stock })),
        { onConflict: 'product_id,size' }
      ));
    }
    const existing = this._check(await this.sb.from('variants').select('id,size').eq('product_id', product.id));
    const removed = existing.filter(v => !sizes.includes(v.size)).map(v => v.id);
    if (removed.length) this._check(await this.sb.from('variants').delete().in('id', removed));
    return this._check(await this.sb.from('products').select('*, variants(*)').eq('id', product.id).single());
  },

  async deleteProduct(tenant, id) {
    this._check(await this.sb.from('products').delete().eq('id', id));
  },

  async setStock(tenant, variantId, stock) {
    this._check(await this.sb.from('variants').update({ stock }).eq('id', variantId));
  },

  async uploadImage(tenant, productId, file) {
    const blob = await resizeImage(file, 1200, 0.85);
    const path = `${tenant.id}/${productId}/${Date.now()}.jpg`;
    const bucket = this.sb.storage.from('product-images');
    this._check(await bucket.upload(path, blob, { contentType: 'image/jpeg', upsert: false }));
    return bucket.getPublicUrl(path).data.publicUrl;
  },

  // Borra la foto anterior al reemplazarla (solo si está en nuestro bucket)
  async removeImage(url) {
    const marker = '/object/public/product-images/';
    const i = String(url || '').indexOf(marker);
    if (i < 0) return;
    await this.sb.storage.from('product-images').remove([decodeURIComponent(url.slice(i + marker.length))]);
  },

  async listOrders(tenant) {
    return this._check(await this.sb.from('orders').select('*')
      .eq('tenant_id', tenant.id).order('created_at', { ascending: false }).limit(200));
  },

  async setOrderStatus(tenant, orderId, status) {
    this._check(status === 'confirmado'
      ? await this.sb.rpc('confirm_order', { p_order: orderId })
      : await this.sb.from('orders').update({ status }).eq('id', orderId));
  }
};

const Data = IS_LIVE ? SupabaseBackend : DemoBackend;
