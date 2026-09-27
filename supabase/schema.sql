-- ============================================================
--  Tienda WhatsApp — Esquema MULTITENANT (v2.1)
--  Una sola base de datos para varias tiendas (LuzYara, PrendasMichell, ...).
--  Cada fila pertenece a una tienda (tenant_id) y las políticas RLS impiden
--  que el admin de una tienda vea o toque los datos de otra.
--
--  Ejecutar en: Supabase Dashboard → SQL Editor → New query → pegar todo → Run
--  Es idempotente: se puede volver a correr sin perder datos.
--  Después: supabase/seed-luzyara.sql (datos de LuzYara).
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
--  TENANTS — una fila por tienda
-- ------------------------------------------------------------
create table if not exists public.tenants (
  id                  uuid primary key default gen_random_uuid(),
  slug                text not null unique check (slug ~ '^[a-z0-9-]{2,40}$'),  -- luzyara, prendasmichell
  name                text not null,
  active              boolean not null default true,
  country             text not null default 'AR',       -- para normalizar teléfonos (AR, BO, ...)
  currency_code       text not null default 'ARS',      -- ARS, BOB, USD, ...
  locale              text not null default 'es-AR',    -- formato de números
  currency_decimals   int  not null default 0 check (currency_decimals between 0 and 2),
  whatsapp_number     text not null,                    -- formato wa.me, sin "+": 19142223263
  brand               jsonb not null default '{}'::jsonb,   -- {emoji, kicker, title, subtitle}
  sizes               jsonb not null default '["S","M","L","XL"]'::jsonb,
  -- Formas de venta mayorista. Ej. AR: [{"key":"curva","label":"Curva","plural":"Curvas","units":5,"discount_pct":10}]
  -- Ej. BO: media docena (6) y docena (12)
  packs               jsonb not null default '[]'::jsonb,
  low_stock_threshold int  not null default 5,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- ------------------------------------------------------------
--  ADMINISTRADORES
--  platform_admins: nosotros (AIgentic) — gestionan TODAS las tiendas.
--  tenant_admins:   el dueño de cada tienda — solo la suya.
-- ------------------------------------------------------------
create table if not exists public.platform_admins (
  email text primary key
);

create table if not exists public.tenant_admins (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  email     text not null,
  primary key (tenant_id, email)
);

create or replace function public.jwt_email()
returns text language sql stable as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''));
$$;

create or replace function public.is_platform_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.platform_admins where lower(email) = public.jwt_email());
$$;

