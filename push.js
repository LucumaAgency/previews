#!/usr/bin/env node
// Sube una carpeta de HTML a Lucuma Previews.
// Uso: node push.js <cliente> <diseño> <carpeta> [--nota "texto"] [--titulo "Nombre"] [--entry index.html] [--replace]
// Config: ~/.previews.env con PREVIEWS_URL=https://... y PREVIEWS_TOKEN=...
const fs = require('fs'), path = require('path'), os = require('os');
const AdmZip = require(path.join(__dirname, 'node_modules', 'adm-zip'));
const args = process.argv.slice(2), opt = {};
const pos = [];
for (let i = 0; i < args.length; i++) { if (args[i].startsWith('--')) { const k = args[i].slice(2); if (k === 'replace') opt[k] = '1'; else opt[k] = args[++i]; } else pos.push(args[i]); }
const [cliente, diseno, folder] = pos;
if (!folder) { console.error('Uso: node push.js <cliente> <diseño> <carpeta> [--nota ..] [--titulo ..] [--entry ..] [--replace]'); process.exit(1); }
const env = {}; try { for (const l of fs.readFileSync(path.join(os.homedir(), '.previews.env'), 'utf8').split('\n')) { const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, ''); } } catch { }
const URL_ = process.env.PREVIEWS_URL || env.PREVIEWS_URL, TOKEN = process.env.PREVIEWS_TOKEN || env.PREVIEWS_TOKEN;
if (!URL_ || !TOKEN) { console.error('Falta PREVIEWS_URL / PREVIEWS_TOKEN (en ~/.previews.env)'); process.exit(1); }
const EXCL = /(^|\/)(node_modules|\.git|build|__pycache__)(\/|$)|\.(mp4|mov|zip|psd|ai|pdf)$|(^|\/)\.[^/]+$/i;
const MAX = +(opt.max || 15) * 1024 * 1024; // omite archivos individuales > 15 MB
const zip = new AdmZip(); let n = 0, skipped = [];
(function walk(dir, rel) { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const r = rel ? rel + '/' + e.name : e.name; if (EXCL.test(r)) { skipped.push(r); continue; } const p = path.join(dir, e.name); if (e.isDirectory()) walk(p, r); else { if (fs.statSync(p).size > MAX) { skipped.push(r + ' (>' + (MAX >> 20) + 'MB)'); continue; } zip.addLocalFile(p, path.dirname(r) === '.' ? '' : path.dirname(r), path.basename(r)); n++; } } })(path.resolve(folder), '');
const buf = zip.toBuffer();
const q = new URLSearchParams({ cliente, diseno, ...(opt.nota && { nota: opt.nota }), ...(opt.titulo && { titulo: opt.titulo }), ...(opt.entry && { entry: opt.entry }), ...(opt.replace && { replace: '1' }) });
console.error(`Subiendo ${n} archivos (${(buf.length / 1048576).toFixed(1)} MB)` + (skipped.length ? `, omitidos: ${skipped.slice(0, 5).join(', ')}${skipped.length > 5 ? '…' : ''}` : ''));
fetch(`${URL_.replace(/\/$/, '')}/api/push?${q}`, { method: 'POST', headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/zip' }, body: buf })
  .then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.error || r.status); console.log(`✔ ${j.cliente}/${j.diseno} ${'v' + j.version} · ${j.files} archivos\n   Galería: ${j.url}\n   Directo: ${j.direct}`); })
  .catch(e => { console.error('✖', e.message); process.exit(1); });
