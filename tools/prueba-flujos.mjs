/* Tercera caza: flujos secundarios que ninguna prueba ha tocado.
   Favoritos · lista de espera · reseñas · notificaciones · chat ·
   tema · idioma · administración guardando de verdad · sin conexión. */
import { chromium } from 'playwright';

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 420, height: 900 }, locale: 'es-MX' });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
p.on('console', m => { if (m.type() === 'error' && !/vibrate|net::|Failed to load|ERR_/.test(m.text())) errs.push(m.text().slice(0, 100)); });
await p.addInitScript(() => localStorage.setItem('co.tutorial.visto', '1'));

const hallazgos = [];
const chk = (ok, n, d = '') => { console.log(`  ${ok ? '✅' : '🐛'} ${n}${d ? '  ' + d : ''}`); if (!ok) hallazgos.push(n + (d ? ' — ' + d : '')); };

await p.goto('http://localhost:8099/index.html', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(3200);
const sesion = async () => p.evaluate(async () => {
  const store = (await import('/js/core/store.js')).default;
  store.setSesion({ user: { id: 'u1', email: 'a@b.mx' } }, { id: 'u1', nombre: 'Ana', rol: 'usuario' });
});
await sesion();

console.log('╔═ 1. FAVORITOS ═╗');
const f1 = await p.evaluate(async () => {
  const api = (await import('/js/data/api.js')).default;
  const store = (await import('/js/core/store.js')).default;
  const a = await api.alternarFavorito('demo-of-a');
  const trasAgregar = store.esFavorito('demo-of-a');
  const bq = await api.alternarFavorito('demo-of-a');
  const trasQuitar = store.esFavorito('demo-of-a');
  const lista = await api.getFavoritos();
  return { a, trasAgregar, b: bq, trasQuitar, lista: Array.isArray(lista) ? lista.length : 'no-array' };
});
chk(f1.trasAgregar === true && f1.trasQuitar === false, 'añadir y quitar de favoritos',
  `añadir=${f1.trasAgregar} quitar=${f1.trasQuitar} lista=${f1.lista}`);

console.log('\n╔═ 2. LISTA DE ESPERA ═╗');
const f2 = await p.evaluate(async () => {
  const api = (await import('/js/data/api.js')).default;
  try {
    const r = await api.apuntarseListaEspera('demo-of-a', new Date(Date.now() + 864e5).toISOString().slice(0, 10), null);
    return { ok: Boolean(r), id: r?.id ? 'con id' : 'sin id' };
  } catch (e) { return { ok: false, err: String(e.message).slice(0, 50) }; }
});
chk(f2.ok, 'apuntarse a la lista de espera', f2.err || f2.id);

console.log('\n╔═ 3. RESEÑAS ═╗');
const f3 = await p.evaluate(async () => {
  const api = (await import('/js/data/api.js')).default;
  const antes = (await api.getResenas('demo-of-a')).length;
  const r = await api.publicarResena({ espacioId: 'demo-of-a', calificacion: 5, comentario: 'Muy bien <b>ojo</b>' });
  const despues = await api.getResenas('demo-of-a');
  return { antes, despues: despues.length, mia: despues[0]?.comentario, crece: despues.length >= antes };
});
chk(f3.crece && f3.mia, 'publicar una reseña y verla', `${f3.antes}→${f3.despues}`);

console.log('\n╔═ 4. NOTIFICACIONES ═╗');
const f4 = await p.evaluate(async () => {
  const api = (await import('/js/data/api.js')).default;
  const store = (await import('/js/core/store.js')).default;
  // Deben deduplicarse aunque llegue la misma tres veces.
  const n = { id: 'n1', titulo: 'Hola', leida: false };
  store.setNotificaciones([n, n, { ...n }, { id: 'n2', titulo: 'Otra', leida: true }]);
  const s = store.get();
  const lista = await api.getNotificaciones();
  return { total: s.notificaciones.length, noLeidas: s.noLeidas, api: Array.isArray(lista) };
});
chk(f4.total === 2 && f4.noLeidas === 1, 'las notificaciones repetidas se colapsan',
  `${f4.total} únicas · ${f4.noLeidas} sin leer`);

console.log('\n╔═ 5. TEMA E IDIOMA ═╗');
for (const tema of ['oscuro', 'claro', 'auto']) {
  const r = await p.evaluate(async (t) => {
    const { setTema, temaEfectivo } = await import('/js/core/tema.js');
    setTema(t);
    return { attr: document.documentElement.getAttribute('data-tema'), efectivo: temaEfectivo(),
             fondo: getComputedStyle(document.body).backgroundColor };
  }, tema);
  chk(Boolean(r.efectivo) && r.fondo !== 'rgba(0, 0, 0, 0)', `tema ${tema}`, `${r.efectivo} · ${r.fondo}`);
}
const idi = await p.evaluate(async () => {
  const { setIdioma, t, getIdioma } = await import('/js/core/i18n.js');
  setIdioma('en'); const en = t('nav.inicio');
  setIdioma('es'); const es = t('nav.inicio');
  return { en, es, actual: getIdioma(), distintos: en !== es };
});
chk(idi.distintos, 'cambiar de idioma traduce', `"${idi.es}" / "${idi.en}"`);

console.log('\n╔═ 6. ADMINISTRACIÓN GUARDANDO ═╗');
const f6 = await p.evaluate(async () => {
  const api = (await import('/js/data/api.js')).default;
  const store = (await import('/js/core/store.js')).default;
  store.setSesion({ user: { id: 'admin1' } }, { id: 'admin1', rol: 'admin' });
  const r = {};
  try { r.metricas = Boolean(await api.adminMetricas()); } catch (e) { r.metricas = 'error: ' + e.message.slice(0, 30); }
  try { r.reservas = Array.isArray(await api.adminReservas()); } catch (e) { r.reservas = 'error: ' + e.message.slice(0, 30); }
  try { r.usuarios = Array.isArray(await api.adminUsuarios()); } catch (e) { r.usuarios = 'error: ' + e.message.slice(0, 30); }
  return r;
});
Object.entries(f6).forEach(([n, v]) => chk(v === true, `admin ${n} responde sin reventar`, String(v)));

console.log('\n╔═ 7. SIN CONEXIÓN ═╗');
await ctx.setOffline(true);
await p.goto('http://localhost:8099/#/espacios', { waitUntil: 'domcontentloaded' }).catch(() => {});
await p.waitForTimeout(2500);
const off = await p.evaluate(() => ({
  n: document.querySelector('#vista')?.innerText.trim().length || 0,
  franja: /sin conexión|offline/i.test(document.body.innerText),
}));
chk(off.n > 50, 'el catálogo se ve sin conexión', `${off.n} chars · aviso=${off.franja}`);
await ctx.setOffline(false);

console.log('\n' + '═'.repeat(50));
console.log(hallazgos.length ? `🐛 ${hallazgos.length}:\n   - ` + hallazgos.join('\n   - ') : '✅ sin hallazgos');
if (errs.length) console.log('\n❌ errores:\n   ' + [...new Set(errs)].slice(0, 5).join('\n   '));
await b.close();
