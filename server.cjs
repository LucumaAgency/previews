// Lucuma Previews · galería de diseños HTML con API de subida.
// Uso: Claude (u otro) hace POST /api/push con un ZIP; la galería lo muestra en iframe.
const express = require('express');
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
let DATA = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'));
try { fs.mkdirSync(DATA, { recursive: true }); fs.accessSync(DATA, fs.constants.W_OK); }
catch (e) { console.error(`DATA_DIR ${DATA} no utilizable (${e.message}); usando ./data`); DATA = path.join(__dirname, 'data'); }
const TOKEN = process.env.PUSH_TOKEN || '';           // obligatorio para subir/borrar
const VIEW_PASSWORD = process.env.VIEW_PASSWORD || ''; // opcional: protege la galería
const MAX_MB = +(process.env.MAX_MB || 80);
fs.mkdirSync(DATA, { recursive: true });
process.on('uncaughtException', e => console.error('uncaught', e));

const app = express();
app.disable('x-powered-by');
const slug = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
const safe = p => { const r = path.resolve(DATA, p); if (!r.startsWith(DATA + path.sep) && r !== DATA) throw new Error('ruta inválida'); return r; };
const readMeta = dir => { try { return JSON.parse(fs.readFileSync(path.join(dir, '.meta.json'), 'utf8')); } catch { return {}; } };

// ---- galería (opcional con contraseña) + accesos por cliente ----
// Accesos por cliente: data/.clients.json = { proba: { key, createdAt } }. Enlace /c/proba/<key> deja ver SOLO esa carpeta.
const CLIENTS_FILE = path.join(DATA, '.clients.json');
const readClients = () => { try { return JSON.parse(fs.readFileSync(CLIENTS_FILE, 'utf8')); } catch { return {}; } };
const writeClients = o => fs.writeFileSync(CLIENTS_FILE, JSON.stringify(o, null, 1));
const h = s => crypto.createHash('sha256').update(String(s)).digest('hex').slice(0, 32);
const viewCookie = () => h('view:' + VIEW_PASSWORD);
const getCookie = (req, name) => { const c = (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith(name + '=')); return c ? c.slice(name.length + 1) : ''; };
const loginPage = (msg = '') => `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>Previews</title><body style="font-family:system-ui;display:grid;place-items:center;height:100vh;margin:0;background:#f6f6f4"><form method=post action=/login style="background:#fff;padding:32px;border-radius:16px;box-shadow:0 10px 40px rgba(0,0,0,.08);display:grid;gap:12px;width:280px"><b>Lucuma Previews</b>${msg ? `<small style="color:#b00">${msg}</small>` : ''}<input name=p type=password placeholder="Contraseña" style="padding:10px;border:1px solid #ddd;border-radius:8px"><button style="padding:10px;border:0;border-radius:8px;background:#174FCA;color:#fff;font-weight:600">Entrar</button><small style="color:#777">Si eres cliente, usa el enlace que te compartimos.</small></form>`;
// Determina qué puede ver la petición: 'all' (todo) | '<cliente>' (solo esa carpeta) | '' (nada)
function scopeOf(req) {
  if (!VIEW_PASSWORD) return 'all';                       // sin contraseña general: público (como antes)
  if (getCookie(req, 'pv') === viewCookie()) return 'all';
  const pc = getCookie(req, 'pc'); const i = pc.indexOf(':');
  if (i > 0) { const cl = pc.slice(0, i), cli = readClients()[cl]; if (cli && pc.slice(i + 1) === h('client:' + cl + ':' + cli.key)) return cl; }
  return '';
}
function viewAuth(req, res, next) {
  req.scope = scopeOf(req);
  const bearer = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (TOKEN && bearer === TOKEN) req.scope = 'all';          // la API con token (push.js, accesos) siempre pasa
  if (req.scope) return next();
  if (req.method === 'POST' && req.path === '/login') return next();
  if (req.method === 'GET' && req.path.startsWith('/c/')) return next();   // enlaces de cliente
  if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'no autorizado' });
  res.status(401).send(loginPage());
}
app.post('/login', express.urlencoded({ extended: false }), (req, res) => {
  if (VIEW_PASSWORD && req.body.p === VIEW_PASSWORD) { res.setHeader('Set-Cookie', `pv=${viewCookie()}; Path=/; HttpOnly; Max-Age=31536000; SameSite=Lax`); return res.redirect('/'); }
  res.status(401).send(loginPage('Contraseña incorrecta'));
});
// Enlace de cliente: /c/proba/<key> → cookie limitada a esa carpeta y redirige a la galería
app.get('/c/:cliente/:key', (req, res) => {
  const cl = slug(req.params.cliente), cli = readClients()[cl];
  if (!cli || cli.key !== req.params.key) return res.status(404).send(loginPage('Enlace inválido o revocado'));
  res.setHeader('Set-Cookie', `pc=${cl}:${h('client:' + cl + ':' + cli.key)}; Path=/; HttpOnly; Max-Age=31536000; SameSite=Lax`);
  res.redirect('/#/' + cl);
});
app.get('/health', (req, res) => res.json({ ok: true, data: DATA, auth: !!TOKEN, view: !!VIEW_PASSWORD, clients: Object.keys(readClients()).length }));
app.use(viewAuth);

