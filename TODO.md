# TODO

## Git Hooks

### Pre-push Hook Deshabilitado

El hook `pre-push` generado por `cargo-husky` fue deshabilitado (renombrado a `pre-push.disabled`) porque:

- Ejecutaba comandos de cargo (`test`, `check`, `clippy`, `fmt`) desde la raíz del proyecto
- El `Cargo.toml` está en `src-tauri/`, no en la raíz
- Esto causaba errores al intentar hacer `git push`

**Soluciones posibles:**

1. **Rehabilitar el hook modificado:** Renombrar `.git/hooks/pre-push.disabled` a `.git/hooks/pre-push` y agregar `cd src-tauri` al inicio de los comandos
2. **Configurar cargo-husky correctamente:** Modificar la configuración de cargo-husky en `src-tauri/Cargo.toml` para que genere el hook con el directorio correcto
3. **Mantenerlo deshabilitado:** Si no necesitas validación automática antes de push

**Ubicación del hook:** `.git/hooks/pre-push.disabled`
