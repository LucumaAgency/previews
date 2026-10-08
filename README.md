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
| `VIEW_PASSWORD` | Opcional. Si se define, la galería y `/p/` piden contraseña (cookie 1 año). |
| `DATA_DIR` | Carpeta de datos (default `./data`). En Plesk conviene fuera del repo, p. ej. `/var/www/vhosts/<dominio>/previews-data`. |
| `MAX_MB` | Tamaño máximo del ZIP (default 80). |

Despliegue: ver `DEPLOY-PLESK.md`.
