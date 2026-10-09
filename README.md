# Lucuma Previews

Galería propia de diseños HTML (tipo CodeSandbox simplificado) para revisar en el navegador lo que
Claude genera, de cualquier cliente, sin descargar archivos. Node + Express, sin base de datos:
cada subida se guarda en disco como `data/<cliente>/<diseño>/vN/`.

- **Galería:** `/` → lista por cliente y diseño, versiones, selector de archivo HTML, vista desktop /
  tablet / móvil, abrir en pestaña.
- **Archivos:** `/p/<cliente>/<diseño>/vN/<ruta>` (rutas relativas dentro del diseño funcionan tal cual).
- **API:**
  - `POST /api/push?cliente=&diseno=&titulo=&nota=&entry=&replace=1` · body = ZIP · header `Authorization: Bearer PUSH_TOKEN`. Crea una versión nueva (`replace=1` sobreescribe la última).
  - `GET /api/list` · árbol de clientes/diseños/versiones.
  - `PATCH /api/:cliente/:diseno/:vN` · `{titulo, nota, entry}`.
  - `DELETE /api/:cliente/:diseno[/:vN]`.
  - `GET /health`.

## Subir un diseño desde la máquina de Claude

```
node push.js <cliente> <diseño> <carpeta> [--titulo "Nombre"] [--nota "qué cambió"] [--entry index.html] [--replace]
```
Lee `~/.previews.env`:
```
PREVIEWS_URL=https://previews.pruebalucuma.site
PREVIEWS_TOKEN=el-mismo-PUSH_TOKEN-del-servidor
```
Omite `node_modules`, `.git`, `build`, archivos ocultos, videos/zip/pdf y archivos > 15 MB (`--max 30` para subir el límite). El ZIP completo admite hasta `MAX_MB` (80 por defecto).

## Variables de entorno (servidor)

| Variable | Qué hace |
|---|---|
| `PUSH_TOKEN` | Obligatorio. Token para subir/borrar. |
| `VIEW_PASSWORD` | Opcional. Si se define, la galería y `/p/` piden contraseña (cookie 1 año). Necesaria para que los enlaces por cliente tengan sentido. |
| `DATA_DIR` | Carpeta de datos (default `./data`). En Plesk conviene fuera del repo, p. ej. `/var/www/vhosts/<dominio>/previews-data`. |
| `MAX_MB` | Tamaño máximo del ZIP (default 80). |

Despliegue: ver `DEPLOY-PLESK.md`.

## Compartir con un cliente (solo su carpeta)

Con `VIEW_PASSWORD` definida, cada cliente puede recibir un enlace secreto que le da acceso **solo a su carpeta**:

```
node push.js acceso proba          # crea (o devuelve) el enlace https://.../c/proba/<clave>
node push.js acceso proba --renew  # regenera la clave (el enlace anterior deja de servir)
node push.js accesos               # lista los enlaces activos
node push.js revocar proba         # elimina el acceso
```

El cliente abre el enlace una vez, queda con cookie de un año y ve la galería filtrada: solo `proba` en el sidebar, y `/p/otro-cliente/...` responde 403. Tú entras con la contraseña y ves todo. API: `GET/POST/DELETE /api/clients[/:cliente]` con el `PUSH_TOKEN`. Las claves viven en `DATA_DIR/.clients.json`.
