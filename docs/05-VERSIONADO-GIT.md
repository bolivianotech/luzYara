# 05 · Versionado con Git y GitHub (desde PowerShell)

Repositorio: <https://github.com/bolivianotech/luzYara>

## Reglas del juego

| Regla | Por qué |
|---|---|
| `main` = lo que está publicado | Cloudflare Pages publica automáticamente cada cambio en `main`. |
| Todo cambio se hace en una **rama** y entra a `main` por **Pull Request** | Se revisa antes de publicar y queda historial. |
| Cada entrega importante lleva una **etiqueta** `vX.Y.Z` | Poder volver exactamente a una versión. |
| Se anota en `CHANGELOG.md` | Saber qué cambió en cada versión. |

### Nombres de ramas

| Prefijo | Uso | Ejemplo |
|---|---|---|
| `feature/` | funcionalidad nueva | `feature/galeria-fotos` |
| `fix/` | corrección | `fix/precio-docena` |
| `config/` | configuración / despliegue | `config/dominio-prendasmichell` |
| `docs/` | solo documentación | `docs/manual-pedidos` |

### Versiones (SemVer: `MAYOR.MENOR.PARCHE`)

- **PARCHE** `2.0.1`: se arregla algo sin cambiar el uso.
- **MENOR** `2.1.0`: funcionalidad nueva compatible (ej. galería de fotos).
- **MAYOR** `3.0.0`: cambio grande que rompe compatibilidad (ej. nuevo esquema de base de datos).

Historial: `v1.0.0` (PoC WhatsApp + curvas) → `v2.0.0` (multitenant + backoffice completo).

## Flujo diario (copiar y pegar)

### 1. Empezar un cambio

```powershell
cd D:\ai\luzyara
git switch main
git pull
git switch -c feature/<nombre-corto>
```

### 2. Trabajar y guardar avances

```powershell
git status                        # qué archivos cambiaron
git diff                          # ver los cambios línea por línea (q para salir)
git add .                         # preparar todos los cambios
git commit -m "Describe en una línea qué hiciste"
```

Hacé commits chicos y seguidos. Mensajes en español, en presente: *"Agregar filtro por talle en inventario"*.

### 3. Subir y abrir el Pull Request

```powershell
git push -u origin feature/<nombre-corto>
gh pr create --fill --base main
```

`gh` muestra la dirección del PR. Revisalo en el navegador (pestaña *Files changed*).

### 4. Aprobar y publicar

```powershell
gh pr merge --merge --delete-branch
git switch main
git pull
```

En ~1 minuto Cloudflare publica la nueva versión.

### 5. Etiquetar una versión

Cuando junta cambios que valen una versión:

1. Editá `CHANGELOG.md` (nueva sección arriba) y hacé commit por el flujo normal.
2. Después, ya en `main` actualizado:

```powershell
git tag -a v2.1.0 -m "v2.1.0: <resumen>"
git push origin v2.1.0
gh release create v2.1.0 --title "v2.1.0" --notes "Ver CHANGELOG.md"
```

## Volver atrás

| Situación | Comando |
|---|---|
| Descartar cambios no guardados de un archivo | `git restore <archivo>` |
| Ver versiones anteriores | `git log --oneline --graph --decorate -20` |
| Mirar cómo estaba todo en una versión | `git switch --detach v1.0.0` (volver: `git switch main`) |
| Deshacer un commit ya publicado (crea un commit inverso) | `git revert <id-del-commit>` y luego push por PR |
| Publicar de urgencia una versión anterior | Cloudflare Pages → *Deployments* → deploy anterior → **Rollback** |

## Qué NO subir nunca

- La clave `service_role` de Supabase, contraseñas o tokens (el `.gitignore` ya excluye `.env`).
- Datos personales de clientes (exportes de pedidos, planillas).

> El repositorio es **público**. La clave `anon` de Supabase que va en `js/config.js` es pública por diseño:
> la protección está en las políticas RLS. Si preferís que el código no sea visible:
> `gh repo edit bolivianotech/luzYara --visibility private --accept-visibility-change-consequences`
> (Cloudflare Pages sigue funcionando con repos privados).
