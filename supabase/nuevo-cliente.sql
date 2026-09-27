-- ============================================================
--  PLANTILLA — dar de alta una tienda nueva (ej. PrendasMichell, Bolivia)
--  1. Copiá este archivo, reemplazá los valores marcados con 👈
--  2. Pegalo en Supabase → SQL Editor → Run
--  3. Seguí docs/04-NUEVO-CLIENTE.md (dominio, invitación del admin, etc.)
-- ============================================================
do $$
declare
  v_tenant uuid;
begin
  insert into public.tenants (slug, name, country, currency_code, locale, currency_decimals,
                              whatsapp_number, brand, sizes, packs, low_stock_threshold)
  values (
    'prendasmichell',                 -- 👈 identificador: minúsculas, números y guiones
    'PrendasMichell',                 -- 👈 nombre visible
    'BO', 'BOB', 'es-BO', 0,          -- 👈 país, moneda, formato, decimales
    '59170000000',                    -- 👈 WhatsApp que recibe pedidos (formato wa.me, sin +)
    '{"emoji":"👕","kicker":"Venta por mayor y menor","title":"Ropa para toda la familia","subtitle":"Por unidad, media docena o docena · Envíos a toda Bolivia 🇧🇴"}',
    '["S","M","L","XL"]',             -- 👈 talles
    -- 👈 formas de venta mayorista (se pueden editar después desde el backoffice)
    '[{"key":"media-docena","label":"Media docena","plural":"Medias docenas","units":6,"discount_pct":5},
      {"key":"docena","label":"Docena","plural":"Docenas","units":12,"discount_pct":10}]',
    5
  )
  returning id into v_tenant;

  insert into public.tenant_admins (tenant_id, email)
  values (v_tenant, 'dueño@prendasmichell.com');   -- 👈 correo del dueño

  -- Una categoría inicial para que el backoffice no arranque vacío
  insert into public.categories (tenant_id, name, emoji, sort) values (v_tenant, 'General', '🏷️', 1);

  raise notice 'Tienda creada: %', v_tenant;
end $$;