// ---- API de subida ----
function pushAuth(req, res, next) {
  const t = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!TOKEN || t !== TOKEN) return res.status(401).json({ error: 'token inválido' });
  next();
}
// POST /api/push?cliente=proba&diseno=rediseno-octubre&nota=...&entry=index.html  (body: ZIP)
app.post('/api/push', pushAuth, express.raw({ type: '*/*', limit: MAX_MB + 'mb' }), (req, res) => {
  try {
    const cliente = slug(req.query.cliente), diseno = slug(req.query.diseno);
    if (!cliente || !diseno) return res.status(400).json({ error: 'faltan cliente y diseno' });
    if (!req.body || !req.body.length) return res.status(400).json({ error: 'body vacío (se espera un ZIP)' });
    const base = safe(path.join(cliente, diseno));
    fs.mkdirSync(base, { recursive: true });
    const vers = fs.readdirSync(base).filter(d => /^v\d+$/.test(d)).map(d => +d.slice(1));
    let n = (vers.length ? Math.max(...vers) : 0) + 1;
    if (req.query.replace === '1' && vers.length) { n = Math.max(...vers); fs.rmSync(path.join(base, 'v' + n), { recursive: true, force: true }); }
    const dir = path.join(base, 'v' + n);
    fs.mkdirSync(dir, { recursive: true });
    const zip = new AdmZip(req.body);
    let files = 0, htmls = [];
    for (const e of zip.getEntries()) {
      if (e.isDirectory) continue;
      const name = e.entryName.replace(/\\/g, '/');
      if (name.includes('..') || name.startsWith('/') || /(^|\/)(node_modules|\.git)\//.test(name)) continue;
      const out = path.resolve(dir, name); if (!out.startsWith(dir + path.sep)) continue;
      fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, e.getData()); files++;
      if (/\.html?$/i.test(name)) htmls.push(name);
    }
    htmls.sort((a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b));
    let entry = req.query.entry && htmls.includes(req.query.entry) ? req.query.entry : (htmls.find(h => /(^|\/)index\.html$/.test(h)) || htmls[0] || '');
    const meta = { cliente, diseno, version: n, nota: String(req.query.nota || ''), titulo: String(req.query.titulo || ''), entry, htmls, files, createdAt: new Date().toISOString() };
    fs.writeFileSync(path.join(dir, '.meta.json'), JSON.stringify(meta, null, 1));
    const url = `${req.headers['x-forwarded-proto'] || req.protocol}://${req.get('host')}`;
    res.json({ ok: true, ...meta, url: `${url}/#/${cliente}/${diseno}/v${n}`, direct: `${url}/p/${cliente}/${diseno}/v${n}/${entry}` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
// Accesos por cliente (requieren PUSH_TOKEN)
const clientLink = (req, cl, key) => `${req.headers['x-forwarded-proto'] || req.protocol}://${req.get('host')}/c/${cl}/${key}`;
app.get('/api/clients', pushAuth, (req, res) => { const o = readClients(); res.json(Object.entries(o).map(([cl, v]) => ({ cliente: cl, createdAt: v.createdAt, link: clientLink(req, cl, v.key) }))); });
app.post('/api/clients/:cliente', pushAuth, (req, res) => {       // crea (o regenera con ?renew=1) el enlace de un cliente
  const cl = slug(req.params.cliente); if (!cl) return res.status(400).json({ error: 'cliente inválido' });
  const o = readClients(); if (!o[cl] || req.query.renew === '1') o[cl] = { key: crypto.randomBytes(18).toString('base64url'), createdAt: new Date().toISOString() };
  writeClients(o); res.json({ ok: true, cliente: cl, link: clientLink(req, cl, o[cl].key), viewPassword: !!VIEW_PASSWORD });
});
app.delete('/api/clients/:cliente', pushAuth, (req, res) => { const o = readClients(); delete o[slug(req.params.cliente)]; writeClients(o); res.json({ ok: true }); });
app.delete('/api/:cliente/:diseno{/:v}', pushAuth, (req, res) => {
  try { const p = safe(path.join(slug(req.params.cliente), slug(req.params.diseno), req.params.v ? slug(req.params.v) : '')); fs.rmSync(p, { recursive: true, force: true }); res.json({ ok: true }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
app.patch('/api/:cliente/:diseno/:v', pushAuth, express.json(), (req, res) => {
  try { const d = safe(path.join(slug(req.params.cliente), slug(req.params.diseno), slug(req.params.v))); const m = readMeta(d); Object.assign(m, { nota: req.body.nota ?? m.nota, titulo: req.body.titulo ?? m.titulo, entry: req.body.entry ?? m.entry }); fs.writeFileSync(path.join(d, '.meta.json'), JSON.stringify(m, null, 1)); res.json({ ok: true, ...m }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
// Listado (árbol) para la galería (filtrado según el acceso)
app.get('/api/list', (req, res) => {
  const tree = [];
  for (const c of fs.readdirSync(DATA, { withFileTypes: true }).filter(d => d.isDirectory() && !d.name.startsWith('.') && (req.scope === 'all' || d.name === req.scope))) {
    const disenos = [];
    for (const d of fs.readdirSync(path.join(DATA, c.name), { withFileTypes: true }).filter(x => x.isDirectory())) {
      const vs = fs.readdirSync(path.join(DATA, c.name, d.name)).filter(v => /^v\d+$/.test(v)).sort((a, b) => +b.slice(1) - +a.slice(1))
        .map(v => ({ v, ...readMeta(path.join(DATA, c.name, d.name, v)) }));
      if (vs.length) disenos.push({ diseno: d.name, versiones: vs, updatedAt: vs[0].createdAt });
    }
    disenos.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
    if (disenos.length) tree.push({ cliente: c.name, disenos, updatedAt: disenos[0].updatedAt });
  }
  tree.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  res.json({ scope: req.scope, tree });
});
// Archivos de cada versión
app.use('/p', (req, res, next) => { if (req.scope === 'all' || req.path.split('/')[1] === req.scope) return next(); res.status(403).send('Sin acceso a esta carpeta'); });
app.use('/p', express.static(DATA, { index: ['index.html'], dotfiles: 'deny', extensions: ['html'] }));
// Galería
app.use(express.static(path.join(__dirname, 'public')));
app.listen(PORT, () => console.log(`Lucuma Previews en puerto ${PORT} · datos en ${DATA}`));