create or replace function public.is_tenant_admin(p_tenant uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_platform_admin()
      or exists (select 1 from public.tenant_admins
                  where tenant_id = p_tenant and lower(email) = public.jwt_email());
$$;

-- ------------------------------------------------------------
--  CATÁLOGO: categorías → productos → variantes (talle + stock)
-- ------------------------------------------------------------
create table if not exists public.categories (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  name       text not null,
  emoji      text not null default '🏷️',
  sort       int  not null default 0,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists categories_tenant_idx on public.categories(tenant_id);

create table if not exists public.products (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null,
  name        text not null,
  description text not null default '',
  image_url   text not null default '',
  price       numeric(14,2) not null default 0 check (price >= 0),   -- precio por UNIDAD, en la moneda de la tienda
  active      boolean not null default true,
  sort        int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists products_tenant_idx on public.products(tenant_id);

create table if not exists public.variants (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  size       text not null,
  stock      int  not null default 0 check (stock >= 0),
  unique (product_id, size)
);
create index if not exists variants_tenant_idx on public.variants(tenant_id);

-- ------------------------------------------------------------
--  PEDIDOS — cada "Enviar pedido por WhatsApp" deja un registro
-- ------------------------------------------------------------
create table if not exists public.orders (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants(id) on delete cascade,
  ref               text not null,                      -- PED-AAMMDD-XXXX (lo ve el cliente)
  customer_name     text not null,
  customer_phone    text not null,                      -- formato wa.me
  customer_location text not null,
  delivery_method   text,
  notes             text,
  items             jsonb not null default '[]'::jsonb, -- [{variant_id,product_id,name,size,mode,pack_label,qty,units,unit_price,discount,total}]
  units             int not null default 0,
  subtotal          numeric(14,2) not null default 0,
  discount          numeric(14,2) not null default 0,
  total             numeric(14,2) not null default 0,
  currency_code     text not null,
  status            text not null default 'nuevo'
                    check (status in ('nuevo', 'contactado', 'confirmado', 'cancelado')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (tenant_id, ref)
);
create index if not exists orders_tenant_idx on public.orders(tenant_id, created_at desc);

-- ------------------------------------------------------------
--  updated_at automático
-- ------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_tenants_touch on public.tenants;
create trigger trg_tenants_touch before update on public.tenants
  for each row execute function public.touch_updated_at();
drop trigger if exists trg_products_touch on public.products;
create trigger trg_products_touch before update on public.products
  for each row execute function public.touch_updated_at();
drop trigger if exists trg_orders_touch on public.orders;
create trigger trg_orders_touch before update on public.orders
  for each row execute function public.touch_updated_at();

-- ------------------------------------------------------------
--  RLS — seguridad por tienda
-- ------------------------------------------------------------
alter table public.tenants         enable row level security;
alter table public.platform_admins enable row level security;
alter table public.tenant_admins   enable row level security;
alter table public.categories      enable row level security;
alter table public.products        enable row level security;
alter table public.variants        enable row level security;
alter table public.orders          enable row level security;

-- TENANTS: el público lee tiendas activas; el admin de la tienda la edita;
-- crear o borrar tiendas es solo de la plataforma.
drop policy if exists "tenants_read" on public.tenants;
create policy "tenants_read" on public.tenants for select to anon, authenticated
  using (active or public.is_tenant_admin(id));
drop policy if exists "tenants_admin_update" on public.tenants;
create policy "tenants_admin_update" on public.tenants for update to authenticated
  using (public.is_tenant_admin(id)) with check (public.is_tenant_admin(id));
drop policy if exists "tenants_platform_insert" on public.tenants;
create policy "tenants_platform_insert" on public.tenants for insert to authenticated
  with check (public.is_platform_admin());
drop policy if exists "tenants_platform_delete" on public.tenants;
create policy "tenants_platform_delete" on public.tenants for delete to authenticated
  using (public.is_platform_admin());

-- ADMINS: cada uno ve sus filas; solo la plataforma las gestiona.
drop policy if exists "platform_admins_self" on public.platform_admins;
create policy "platform_admins_self" on public.platform_admins for select to authenticated
  using (lower(email) = public.jwt_email());
drop policy if exists "tenant_admins_read" on public.tenant_admins;
create policy "tenant_admins_read" on public.tenant_admins for select to authenticated
  using (lower(email) = public.jwt_email() or public.is_platform_admin());
drop policy if exists "tenant_admins_platform_write" on public.tenant_admins;
create policy "tenant_admins_platform_write" on public.tenant_admins for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

-- CATÁLOGO: el público lee lo activo; el admin de la tienda gestiona todo lo suyo.
drop policy if exists "categories_read" on public.categories;
create policy "categories_read" on public.categories for select to anon, authenticated
  using (active or public.is_tenant_admin(tenant_id));
drop policy if exists "categories_admin" on public.categories;
create policy "categories_admin" on public.categories for all to authenticated
  using (public.is_tenant_admin(tenant_id)) with check (public.is_tenant_admin(tenant_id));

drop policy if exists "products_read" on public.products;
create policy "products_read" on public.products for select to anon, authenticated
  using (active or public.is_tenant_admin(tenant_id));
drop policy if exists "products_admin" on public.products;
create policy "products_admin" on public.products for all to authenticated
  using (public.is_tenant_admin(tenant_id)) with check (public.is_tenant_admin(tenant_id));

drop policy if exists "variants_read" on public.variants;
create policy "variants_read" on public.variants for select to anon, authenticated
  using (true);
drop policy if exists "variants_admin" on public.variants;
create policy "variants_admin" on public.variants for all to authenticated
  using (public.is_tenant_admin(tenant_id)) with check (public.is_tenant_admin(tenant_id));

-- PEDIDOS: el público solo CREA pedidos nuevos en tiendas activas; no puede leerlos.
drop policy if exists "orders_public_insert" on public.orders;
create policy "orders_public_insert" on public.orders for insert to anon, authenticated
  with check (
    status = 'nuevo'
    and exists (select 1 from public.tenants t where t.id = tenant_id and t.active)
  );
drop policy if exists "orders_admin_read" on public.orders;
create policy "orders_admin_read" on public.orders for select to authenticated
  using (public.is_tenant_admin(tenant_id));
drop policy if exists "orders_admin_update" on public.orders;
create policy "orders_admin_update" on public.orders for update to authenticated
  using (public.is_tenant_admin(tenant_id)) with check (public.is_tenant_admin(tenant_id));

-- ------------------------------------------------------------
--  v2.1 — CIERRE DEL CICLO DE VENTA: pago registrado con los datos
--  del comprobante (sin guardar la imagen) y vencimiento de pedidos.
--  Estados: nuevo → contactado → pagado  |  vencido (sin pago a tiempo)  |  cancelado
-- ------------------------------------------------------------
alter table public.tenants add column if not exists order_expiry_hours int not null default 48
  check (order_expiry_hours >= 0);                          -- 0 = los pedidos no vencen
alter table public.tenants add column if not exists payment_instructions text not null default '';  -- alias, CBU, QR...

alter table public.orders add column if not exists payment_method        text;         -- transferencia | qr | efectivo | otro
alter table public.orders add column if not exists payment_reference     text;         -- nº de comprobante / transacción
alter table public.orders add column if not exists payment_bank          text;         -- banco o billetera emisora
alter table public.orders add column if not exists payment_datetime      timestamptz;  -- fecha y hora del comprobante
alter table public.orders add column if not exists payer_name            text;
alter table public.orders add column if not exists payer_account         text;
alter table public.orders add column if not exists payment_amount        numeric(14,2);
alter table public.orders add column if not exists payment_ocr           boolean not null default false;  -- datos leídos por OCR
alter table public.orders add column if not exists payment_registered_by text;
alter table public.orders add column if not exists payment_registered_at timestamptz;

alter table public.orders drop constraint if exists orders_status_check;
update public.orders set status = 'pagado' where status = 'confirmado';   -- nombre anterior (v2.0)
alter table public.orders add constraint orders_status_check
  check (status in ('nuevo', 'contactado', 'pagado', 'vencido', 'cancelado'));

-- Un mismo comprobante no puede cerrar dos pedidos de la misma tienda
create unique index if not exists orders_payment_ref_uniq
  on public.orders (tenant_id, lower(coalesce(payment_bank, '')), payment_reference)
  where payment_reference is not null;

drop function if exists public.confirm_order(uuid);

-- register_payment — "Registrar pago": guarda los datos del comprobante,
-- marca el pedido como pagado y descuenta el stock, todo en una operación.
create or replace function public.register_payment(p_order uuid, p_payment jsonb)
returns void language plpgsql security invoker set search_path = public as $$
declare
  v_tenant uuid;
  v_status text;
  v_ref    text := nullif(trim(p_payment ->> 'reference'), '');
  v_bank   text := nullif(trim(p_payment ->> 'bank'), '');
  v_method text := coalesce(nullif(trim(p_payment ->> 'method'), ''), 'transferencia');
  v_dup    text;
  it       jsonb;
begin
  select tenant_id, status into v_tenant, v_status from public.orders where id = p_order;
  if v_tenant is null or not public.is_tenant_admin(v_tenant) then
    raise exception 'Pedido inexistente o sin permiso';
  end if;
  if v_status not in ('nuevo', 'contactado', 'vencido') then
    raise exception 'El pedido ya está %', v_status;
  end if;
  if v_ref is null and v_method <> 'efectivo' then
    raise exception 'Falta el número de comprobante';
  end if;
  if v_ref is not null then
    select ref into v_dup from public.orders
     where tenant_id = v_tenant and id <> p_order and payment_reference = v_ref
       and lower(coalesce(payment_bank, '')) = lower(coalesce(v_bank, ''))
     limit 1;
    if v_dup is not null then
      raise exception 'Ese comprobante ya se registró en el pedido %', v_dup;
    end if;
  end if;

  update public.orders set
    status                = 'pagado',
    payment_method        = v_method,
    payment_reference     = v_ref,
    payment_bank          = v_bank,
    payment_datetime      = nullif(p_payment ->> 'datetime', '')::timestamptz,
    payer_name            = nullif(trim(p_payment ->> 'payer_name'), ''),
    payer_account         = nullif(trim(p_payment ->> 'payer_account'), ''),
    payment_amount        = nullif(p_payment ->> 'amount', '')::numeric,
    payment_ocr           = coalesce((p_payment ->> 'ocr')::boolean, false),
    payment_registered_by = public.jwt_email(),
    payment_registered_at = now()
  where id = p_order;

  for it in select * from jsonb_array_elements((select items from public.orders where id = p_order)) loop
    update public.variants
       set stock = greatest(0, stock - (it ->> 'units')::int)
     where tenant_id = v_tenant and id::text = it ->> 'variant_id';
  end loop;
end;
$$;

-- expire_orders — marca como "vencido" lo que no se pagó a tiempo.
-- El backoffice la llama cada vez que abre la lista de pedidos.
create or replace function public.expire_orders(p_tenant uuid)
returns int language plpgsql security invoker set search_path = public as $$
declare
  n int;
begin
  if not public.is_tenant_admin(p_tenant) then
    raise exception 'Sin permiso';
  end if;
  update public.orders o set status = 'vencido'
    from public.tenants t
   where t.id = p_tenant and o.tenant_id = t.id
     and t.order_expiry_hours > 0
     and o.status in ('nuevo', 'contactado')
     and o.created_at < now() - make_interval(hours => t.order_expiry_hours);
  get diagnostics n = row_count;
  return n;
end;
$$;

-- ------------------------------------------------------------
--  STORAGE — fotos de productos
--  Ruta: product-images/<tenant_id>/<product_id>/<archivo>.jpg
--  Lectura pública (bucket público); subir/cambiar/borrar solo el admin de esa tienda.
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create or replace function public.can_manage_object(p_name text)
returns boolean language plpgsql stable security definer set search_path = public as $$
begin
  return public.is_tenant_admin(split_part(p_name, '/', 1)::uuid);
exception when others then
  return false;   -- la primera carpeta no es un UUID de tienda
end;
$$;

-- Storage pide SELECT además de DELETE para borrar la foto anterior al reemplazarla
drop policy if exists "product_images_select" on storage.objects;
create policy "product_images_select" on storage.objects for select to authenticated
  using (bucket_id = 'product-images' and public.can_manage_object(name));
drop policy if exists "product_images_insert" on storage.objects;
create policy "product_images_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'product-images' and public.can_manage_object(name));
drop policy if exists "product_images_update" on storage.objects;
create policy "product_images_update" on storage.objects for update to authenticated
  using (bucket_id = 'product-images' and public.can_manage_object(name));
drop policy if exists "product_images_delete" on storage.objects;
create policy "product_images_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'product-images' and public.can_manage_object(name));
