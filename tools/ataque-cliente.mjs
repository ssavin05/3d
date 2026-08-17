import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
const p = await b.newPage({ viewport:{width:900,height:900}, locale:'es-MX' });
const xss=[]; p.on('dialog', d=>{ xss.push(d.message()); d.dismiss(); });
await p.goto('http://localhost:8099/index.html',{waitUntil:'domcontentloaded'});
await p.waitForTimeout(2500);

console.log('╔═ ATAQUE A · Espacio "oculto" por el administrador ═╗');
await p.evaluate(() => localStorage.setItem('co.ajustes',
  JSON.stringify({ ocultos: { 'demo-sj-01': true } })));
await p.reload({waitUntil:'domcontentloaded'});
await p.waitForTimeout(2500);
const r1 = await p.evaluate(async () => {
  const api = (await import('/js/data/api.js')).default;
  const lista = await api.getEspacios();
  const directo = await api.getEspacio('demo-sj-01');
  return { enCatalogo: lista.some(e=>e.id==='demo-sj-01'), porUrlDirecta: directo?.nombre || null };
});
console.log('  en el catálogo:', r1.enCatalogo ? '❌ visible' : '✅ oculto');
console.log('  por URL directa:', r1.porUrlDirecta ? `❌ accesible ("${r1.porUrlDirecta}")` : '✅ bloqueado');

console.log('\n╔═ ATAQUE B · Ajustes manipulados a mano ═╗');
const r2 = await p.evaluate(async () => {
  localStorage.setItem('co.ajustes', '{"features":{"pagos":"<img src=x onerror=alert(1)>"},"ocultos":"no-es-objeto"}');
  const cfg = await import('/js/core/config.js?v=' + Date.now());
  try { const api = (await import('/js/data/api.js?v=' + Date.now())).default;
        const l = await api.getEspacios(); return { ok:true, n:l.length }; }
  catch(e) { return { ok:false, err:e.message }; }
});
console.log('  ajustes con basura:', r2.ok ? `✅ la app sigue (${r2.n} espacios)` : `❌ revienta: ${r2.err}`);

console.log('\n╔═ ATAQUE C · URL de plano hostil ═╗');
const r3 = await p.evaluate(async () => {
  const { urlMedioSegura } = await import('/js/core/utils.js');
  return ['javascript:alert(1)','data:text/html,<script>alert(1)</script>',
          'https://evil.example.com/x.png','assets/plano.png','data:image/png;base64,iVBOR']
    .map(u => `${u.slice(0,42).padEnd(44)} → ${JSON.stringify(urlMedioSegura(u).slice(0,42))}`);
});
r3.forEach(l=>console.log('  '+l));

console.log('\n╔═ ATAQUE D · Intentar resucitar pagos retirados ═╗');
const r4 = await p.evaluate(async () => {
  const src = await fetch('/js/payments/index.js').then(r => r.text());
  const rutas = ['stripe','tarjeta','paypal','mercadopago','wallets','transferencia'];
  const estados = await Promise.all(rutas.map(async id => [id, (await fetch(`/js/payments/${id}.js`)).status]));
  return {
    registryRetirado: /(stripe|paypal|mercadopago|transferencia|wallets)\.js/.test(src),
    archivosVivos: estados.filter(([,status]) => status !== 404),
  };
});
console.log('  registro sólo Clip:', r4.registryRetirado ? '❌ referencia pasarela retirada' : '✅');
console.log('  adaptadores retirados:', r4.archivosVivos.length ? `❌ ${JSON.stringify(r4.archivosVivos)}` : '✅ eliminados');

console.log('\n═══ XSS ejecutados:', xss.length ? '❌ '+xss.join(', ') : 'ninguno', '═══');
await b.close();
