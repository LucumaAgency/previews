# Despliegue en Plesk (Node.js + Passenger)

Mismo patrón que scrabble / pitch-monitor.

1. **Subdominio**: crear `previews.pruebalucuma.site` (o el que prefieras).
2. **Git**: repo `https://github.com/LucumaAgency/lucuma-previews.git`, rama `main`, despliegue manual.
   Raíz del documento = raíz de la app = carpeta donde clona.
3. **Node.js**: versión 20 o 22, npm, modo `production`, **archivo de inicio `app.cjs`**.
4. **Variables de entorno personalizadas**:
   ```
   NODE_ENV=production
   PUSH_TOKEN=<token largo, ej. openssl rand -hex 24>
   VIEW_PASSWORD=<opcional, contraseña para ver la galería>
   DATA_DIR=/var/www/vhosts/pruebalucuma.site/previews-data
   ```
   No definir `PORT` (lo inyecta Passenger). Crear la carpeta de `DATA_DIR` con permisos del usuario del dominio
   (si no, se usa `./data` dentro del repo, que sobrevive al `git pull` porque está en `.gitignore`).
5. **NPM install** → **Restart**.
6. Verificar `https://previews.pruebalucuma.site/health` → `{"ok":true,"auth":true,...}`.
7. En la máquina de Claude, crear `~/.previews.env` con `PREVIEWS_URL` y `PREVIEWS_TOKEN`.

Si el ZIP grande da 413, subir `client_max_body_size 100m;` en *Apache & nginx Settings → directivas nginx adicionales*.
