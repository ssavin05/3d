/* Segunda caza: interacción real con clics y teclado. */
import { chromium } from 'playwright';

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await b.newPage({ viewport: { width: 420, height: 900 }, locale: 'es-MX' });
const errs = [];
p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
p.on('console', m => { if (m.type() === 'error' && !/vibrate|net::|Failed to load/.test(m.text())) errs.push(m.text().slice(0, 100)); });
await p.addInitScript(() => localStorage.setItem('co.tutorial.visto', '1'));

const hallazgos = [];
const chk = (ok, n, d = '') => { console.log(`  ${ok ? '✅' : '🐛'} ${n}${d ? '  ' + d : ''}`); if (!ok) hallazgos.push(n + (d ? ' — ' + d : '')); };

await p.goto('http://localhost:8099/#/', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(3500);

console.log('╔═ 1. BUSCADOR ═╗');
const buscador = await p.$('input[type="search"], #buscador, input[placeholder*="Buscar"]');
if (buscador) {
  for (const q of ['sala', 'ZZZZZ', '<script>', '   ', 'ñ']) {
    await buscador.fill(q);
    await p.waitForTimeout(500);
    const r = await p.evaluate(() => ({
      n: document.querySelectorAll('.tarjeta-espacio').length,
      texto: document.querySelector('#vista')?.innerText.length || 0,
    }));
    chk(r.texto > 30, `buscar ${JSON.stringify(q)}`, `${r.n} resultados`);
  }
  await buscador.fill('');
  await p.waitForTimeout(400);
} else chk(false, 'el buscador existe en la portada');

console.log('\n╔═ 2. FILTROS ═╗');
const chips = await p.$$('[data-filtro]');
chk(chips.length > 0, 'hay filtros', `${chips.length}`);
for (let i = 0; i < Math.min(chips.length, 6); i++) {
  const nombre = (await chips[i].innerText()).trim().slice(0, 18);
  await chips[i].click();
  await p.waitForTimeout(450);
  const n = await p.evaluate(() => document.querySelectorAll('.tarjeta-espacio').length);
  const vacio = await p.evaluate(() => /Sin resultados/i.test(document.querySelector('#vista')?.innerText || ''));
  chk(n > 0 || vacio, `filtro "${nombre}"`, `${n} tarjetas${vacio ? ' (vacío declarado)' : ''}`);
}

console.log('\n╔═ 3. MAPA 3D: CLIC EN UN ESPACIO ═╗');
await p.goto('http://localhost:8099/#/mapa', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(6000);
const lienzo = await p.$('canvas');
chk(Boolean(lienzo), 'el lienzo existe');
if (lienzo) {
  const caja = await lienzo.boundingBox();
  // Barrido de clics buscando alguna sala.
  let abrio = false;
  for (const [fx, fy] of [[0.5, 0.45], [0.35, 0.35], [0.65, 0.55], [0.45, 0.7], [0.3, 0.6]]) {
    await p.mouse.click(caja.x + caja.width * fx, caja.y + caja.height * fy);
    await p.waitForTimeout(700);
    // El panel del mapa es #mapa-panel y se abre con la clase `abierto`.
    // Antes se buscaba `.hoja`/`.panel-espacio`/`[data-hoja]` —que no
    // existen— y se caía en el texto: sólo daba por abierto el panel de
    // un espacio EN RENTA, porque buscaba «Reservar» o un «$». Un cuarto
    // fuera de catálogo abre su panel igual, sin botón ni precio.
    const hoja = await p.evaluate(() =>
      Boolean(document.querySelector('#mapa-panel.abierto')) ||
      /Reservar|Detalles|\$/i.test(document.querySelector('#vista')?.innerText || ''));
    if (hoja) { abrio = true; break; }
  }
  chk(abrio, 'tocar una sala abre su información');
  // Zoom y rotación no deben romper nada.
  await p.mouse.move(caja.x + caja.width / 2, caja.y + caja.height / 2);
  await p.mouse.wheel(0, -400);
  await p.waitForTimeout(300);
  await p.mouse.wheel(0, 800);
  await p.waitForTimeout(300);
  await p.mouse.down(); await p.mouse.move(caja.x + 60, caja.y + 120, { steps: 8 }); await p.mouse.up();
  await p.waitForTimeout(500);
  const vivo = await p.evaluate(() => { const c = document.querySelector('canvas'); return c && c.width > 50; });
  chk(vivo, 'zoom y arrastre no rompen el lienzo');
}

console.log('\n╔═ 4. FORMULARIOS: REGISTRO ═╗');
await p.goto('http://localhost:8099/#/registro', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(1800);
const campos = await p.evaluate(() => ({
  email: Boolean(document.querySelector('input[type="email"], #r-email')),
  pass: Boolean(document.querySelector('input[type="password"]')),
  submit: Boolean(document.querySelector('button[type="submit"]')),
}));
chk(campos.email && campos.pass && campos.submit, 'el formulario de registro está completo', JSON.stringify(campos));
if (campos.email) {
  await p.fill('input[type="email"]', 'no-es-un-correo');
  const pw = await p.$('input[type="password"]');
  if (pw) await pw.fill('123');
  await p.click('button[type="submit"]').catch(() => {});
  await p.waitForTimeout(900);
  const aviso = await p.evaluate(() =>
    /no válido|inválid|incorrect|debe|mínimo|caracteres/i.test(document.body.innerText));
  chk(aviso, 'avisa con correo y contraseña inválidos');
}

console.log('\n╔═ 5. NAVEGACIÓN CON TECLADO ═╗');
await p.goto('http://localhost:8099/#/', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(2500);
let enfocables = 0;
for (let i = 0; i < 12; i++) {
  await p.keyboard.press('Tab');
  const t = await p.evaluate(() => {
    const a = document.activeElement;
    return a && a !== document.body ? a.tagName + (a.className ? '.' + String(a.className).split(' ')[0] : '') : null;
  });
  if (t) enfocables++;
}
chk(enfocables >= 8, 'se puede navegar con Tab', `${enfocables}/12 paradas`);
const visible = await p.evaluate(() => {
  const a = document.activeElement;
  if (!a || a === document.body) return false;
  const e = getComputedStyle(a);
  return e.outlineStyle !== 'none' || e.boxShadow !== 'none' || Boolean(a.matches(':focus-visible'));
});
chk(visible, 'el elemento enfocado se ve');

console.log('\n╔═ 6. VOLVER ATRÁS ═╗');
await p.goto('http://localhost:8099/#/espacios', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(1500);
await p.goto('http://localhost:8099/#/ayuda', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(1200);
await p.goBack(); await p.waitForTimeout(1500);
const tras = await p.evaluate(() => ({ hash: location.hash, n: document.querySelector('#vista')?.innerText.trim().length || 0 }));
chk(tras.hash.includes('espacios') && tras.n > 50, 'el botón Atrás vuelve y repinta', `${tras.hash} · ${tras.n} chars`);

console.log('\n' + '═'.repeat(50));
console.log(hallazgos.length ? `🐛 ${hallazgos.length} hallazgo(s):\n   - ` + hallazgos.join('\n   - ') : '✅ sin hallazgos');
if (errs.length) console.log('\n❌ errores:\n   ' + [...new Set(errs)].slice(0, 5).join('\n   '));
await b.close();
