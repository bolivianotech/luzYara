-- ============================================================
--  luzYara / PijamaKids — Esquema PoC "checkout por WhatsApp"
--  Catálogo en ARS + venta por unidad / por curva + pedidos que
--  se cierran por WhatsApp.
--
--  Ejecutar en:  Supabase Dashboard → SQL Editor → New query → Run
--  Es idempotente: se puede volver a correr sin romper nada.
-- ============================================================

-- ------------------------------------------------------------
--  ADMINS — quién puede gestionar la tienda
--  Cargá acá el/los email(s) del dueño (ver paso 4 de la guía).
-- ------------------------------------------------------------
create table if not exists public.admins (
  email text primary key
);
alter table public.admins enable row level security;
-- Sin políticas: nadie la lee desde el navegador. Solo la usa is_admin().

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.admins
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

-- ------------------------------------------------------------
--  STORE SETTINGS — una sola fila (id = 1)
-- ------------------------------------------------------------
create table if not exists public.store_settings (
  id                  int primary key default 1 check (id = 1),
  store_name          text not null default 'PijamaKids',
  whatsapp_number     text not null default '5491100000000',  -- 549 + área + número
  curve_size          int  not null default 5  check (curve_size >= 2),
  curve_discount_pct  numeric(5,2) not null default 10 check (curve_discount_pct between 0 and 90),
  low_stock_threshold int  not null default 5,
  updated_at          timestamptz not null default now()
);
insert into public.store_settings (id) values (1) on conflict (id) do nothing;

alter table public.store_settings enable row level security;

drop policy if exists "settings_public_read" on public.store_settings;
create policy "settings_public_read"
  on public.store_settings for select
  to anon, authenticated
  using (true);

drop policy if exists "settings_admin_write" on public.store_settings;
create policy "settings_admin_write"
  on public.store_settings for all
  to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ------------------------------------------------------------
--  PRODUCTS — precio por unidad en pesos argentinos.
--  El precio por curva NO se guarda: se calcula con store_settings.
-- ------------------------------------------------------------
create table if not exists public.products (
  id          uuid primary key default gen_random_uuid(),
  name        text    not null,
  category    text    not null,
  size        text    not null default 'U',
  price_ars   numeric(12,2) not null default 0,
  stock       integer not null default 0 check (stock >= 0),
  description text    default '',
  image_url   text    default '',
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

alter table public.products enable row level security;

drop policy if exists "products_public_read" on public.products;
create policy "products_public_read"
  on public.products for select
  to anon, authenticated
  using (active = true or public.is_admin());

drop policy if exists "products_admin_write" on public.products;
create policy "products_admin_write"
  on public.products for all
  to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ------------------------------------------------------------
--  ORDERS — cada "Enviar pedido por WhatsApp" deja un registro acá.
--  El pago y el envío se coordinan por WhatsApp; el admin cambia el estado.
-- ------------------------------------------------------------
create table if not exists public.orders (
  id                 uuid primary key default gen_random_uuid(),
  ref                text not null unique,                  -- PK-AAMMDD-XXXX (el que ve el cliente)
  customer_name      text not null,
  customer_phone     text not null,                         -- formato wa.me: 549...
  customer_location  text not null,
  delivery_method    text,
  notes              text,
  items              jsonb not null default '[]'::jsonb,    -- [{id,name,size,mode,qty,units,unit_price,discount,total}]
  units              int  not null default 0,
  subtotal           numeric(14,2) not null default 0,
  discount           numeric(14,2) not null default 0,
  total              numeric(14,2) not null default 0,
  curve_size         int,
  curve_discount_pct numeric(5,2),
  currency           text not null default 'ARS' check (currency = 'ARS'),
  channel            text not null default 'whatsapp',
  status             text not null default 'nuevo'
                     check (status in ('nuevo', 'contactado', 'confirmado', 'cancelado')),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

alter table public.orders enable row level security;

-- El público solo puede CREAR pedidos nuevos (no leerlos ni modificarlos).
-- Los montos los calcula el navegador: son una referencia; el precio final
-- se confirma por WhatsApp antes de cobrar.
drop policy if exists "orders_public_insert" on public.orders;
create policy "orders_public_insert"
  on public.orders for insert
  to anon, authenticated
  with check (status = 'nuevo' and channel = 'whatsapp');

drop policy if exists "orders_admin_read" on public.orders;
create policy "orders_admin_read"
  on public.orders for select
  to authenticated
  using (public.is_admin());

drop policy if exists "orders_admin_update" on public.orders;
create policy "orders_admin_update"
  on public.orders for update
  to authenticated
  using (public.is_admin()) with check (public.is_admin());

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_orders_touch on public.orders;
create trigger trg_orders_touch
  before update on public.orders
  for each row execute function public.touch_updated_at();

-- ------------------------------------------------------------
--  confirm_order — "Venta cerrada" desde el panel:
--  marca el pedido como confirmado y descuenta el stock, todo junto.
-- ------------------------------------------------------------
create or replace function public.confirm_order(p_order uuid)
returns void
language plpgsql security invoker set search_path = public as $$
declare
  it jsonb;
begin
  if not public.is_admin() then
    raise exception 'Solo el admin puede confirmar pedidos';
  end if;

  update public.orders set status = 'confirmado'
   where id = p_order and status in ('nuevo', 'contactado');
  if not found then
    raise exception 'El pedido no existe o ya fue cerrado';
  end if;

  for it in select * from jsonb_array_elements((select items from public.orders where id = p_order)) loop
    update public.products
       set stock = greatest(0, stock - (it ->> 'units')::int)
     where id::text = it ->> 'id';
  end loop;
end;
$$;

-- ------------------------------------------------------------
--  SEED — productos de ejemplo en ARS. Borralos cuando cargues los reales.
-- ------------------------------------------------------------
insert into public.products (name, category, size, price_ars, stock, description)
select * from (values
  ('Pijama Osa Rosa - Talla S',      'osa',      'S', 32000, 8, 'Pijama enterizo de polar suave. Capucha con orejitas de osa. Talla S (1-2 años).'),
  ('Pijama Osa Rosa - Talla M',      'osa',      'M', 34500, 4, 'Pijama enterizo de polar suave. Capucha con orejitas de osa. Talla M (2-3 años).'),
  ('Pijama Oso Café - Talla S',      'oso',      'S', 32500, 6, 'Pijama enterizo café chocolate. Capucha con cara de osito. Talla S (1-2 años).'),
  ('Pijama Monstruo Rojo - Talla M', 'monstruo', 'M', 36000, 5, 'Pijama monstruo rojo con capucha de dientes. Talla M (2-3 años).'),
  ('Pijama Pikachu - Talla S',       'pikachu',  'S', 36500, 7, 'Pijama Pikachu amarillo. Orejas puntiagudas. Talla S (1-2 años).')
) as seed(name, category, size, price_ars, stock, description)
where not exists (select 1 from public.products);
