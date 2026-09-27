# 02 · Despliegue paso a paso (Windows 11 + PowerShell)

Objetivo: dejar **LuzYara** funcionando en internet con base de datos real, backoffice con login y fotos.
Tiempo estimado: 60–90 minutos la primera vez.

> **Convenciones de esta guía**
> - Los bloques `powershell` se copian y pegan en **PowerShell** (tecla Windows → escribir *PowerShell* → Enter).
> - Donde dice `D:\ai\luzyara` usá la carpeta donde tengas el proyecto.
> - Lo que está entre `<...>` lo reemplazás por tu dato.

---

## Parte 0 — Herramientas (una sola vez por computadora)

### 0.1 Instalar Git, GitHub CLI y VS Code

```powershell
winget install --id Git.Git -e --source winget
winget install --id GitHub.cli -e --source winget
winget install --id Microsoft.VisualStudioCode -e --source winget
```

**Cerrá y volvé a abrir PowerShell** (para que reconozca los programas nuevos) y verificá:

```powershell
git --version
gh --version
code --version
```

Cada uno tiene que mostrar un número de versión. Si dice *"no se reconoce como nombre de un cmdlet"*,
reiniciá la computadora.

### 0.2 Configurar tu identidad en Git

```powershell
git config --global user.name "Jim Nataniel"
git config --global user.email "<tu-correo-de-github>"
git config --global init.defaultBranch main
git config --global core.autocrlf true
```

### 0.3 Iniciar sesión en GitHub

```powershell
gh auth login
```

Respondé: **GitHub.com** → **HTTPS** → **Yes** (autenticar Git) → **Login with a web browser**.
Copiá el código de 8 caracteres que aparece, se abre el navegador, pegalo y autorizá. Comprobá:

```powershell
gh auth status
```

---

## Parte 1 — Traer el proyecto a tu computadora

Si ya lo tenés en `D:\ai\luzyara`, actualizalo:

```powershell
cd D:\ai\luzyara
git switch main
git pull
```

Si es una computadora nueva:

```powershell
cd D:\ai
git clone https://github.com/bolivianotech/luzYara.git luzyara
cd luzyara
```

### 1.1 Verlo funcionando en modo demo

```powershell
start .\index.html
start .\admin.html
```

- Tienda de Bolivia (demo): en la barra del navegador agregá `?tienda=prendasmichell` al final de la dirección.
- El modo demo guarda los cambios **solo en ese navegador**. Sirve para mostrar, no para operar.

### 1.2 (Opcional) Servidor local

Algunas funciones (login con enlace mágico) necesitan `http://` en vez de `file://`.
Con Python instalado (`winget install --id Python.Python.3.12 -e`):

```powershell
cd D:\ai\luzyara
python -m http.server 8080
```

Abrí <http://localhost:8080> (tienda) y <http://localhost:8080/admin.html> (backoffice).
Para detenerlo: `Ctrl + C` en PowerShell.

---

## Parte 2 — Base de datos en Supabase

### 2.1 Crear el proyecto

1. Entrá a <https://supabase.com/dashboard> e iniciá sesión (podés usar tu cuenta de GitHub).
2. **New project**:
   - *Name*: `tienda-whatsapp` (servirá para todas las tiendas).
   - *Database Password*: **Generate a password** → guardala en un gestor de contraseñas.
   - *Region*: **South America (São Paulo)**.
3. **Create new project** y esperá ~2 minutos.

> ¿Ya habías corrido el esquema de la v1 o de MercadoPago en ese proyecto? Si no hay datos reales, en
> **SQL Editor** ejecutá primero:
> ```sql
> drop table if exists public.orders, public.products, public.admins, public.store_settings cascade;
> ```

### 2.2 Crear las tablas

1. Menú izquierdo → **SQL Editor** → **New query**.
2. En VS Code abrí el esquema y copialo entero:
   ```powershell
   code D:\ai\luzyara\supabase\schema.sql
   ```
   `Ctrl + A` → `Ctrl + C`.
