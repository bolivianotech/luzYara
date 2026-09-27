// ============================================================
// DATOS DEMO — se usan solo cuando Supabase no está configurado.
// Dos tiendas de ejemplo con el mismo software y reglas distintas:
//   luzyara        → Argentina, ARS, curva de 5
//   prendasmichell → Bolivia, BOB, media docena y docena (ejemplo ficticio)
// ============================================================
window.DEMO_TENANTS = {
  luzyara: {
    tenant: {
      id: 'demo-luzyara', slug: 'luzyara', name: 'LuzYara', active: true,
      country: 'AR', currency_code: 'ARS', locale: 'es-AR', currency_decimals: 0,
      whatsapp_number: '19142223263',
      brand: {
        emoji: '🧸', kicker: 'Nueva Colección', title: 'Pijamas para Soñar ✨',
        subtitle: 'Los más tiernos y abrigados. Por unidad o por curva con descuento · Envíos a todo Argentina 🇦🇷'
      },
      sizes: ['S', 'M', 'L', 'XL'],
      packs: [{ key: 'curva', label: 'Curva', plural: 'Curvas', units: 5, discount_pct: 10 }],
      low_stock_threshold: 5
    },
    categories: [
      { id: 'c-osa', name: 'Osa Rosa', emoji: '🩷', sort: 1, active: true },
      { id: 'c-oso', name: 'Oso Café', emoji: '🤎', sort: 2, active: true },
      { id: 'c-monstruo', name: 'Monstruo Rojo', emoji: '❤️', sort: 3, active: true },
      { id: 'c-pikachu', name: 'Pikachu', emoji: '💛', sort: 4, active: true }
    ],
    products: [
      { id: 'p-osa', category_id: 'c-osa', name: 'Pijama Osa Rosa', price: 32000, sort: 1, active: true,
        description: 'Pijama enterizo de polar suave. Capucha con orejitas de osa. Cierre frontal.',
        image_url: 'assets/demo/luzyara/osa.jpg',
        variants: [{ id: 'v-osa-s', size: 'S', stock: 8 }, { id: 'v-osa-m', size: 'M', stock: 4 }] },
      { id: 'p-oso', category_id: 'c-oso', name: 'Pijama Oso Café', price: 32500, sort: 2, active: true,
        description: 'Pijama enterizo café chocolate. Capucha con cara de osito.',
        image_url: 'assets/demo/luzyara/oso.jpg',
        variants: [{ id: 'v-oso-s', size: 'S', stock: 6 }, { id: 'v-oso-m', size: 'M', stock: 2 }] },
      { id: 'p-monstruo', category_id: 'c-monstruo', name: 'Pijama Monstruo Rojo', price: 33500, sort: 3, active: true,
        description: 'Pijama monstruo rojo con capucha de dientes. ¡El más divertido!',
        image_url: 'assets/demo/luzyara/monstruo.jpg',
        variants: [{ id: 'v-mon-s', size: 'S', stock: 0 }, { id: 'v-mon-m', size: 'M', stock: 5 }] },
      { id: 'p-pikachu', category_id: 'c-pikachu', name: 'Pijama Pikachu', price: 36500, sort: 4, active: true,
        description: 'Pijama Pikachu amarillo eléctrico. Orejas puntiagudas.',
        image_url: 'assets/demo/luzyara/pikachu.jpg',
        variants: [{ id: 'v-pik-s', size: 'S', stock: 7 }, { id: 'v-pik-m', size: 'M', stock: 3 }] }
    ]
  },

  prendasmichell: {
    tenant: {
      id: 'demo-prendasmichell', slug: 'prendasmichell', name: 'PrendasMichell', active: true,
      country: 'BO', currency_code: 'BOB', locale: 'es-BO', currency_decimals: 0,
      whatsapp_number: '19142223263',
      brand: {
        emoji: '👕', kicker: 'Venta por mayor y menor', title: 'Ropa para toda la familia',
        subtitle: 'Por unidad, media docena o docena · Envíos a toda Bolivia 🇧🇴'
      },
      sizes: ['S', 'M', 'L', 'XL'],
      packs: [
        { key: 'media-docena', label: 'Media docena', plural: 'Medias docenas', units: 6, discount_pct: 5 },
        { key: 'docena', label: 'Docena', plural: 'Docenas', units: 12, discount_pct: 10 }
      ],
      low_stock_threshold: 6
    },
    categories: [
      { id: 'c-pij', name: 'Pijamas', emoji: '🌙', sort: 1, active: true }
    ],
    products: [
      { id: 'p-pij-osa', category_id: 'c-pij', name: 'Pijama Osita', price: 120, sort: 1, active: true,
        description: 'Pijama enterizo de polar. Ejemplo de catálogo en bolivianos.',
        image_url: 'assets/demo/luzyara/osa.jpg',
        variants: [{ id: 'v-pm-s', size: 'S', stock: 30 }, { id: 'v-pm-m', size: 'M', stock: 14 }] },
      { id: 'p-pij-pika', category_id: 'c-pij', name: 'Pijama Pikachu', price: 135, sort: 2, active: true,
        description: 'Pijama enterizo amarillo. Ejemplo de venta por docena.',
        image_url: 'assets/demo/luzyara/pikachu.jpg',
        variants: [{ id: 'v-pp-s', size: 'S', stock: 24 }, { id: 'v-pp-m', size: 'M', stock: 8 }] }
    ]
  }
};
