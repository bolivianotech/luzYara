// ============================================================
// CONFIGURACIÓN DE DESPLIEGUE — el único archivo que se edita al publicar.
// Guía: docs/02-DESPLIEGUE.md
// ============================================================
window.APP_CONFIG = {
  // Supabase (opcional). Mientras diga YOUR_..., todo corre en MODO DEMO:
  // catálogo de ejemplo y cambios guardados solo en este navegador.
  supabaseUrl: 'YOUR_SUPABASE_URL',          // https://xxxxxxxx.supabase.co
  supabaseAnonKey: 'YOUR_SUPABASE_ANON_KEY', // Project Settings → API → anon public (es pública por diseño)

  // Tienda que se muestra si la URL no indica otra.
  defaultTenant: 'luzyara',

  // Dominio propio → tienda. Ej: 'luzyara.com.ar': 'luzyara'
  // Sin dominio propio, cada tienda se abre con ?tienda=<slug>
  domains: {
    // 'luzyara.com.ar': 'luzyara',
    // 'prendasmichell.com': 'prendasmichell',
  }
};