3. Pegalo en el SQL Editor (`Ctrl + V`) → **Run** (o `Ctrl + Enter`). Tiene que decir **Success. No rows returned**.
4. Verificá en **Table Editor**: aparecen `tenants`, `categories`, `products`, `variants`, `orders`,
   `tenant_admins`, `platform_admins`.
5. Verificá en **Storage**: aparece el bucket `product-images` (público).

### 2.3 Cargar la tienda LuzYara

1. Abrí `supabase\seed-luzyara.sql` en VS Code.
2. En la línea marcada con 👈 reemplazá `correo-del-dueño@gmail.com` por el **correo real del dueño de LuzYara**.
3. Copiá todo → **SQL Editor → New query** → pegar → **Run**. Debe decir *Success* (en *Notices*: "Tienda luzyara creada").

### 2.4 Darte permisos de administrador de plataforma (vos)

En el SQL Editor:

```sql
insert into public.platform_admins (email) values ('<tu-correo>');
```

Como admin de plataforma podés entrar al backoffice de **cualquier** tienda.

### 2.5 Configurar el login

1. **Authentication → Sign In / Providers → Email**: dejá **Enable Email provider** activado.
   Desactivá **Allow new users to sign up** (solo entran invitados).
2. **Authentication → Users → Add user → Send invitation**: invitá tu correo y el del dueño de LuzYara.
   Cada uno recibe un mail "You have been invited" → abrirlo una vez para activar la cuenta.
3. **Authentication → URL Configuration** (lo completás en la Parte 4, cuando tengas la dirección pública).

