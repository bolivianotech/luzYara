# 04 · Dar de alta una tienda nueva (ej. PrendasMichell)

No se toca código ni se crea otro Supabase: una tienda nueva es **una fila en `tenants`** en la misma base.
Tiempo: ~15 minutos.

## 1. Datos que necesitás del cliente

| Dato | Ejemplo PrendasMichell |
|---|---|
| Identificador (slug): minúsculas, números y guiones | `prendasmichell` |
| Nombre visible | `PrendasMichell` |
| País / moneda | Bolivia / `BOB` |
| WhatsApp que recibe pedidos | `+591 7xxxxxxx` → se escribe `5917xxxxxxx` |
| Correo del dueño (para el backoffice) | `dueño@prendasmichell.com` |
| Formas de venta por mayor | media docena (6) −5 %, docena (12) −10 % |
| Talles | `S, M, L, XL` |

## 2. Crear la tienda

### Opción A (recomendada) — desde la consola de plataforma

1. Entrá a `https://<tu-sitio>/plataforma.html` con tu correo de superadmin.
2. **+ Nueva tienda** → nombre, identificador, país y moneda, WhatsApp, venta por mayor, talles y correo del dueño.
3. **Crear tienda**.
4. **Supabase → Authentication → Users → Add user → Send invitation** → correo del dueño
   (la consola todavía no puede enviar invitaciones: eso llega en v3).

### Opción B — por SQL

1. Abrí la plantilla en VS Code:
   ```powershell
   code D:\ai\luzyara\supabase\nuevo-cliente.sql
   ```
2. Reemplazá los valores marcados con 👈 (no guardes los datos del cliente en el repo: copiá, editá en el
   SQL Editor y descartá los cambios del archivo).
3. **Supabase → SQL Editor → New query** → pegar → **Run**.
4. Invitá el correo del dueño en **Authentication → Users**.

## 3. Probar

- Tienda: `https://tienda-whatsapp.pages.dev/?tienda=prendasmichell`
- Backoffice: `https://tienda-whatsapp.pages.dev/admin.html?tienda=prendasmichell`

El dueño entra con su correo, crea categorías y productos con fotos, carga stock y revisa la configuración.
Vos (admin de plataforma) también podés entrar para ayudarlo en la carga inicial.

## 4. (Opcional) Dominio propio

1. El cliente compra el dominio (ej. `prendasmichell.com`) y te da acceso al DNS.
2. **Cloudflare Pages → Custom domains → Set up a custom domain** → `prendasmichell.com`.
3. En `js/config.js`:
   ```js
   domains: {
     'luzyara.com.ar': 'luzyara',
     'prendasmichell.com': 'prendasmichell',
   }
   ```
4. Commit + push (ver [05-VERSIONADO-GIT.md](05-VERSIONADO-GIT.md)).
5. **Supabase → Authentication → URL Configuration → Redirect URLs** → `https://prendasmichell.com/**`.

## 5. Pausar una tienda o cambiar sus administradores

Desde `plataforma.html`: botón **Pausar/Activar** (una tienda pausada deja de verse en internet) y
**👤 Admins** para agregar o quitar correos. Cada correo nuevo hay que invitarlo en **Authentication → Users**.
