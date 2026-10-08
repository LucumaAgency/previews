// Lucuma Previews · galería de diseños HTML con API de subida.
// Uso: Claude (u otro) hace POST /api/push con un ZIP; la galería lo muestra en iframe.
const express = require('express');
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const DATA = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'));
const TOKEN = process.env.PUSH_TOKEN || '';           // obligatorio para subir/borrar
const VIEW_PASSWORD = process.env.VIEW_PASSWORD || ''; // opcional: protege la galería
const MAX_MB = +(process.env.MAX_MB || 80);
fs.mkdirSync(DATA, { recursive: true });

const app = express();
app.disable('x-powered-by');
const slug = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
const safe = p => { const r = path.resolve(DATA, p); if (!r.startsWith(DATA + path.sep) && r !== DATA) throw new Error('ruta inválida'); return r; };
const readMeta = dir => { try { return JSON.parse(fs.readFileSync(path.join(dir, '.meta.json'), 'utf8')); } catch { return {}; } };

// ---- galería (opcional con contraseña) ----
const viewCookie = () => crypto.createHash('sha256').update('view:' + VIEW_PASSWORD).digest('hex').slice(0, 32);
function viewAuth(req, res, next) {
  if (!VIEW_PASSWORD) return next();
  const c = (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith('pv='));
  if (c && c.slice(3) === viewCookie()) return next();
  if (req.method === 'POST' && req.path === '/login') return next();
  if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'no autorizado' });
  res.status(401).send(`<!doctype html><meta charset=utf-8><title>Previews</title><body style="font-family:system-ui;display:grid;place-items:center;height:100vh;margin:0;background:#f6f6f4"><form method=post action=/login style="background:#fff;padding:32px;border-radius:16px;box-shadow:0 10px 40px rgba(0,0,0,.08);display:grid;gap:12px;width:280px"><b>Lucuma Previews</b><input name=p type=password placeholder="Contraseña" style="padding:10px;border:1px solid #ddd;border-radius:8px"><button style="padding:10px;border:0;border-radius:8px;background:#174FCA;color:#fff;font-weight:600">Entrar</button></form>`);
}
app.post('/login', express.urlencoded({ extended: false }), (req, res) => {
  if (VIEW_PASSWORD && req.body.p === VIEW_PASSWORD) res.setHeader('Set-Cookie', `pv=${viewCookie()}; Path=/; HttpOnly; Max-Age=31536000; SameSite=Lax`);
  res.redirect('/');
});
app.get('/health', (req, res) => res.json({ ok: true, data: DATA, auth: !!TOKEN, view: !!VIEW_PASSWORD }));
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
    const url = `${req.protocol}://${req.get('host')}`;
    res.json({ ok: true, ...meta, url: `${url}/#/${cliente}/${diseno}/v${n}`, direct: `${url}/p/${cliente}/${diseno}/v${n}/${entry}` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete('/api/:cliente/:diseno{/:v}', pushAuth, (req, res) => {
  try { const p = safe(path.join(slug(req.params.cliente), slug(req.params.diseno), req.params.v ? slug(req.params.v) : '')); fs.rmSync(p, { recursive: true, force: true }); res.json({ ok: true }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
app.patch('/api/:cliente/:diseno/:v', pushAuth, express.json(), (req, res) => {
  try { const d = safe(path.join(slug(req.params.cliente), slug(req.params.diseno), slug(req.params.v))); const m = readMeta(d); Object.assign(m, { nota: req.body.nota ?? m.nota, titulo: req.body.titulo ?? m.titulo, entry: req.body.entry ?? m.entry }); fs.writeFileSync(path.join(d, '.meta.json'), JSON.stringify(m, null, 1)); res.json({ ok: true, ...m }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
// Listado (árbol) para la galería
app.get('/api/list', (req, res) => {
  const tree = [];
  for (const c of fs.readdirSync(DATA, { withFileTypes: true }).filter(d => d.isDirectory() && !d.name.startsWith('.'))) {
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
  res.json(tree);
});
// Archivos de cada versión
app.use('/p', express.static(DATA, { index: ['index.html'], dotfiles: 'deny', extensions: ['html'] }));
// Galería
app.use(express.static(path.join(__dirname, 'public')));
app.listen(PORT, () => console.log(`Lucuma Previews en puerto ${PORT} · datos en ${DATA}`));