> ⚠️ **Límite de correos**: el correo que trae Supabase envía muy pocos mails por hora (pensado para pruebas).
> Para producción configurá un SMTP propio en **Authentication → Emails → SMTP Settings**
> (por ejemplo [Resend](https://resend.com), plan gratis: 3.000 mails/mes).

### 2.6 Copiar las llaves

**Project Settings → API**:
- **Project URL** → `https://xxxxxxxx.supabase.co`
- **Project API keys → `anon` `public`** → una cadena larga que empieza con `eyJ...`

❌ No copies la `service_role`: esa nunca va en el código.

---

## Parte 3 — Conectar el código a Supabase

```powershell
cd D:\ai\luzyara
code js\config.js
```

Reemplazá:

```js
supabaseUrl: 'https://xxxxxxxx.supabase.co',
supabaseAnonKey: 'eyJhbGciOi...',
defaultTenant: 'luzyara',
```

Guardá (`Ctrl + S`). Probalo localmente con el servidor de la Parte 1.2: la tienda ahora lee de Supabase
(si ves "Tienda no encontrada", revisá el paso 2.3).

Subí el cambio a GitHub (ver detalle en [05-VERSIONADO-GIT.md](05-VERSIONADO-GIT.md)):

```powershell
git switch -c config/supabase-produccion
git add js/config.js
git commit -m "Conectar Supabase de producción"
git push -u origin config/supabase-produccion
gh pr create --fill --base main
gh pr merge --merge --delete-branch
git switch main
git pull
```

---

## Parte 4 — Publicar en internet (Cloudflare Pages, recomendado)

Cloudflare Pages es gratis, publica solo cada vez que hacés `git push` a `main`, y admite muchos dominios
propios (uno por tienda) en el mismo proyecto.

1. Entrá a <https://dash.cloudflare.com> y creá una cuenta gratis.
2. **Workers & Pages → Create → Pages → Connect to Git**.
3. **Connect GitHub** → autorizá el acceso al repo `bolivianotech/luzYara`.
4. Configuración del build:
   - *Project name*: `tienda-whatsapp` (la dirección será `https://tienda-whatsapp.pages.dev`)
   - *Production branch*: `main`
   - *Framework preset*: **None**
   - *Build command*: **(vacío)**
   - *Build output directory*: `/`
5. **Save and Deploy**. En ~1 minuto: `https://tienda-whatsapp.pages.dev`.

> **Alternativa Netlify**: <https://app.netlify.com> → *Add new site → Import an existing project* →
> GitHub → repo → *Build command* vacío, *Publish directory* `.` → *Deploy*.

### 4.1 Avisarle a Supabase la dirección pública

**Supabase → Authentication → URL Configuration**:
- *Site URL*: `https://tienda-whatsapp.pages.dev`
- *Redirect URLs* → **Add URL**, una por línea:
  - `https://tienda-whatsapp.pages.dev/**`
  - `http://localhost:8080/**` (para pruebas locales)
  - más adelante, cada dominio propio: `https://luzyara.com.ar/**`

### 4.2 Direcciones finales

| Qué | Dirección |
|---|---|
| Tienda LuzYara | `https://tienda-whatsapp.pages.dev/?tienda=luzyara` (o sin parámetro: es la tienda por defecto) |
| Backoffice LuzYara | `https://tienda-whatsapp.pages.dev/admin.html?tienda=luzyara` |
| Otra tienda | `https://tienda-whatsapp.pages.dev/?tienda=<slug>` |

### 4.3 (Opcional) Dominio propio por tienda

1. Cloudflare Pages → proyecto → **Custom domains → Set up a custom domain** → `luzyara.com.ar` → seguí los pasos DNS.
2. En `js/config.js`: `domains: { 'luzyara.com.ar': 'luzyara' }` → commit + push (se publica solo).
3. Agregá `https://luzyara.com.ar/**` en las *Redirect URLs* de Supabase.

---

## Parte 5 — Primer uso del backoffice

1. Abrí `.../admin.html?tienda=luzyara` → escribí tu correo → **Enviar enlace de acceso**.
2. Abrí el mail **en la misma computadora y navegador** → te deja adentro del backoffice.
3. **⚙️ Configuración**: verificá WhatsApp **+1 914 222 3263** → **Probar enlace** → **Guardar configuración**.
4. **👕 Productos**: reemplazá las fotos de ejemplo por las reales (clic sobre la foto) y cargá los productos reales.
5. **📊 Inventario**: cargá las cantidades por talle.

Manual completo del dueño: [03-MANUAL-BACKOFFICE.md](03-MANUAL-BACKOFFICE.md).

---

## Parte 6 — Checklist de verificación

- [ ] La tienda muestra LuzYara, precios en `$` (ARS) y botones `+ Curva x5`.
- [ ] Desde el celular: agregar una curva → *Finalizar pedido* → se abre WhatsApp hacia +1 914 222 3263 con el pedido.
- [ ] El pedido aparece en **📋 Pedidos** del backoffice.
- [ ] **✓ Venta cerrada** descuenta 5 unidades del talle en **📊 Inventario**.
- [ ] Subir una foto desde el celular en **👕 Productos** y verla en la tienda.
- [ ] Ventana privada → `admin.html` pide login (nadie ve pedidos sin sesión).
- [ ] Con un correo NO invitado, el login dice "Ese correo no está invitado".
- [ ] `?tienda=prendasmichell` dice "Tienda no encontrada" (todavía no la diste de alta: ver 04-NUEVO-CLIENTE.md).

## Problemas frecuentes

| Síntoma | Causa / solución |
|---|---|
| "Tienda no encontrada" | No corriste `seed-luzyara.sql`, o el slug en la URL está mal escrito. |
| El enlace mágico lleva a otra página o a `localhost` | Falta la dirección en *Authentication → URL Configuration*. |
| "Email rate limit exceeded" | Límite del correo de Supabase: esperá 1 hora o configurá SMTP propio (2.5). |
| "Tu usuario no administra esta tienda" | Falta el correo en `tenant_admins` de esa tienda (o en `platform_admins`). |
| No sube la foto | La foto no es JPG/PNG/WEBP, o el usuario no es admin de esa tienda. |
| Cambié `config.js` y no se ve | ¿Hiciste push a `main`? Cloudflare tarda ~1 min. Recargá con `Ctrl + F5`. |
