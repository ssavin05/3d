/* Rendimiento del mapa 3D frenando la CPU, para aproximar un teléfono
   de gama media (4x) y uno modesto (6x). */
import { chromium } from 'playwright';

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

const escenarios = [
  ['Escritorio',      1, 1280, 800],
  ['Móvil gama alta', 2,  390, 844],
  ['Móvil gama media',4,  390, 844],
  ['Móvil modesto',   6,  360, 640],
];

console.log('  perfil              CPU  1ª pantalla   mapa listo   FPS   memoria  lienzo');
console.log('  ' + '─'.repeat(76));

for (const [nombre, freno, w, h] of escenarios) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, locale: 'es-MX' });
  const p = await ctx.newPage();
  await p.addInitScript(() => localStorage.setItem('co.tutorial.visto', '1'));
  const cdp = await ctx.newCDPSession(p);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: freno });

  // Primera pantalla
  const t0 = Date.now();
  await p.goto('http://localhost:8099/#/', { waitUntil: 'domcontentloaded' });
  let primera = null;
  for (let i = 0; i < 150; i++) {
    const n = await p.evaluate(() => document.querySelector('#vista')?.innerText.trim().length || 0);
    if (n > 40) { primera = Date.now() - t0; break; }
    await p.waitForTimeout(100);
  }

  // Mapa 3D
  await p.goto('http://localhost:8099/#/mapa', { waitUntil: 'domcontentloaded' });
  // Se espera a que el mapa este DE VERDAD montado: mientras aparece
  // "Preparando el mapa 3D..." no hay nada que medir.
  let listoEn = null;
  const tm = Date.now();
  for (let i = 0; i < 120; i++) {
    const listo = await p.evaluate(() => {
      const t = document.querySelector('#vista')?.innerText || '';
      const c = document.querySelector('canvas');
      return Boolean(c && c.width > 100) && !/Preparando|Construyendo|Cargando cat/i.test(t);
    });
    if (listo) { listoEn = Date.now() - tm; break; }
    await p.waitForTimeout(500);
  }

  const medida = await p.evaluate(() => new Promise((res) => {
    let n = 0;
    const t0 = performance.now();
    const tick = () => { n++; if (performance.now() - t0 < 3000) requestAnimationFrame(tick);
                         else res({ fps: Math.round(n / ((performance.now() - t0) / 1000)) }); };
    requestAnimationFrame(tick);
  }));

  const mem = await p.evaluate(() => performance.memory
    ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null);
  const objetos = await p.evaluate(() => {
    const c = document.querySelector('canvas');
    return c ? `${c.width}×${c.height}` : 'sin lienzo';
  });

  const alerta = medida.fps < 24 ? '⚠️' : medida.fps < 40 ? ' ·' : ' ✅';
  console.log(`  ${nombre.padEnd(18)} ${String(freno).padStart(2)}x  ` +
    `${String(primera ?? '>15000').padStart(7)} ms  ` +
    `${String(listoEn ?? '>60000').padStart(7)} ms  ` +
    `${String(medida.fps).padStart(3)} ${alerta}  ` +
    `${String(mem ?? '?').padStart(4)} MB  ${objetos}`);

  await ctx.close();
}
await b.close();
