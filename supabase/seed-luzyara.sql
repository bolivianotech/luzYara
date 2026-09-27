-- ============================================================
--  Datos iniciales de LuzYara (correr DESPUÉS de schema.sql)
--  Crea la tienda, sus categorías, 6 productos con talles (S, M y en algunos L), y el admin.
--  Es idempotente: si la tienda ya existe no duplica nada.
--
--  ANTES DE CORRER: cambiá el correo del dueño en la línea marcada con 👈
-- ============================================================
do $$
declare
  v_tenant uuid;
  v_cat    uuid;
  v_prod   uuid;
  r        record;
begin
  if exists (select 1 from public.tenants where slug = 'luzyara') then
    raise notice 'La tienda luzyara ya existe: no se modifica nada.';
    return;
  end if;

  insert into public.tenants (slug, name, country, currency_code, locale, currency_decimals,
                              whatsapp_number, brand, sizes, packs, low_stock_threshold)
  values (
    'luzyara', 'LuzYara', 'AR', 'ARS', 'es-AR', 0,
    '19142223263',
    '{"emoji":"🧸","kicker":"Nueva Colección","title":"Pijamas para Soñar ✨","subtitle":"Los más tiernos y abrigados. Por unidad o por curva con descuento · Envíos a todo Argentina 🇦🇷"}',
    '["S","M","L","XL"]',
    '[{"key":"curva","label":"Curva","plural":"Curvas","units":5,"discount_pct":10}]',
    5
  )
  returning id into v_tenant;

  insert into public.tenant_admins (tenant_id, email)
  values (v_tenant, 'correo-del-dueño@gmail.com');   -- 👈 CAMBIAR por el correo real del dueño

  for r in select * from (values
    (1, 'Osa Rosa',      '🩷', 'Pijama Osa Rosa',      'Pijama enterizo de polar suave. Capucha con orejitas de osa. Cierre frontal.', 'assets/demo/luzyara/osa.jpg',      32000, 8, 4, null),
    (2, 'Oso Café',      '🤎', 'Pijama Oso Café',      'Pijama enterizo café chocolate. Capucha con cara de osito.',                  'assets/demo/luzyara/oso.jpg',      32500, 6, 2, null),
    (3, 'Monstruo Rojo', '❤️', 'Pijama Monstruo Rojo', 'Pijama monstruo rojo con capucha de dientes. ¡El más divertido!',             'assets/demo/luzyara/monstruo.jpg', 33500, 0, 5, null),
    (4, 'Pikachu',       '💛', 'Pijama Pikachu',       'Pijama Pikachu amarillo eléctrico. Orejas puntiagudas.',                      'assets/demo/luzyara/pikachu.jpg',  36500, 7, 3, null),
    (5, 'Jirafa',        '🦒', 'Pijama Jirafa',        'Pijama enterizo de polar con capucha de jirafa, orejitas y cuernitos. Cierre frontal.', 'assets/demo/luzyara/jirafa.jpg', 34500, 6, 10, 5),
    (6, 'Dinosaurio',    '🦖', 'Pijama Dino Verde',    'Pijama enterizo de polar verde y azul con capucha de dinosaurio y dientes de fieltro.', 'assets/demo/luzyara/dino.jpg',   35500, 8, 7, 4)
  ) as t(sort, cat_name, emoji, prod_name, descr, img, price, stock_s, stock_m, stock_l)
  loop
    insert into public.categories (tenant_id, name, emoji, sort)
    values (v_tenant, r.cat_name, r.emoji, r.sort) returning id into v_cat;

    insert into public.products (tenant_id, category_id, name, description, image_url, price, sort)
    values (v_tenant, v_cat, r.prod_name, r.descr, r.img, r.price, r.sort) returning id into v_prod;

    insert into public.variants (tenant_id, product_id, size, stock) values
      (v_tenant, v_prod, 'S', r.stock_s),
      (v_tenant, v_prod, 'M', r.stock_m);
    if r.stock_l is not null then
      insert into public.variants (tenant_id, product_id, size, stock) values (v_tenant, v_prod, 'L', r.stock_l);
    end if;
  end loop;

  raise notice 'Tienda luzyara creada: %', v_tenant;
end $$;
