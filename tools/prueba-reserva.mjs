/* Recorrido completo: elegir espacio → reservar → pagar → verla en
   "Mis reservas" → cancelar → comprobar que persiste al recargar. */
import { chromium } from 'playwright';

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await b.newPage({ viewport: { width: 420, height: 900 }, locale: 'es-MX' });
const errs = [];
p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
p.on('console', m => { if (m.type() === 'error' && !/vibrate|net::|Failed to load/.test(m.text())) errs.push(m.text().slice(0, 120)); });
await p.addInitScript(() => localStorage.setItem('co.tutorial.visto', '1'));

const paso = (ok, txt, extra = '') => console.log(`  ${ok ? '✅' : '❌'} ${txt}${extra ? '  ' + extra : ''}`);

await p.goto('http://localhost:8099/index.html', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(3000);

// 0. Qué espacio usamos. NO se puede dar por hecho `demo-sj-01`: ése sólo
//    existe en el catálogo local. Con Supabase configurado el catálogo es
//    el de verdad, así que se pregunta.
const ESP = await p.evaluate(async () => {
  const api = (await import('/js/data/api.js')).default;
  const lista = (await api.getEspacios().catch(() => [])).filter(e => e.reservable);
  // El más grande: así los 4 asistentes de la prueba caben seguro.
  const e = lista.sort((x, y) => (y.capacidad || 0) - (x.capacidad || 0))[0];
  return e ? { id: e.id, capacidad: e.capacidad || 1 } : null;
});
if (!ESP) { console.log('  ❌ no hay ningún espacio reservable en el catálogo'); await b.close(); process.exit(1); }
const ASIST = Math.min(4, ESP.capacidad);
console.log(`  · espacio de prueba: ${ESP.id} (cap. ${ESP.capacidad}) · ${ASIST} asistente(s)`);

// 1. Reservar por API (el flujo que usa la vista), con sesión local simulada.
const r1 = await p.evaluate(async ({ esp, asistentes }) => {
  const api = (await import('/js/data/api.js')).default;
  const store = (await import('/js/core/store.js')).default;
  store.setSesion({ user: { id: 'u-prueba', email: 'prueba@ejemplo.mx' } },
                  { id: 'u-prueba', nombre: 'Prueba', email: 'prueba@ejemplo.mx', rol: 'usuario' });
  const disp = await api.getDisponibilidad(esp, new Date(Date.now() + 864e5).toISOString().slice(0, 10));
  // `null` = no se pudo consultar. No es lo mismo que «todo ocupado», y
  // sobre todo no se puede inventar un hueco para seguir la prueba.
  if (disp === null) return { error: 'no se pudo consultar la disponibilidad (backend caído)' };
  const libre = disp.find(d => d.libre);
  if (!libre) return { error: 'no hay bloques libres mañana' };
  const res = await api.crearReserva({
    espacioId: esp,
    fecha: new Date(Date.now() + 864e5).toISOString().slice(0, 10),
    bloque: libre.bloque, asistentes, notas: 'Prueba automática',
  });
  return { id: res.id, folio: res.folio, total: res.total, estado: res.estado, bloque: libre.bloque };
}, { esp: ESP.id, asistentes: ASIST });
paso(!r1.error && r1.id, 'crear reserva', r1.error || `${r1.folio} · ${r1.bloque} · $${r1.total} · ${r1.estado}`);
if (r1.error) { await b.close(); process.exit(1); }

// 2. ¿Aparece en "Mis reservas"?
const r2 = await p.evaluate(async () => {
  const api = (await import('/js/data/api.js')).default;
  const lista = await api.getMisReservas();
  return { n: lista.length, tiene: lista.some(x => x.id) };
});
paso(r2.n > 0, 'aparece en Mis reservas', `${r2.n} reserva(s)`);

// 3. ¿Se registró el movimiento en el historial de pagos?
const r3 = await p.evaluate(async () => {
  const api = (await import('/js/data/api.js')).default;
  const pagos = await api.getPagos();
  return { n: pagos.length, monto: pagos[0]?.monto, estado: pagos[0]?.estado };
});
paso(r3.n > 0, 'movimiento en el historial de pagos', `$${r3.monto} · ${r3.estado}`);

// 4. Ese horario ya no debe estar libre.
const r4 = await p.evaluate(async ({ bloque, esp }) => {
  const api = (await import('/js/data/api.js')).default;
  const disp = await api.getDisponibilidad(esp,
    new Date(Date.now() + 864e5).toISOString().slice(0, 10), { forzar: true });
  if (disp === null) return 'sin-datos';
  return disp.find(d => d.bloque === bloque)?.libre;
}, { bloque: r1.bloque, esp: ESP.id });
paso(r4 === false, 'el horario queda ocupado', `libre=${r4}`);

// 5. Recargar: ¿sobrevive?
await p.reload({ waitUntil: 'domcontentloaded' });
await p.waitForTimeout(3000);
const r5o = await p.evaluate(async () => {
  const api = (await import('/js/data/api.js')).default;
  const mock = await import('/js/data/mock.js');
  const cache = (await import('/js/data/cache.js')).default;
  const store = (await import('/js/core/store.js')).default;
  store.setSesion({ user: { id: 'u-prueba' } }, { id: 'u-prueba', rol: 'usuario' });
  const disco = await cache.leer('local:estado');
  const enMock = (await mock.misReservas()).length;
  const n = (await api.getMisReservas()).length;
  return { disco: disco?.reservas?.length ?? -1, enMock, n };
});
const r5 = r5o.n;
paso(r5 > 0, 'sobrevive a recargar la página', `disco=${r5o.disco} mock=${r5o.enMock} api=${r5o.n}`);

// 6. Cancelar.
const r6 = await p.evaluate(async ({ id, esp }) => {
  const api = (await import('/js/data/api.js')).default;
  const r = await api.cancelarReserva(id);
  const disp = await api.getDisponibilidad(esp,
    new Date(Date.now() + 864e5).toISOString().slice(0, 10), { forzar: true });
  return { estado: r?.estado, libres: disp === null ? 'sin-datos' : disp.filter(d => d.libre).length };
}, { id: r1.id, esp: ESP.id });
paso(r6.estado === 'cancelada', 'cancelar la reserva', `${r6.estado}`);

// 7. La vista de mis reservas debe renderizar de verdad.
await p.goto('http://localhost:8099/#/reservas', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(2500);
const r7 = await p.evaluate(() => document.querySelector('#vista')?.innerText.trim().length || 0);
paso(r7 > 50, 'la vista Mis reservas pinta', `${r7} chars`);

console.log('\n' + (errs.length ? '❌ ' + errs.slice(0, 3).join('\n   ') : '✅ recorrido completo sin errores'));
await b.close();
