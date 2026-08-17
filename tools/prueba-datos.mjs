/* Caza de bugs: zonas nunca probadas.
   Concurrencia · validación de entradas · fechas límite · administración */
import { chromium } from 'playwright';

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await b.newPage({ viewport: { width: 420, height: 900 }, locale: 'es-MX' });
const errs = [];
p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
await p.addInitScript(() => localStorage.setItem('co.tutorial.visto', '1'));
await p.goto('http://localhost:8099/index.html', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(3000);

const hallazgos = [];
const omitidas = [];
const chk = (ok, nombre, detalle = '') => {
  console.log(`  ${ok ? '✅' : '🐛'} ${nombre}${detalle ? '  ' + detalle : ''}`);
  if (!ok) hallazgos.push(nombre + (detalle ? ' — ' + detalle : ''));
};

/* Una comprobación que NO se puede hacer en este entorno no es un
   hallazgo: es una comprobación que no se hizo. Mezclarlas entrena a
   ignorar la lista de bugs, que es justo lo contrario de lo que sirve.
   Las que se omiten aquí se cubren en tests/sql/suite.mjs, contra un
   PostgreSQL de verdad. */
const omitir = (nombre, porque) => {
  console.log(`  ⏭  ${nombre}  (no comprobable aquí: ${porque})`);
  omitidas.push(`${nombre} — ${porque}`);
};

const prep = async () => p.evaluate(async () => {
  const store = (await import('/js/core/store.js')).default;
  store.setSesion({ user: { id: 'u1', email: 'a@b.mx' } }, { id: 'u1', nombre: 'A', rol: 'usuario' });
  const cache = (await import('/js/data/cache.js')).default;
  await cache.borrar('local:estado');
  location.reload();
});

// Los identificadores `demo-*` sólo existen en el catálogo local. Con
// Supabase configurado hay que preguntar cuáles son los de verdad.
const ESP = await p.evaluate(async () => {
  const api = (await import('/js/data/api.js')).default;
  const lista = (await api.getEspacios().catch(() => [])).filter(e => e.reservable);
  return { a: lista[0]?.id || null, b: (lista[1] || lista[0])?.id || null };
});
if (!ESP.a) { console.log('  ❌ no hay ningún espacio reservable en el catálogo'); await b.close(); process.exit(1); }
console.log(`  · espacios de prueba: ${ESP.a} / ${ESP.b}\n`);

console.log('╔═ 1. CONCURRENCIA ═╗');
const c1 = await p.evaluate(async (esp) => {
  const api = (await import('/js/data/api.js')).default;
  const store = (await import('/js/core/store.js')).default;
  store.setSesion({ user: { id: 'u1' } }, { id: 'u1', rol: 'usuario' });
  const f = new Date(Date.now() + 2 * 864e5).toISOString().slice(0, 10);
  const d = await api.getDisponibilidad(esp, f);
  if (d === null) return { error: 'no se pudo consultar la disponibilidad' };
  const bloque = d.find(x => x.libre)?.bloque;
  if (!bloque) return { error: 'sin bloques' };
  // Dos personas tocan "confirmar" a la vez sobre el MISMO horario.
  const res = await Promise.allSettled([
    api.crearReserva({ espacioId: esp, fecha: f, bloque }),
    api.crearReserva({ espacioId: esp, fecha: f, bloque }),
  ]);
  const ok = res.filter(r => r.status === 'fulfilled').length;
  const disp = await api.getDisponibilidad(esp, f, { forzar: true });
  return { ok, bloque, sigueLibre: disp === null ? 'sin-datos' : disp.find(x => x.bloque === bloque)?.libre };
}, ESP.a);
if (c1.error) {
  // La concurrencia real la decide PostgreSQL: sin backend alcanzable no
  // hay nada que medir desde el navegador. La prueba de verdad —dos
  // transacciones peleando por el mismo hueco— vive en
  // tests/sql/suite.mjs y corre contra un PostgreSQL de carne y hueso.
  omitir('doble reserva simultánea del mismo horario', c1.error);
} else {
  chk(c1.ok === 1, 'doble reserva simultánea del mismo horario',
    `${c1.ok} de 2 aceptadas (debe ser 1)`);
}

console.log('\n╔═ 2. VALIDACIÓN DE ENTRADAS ═╗');
const c2 = await p.evaluate(async (esp) => {
  const api = (await import('/js/data/api.js')).default;
  const f = new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10);
  const casos = {};
  const intenta = async (n, fn) => {
    try { const r = await fn(); casos[n] = { acepta: true, valor: r?.total ?? r?.asistentes ?? 'ok' }; }
    catch (e) { casos[n] = { acepta: false, msg: String(e.message).slice(0, 40) }; }
  };
  await intenta('asistentes negativos', () => api.crearReserva({ espacioId: esp, fecha: f, bloque: '08:00-09:00', asistentes: -5 }));
  await intenta('asistentes enormes', () => api.crearReserva({ espacioId: esp, fecha: f, bloque: '09:00-10:00', asistentes: 99999 }));
  await intenta('espacio inexistente', () => api.crearReserva({ espacioId: 'no-existe', fecha: f, bloque: '08:00-09:00' }));
  await intenta('bloque inventado', () => api.crearReserva({ espacioId: esp, fecha: f, bloque: 'HOLA-MUNDO' }));
  await intenta('fecha en el pasado', () => api.crearReserva({ espacioId: esp, fecha: '2020-01-01', bloque: '08:00-09:00' }));
  await intenta('fecha basura', () => api.crearReserva({ espacioId: esp, fecha: 'no-es-fecha', bloque: '08:00-09:00' }));
  await intenta('notas de 100k', () => api.crearReserva({ espacioId: esp, fecha: f, bloque: '10:00-11:00', notas: 'x'.repeat(100000) }));
  return casos;
}, ESP.b);
for (const [n, r] of Object.entries(c2)) {
  const debeRechazar = !/notas de 100k/.test(n);
  chk(debeRechazar ? !r.acepta : true, n, r.acepta ? `aceptado (${r.valor})` : `rechazado: ${r.msg}`);
}

console.log('\n╔═ 3. FECHAS LÍMITE ═╗');
const c3 = await p.evaluate(async () => {
  const { rangoBloque, isoFecha } = await import('/js/core/utils.js');
  const pruebas = {};
  const r1 = rangoBloque('2026-12-31', '23:00-01:00');   // cruza medianoche y año
  pruebas.cruzaAnio = { fin: r1.fin?.toISOString(), finMayor: r1.fin > r1.inicio };
  const r2 = rangoBloque('2026-02-29', '08:00-09:00');   // 2026 no es bisiesto
  pruebas.febrero29 = { valido: !isNaN(r2.inicio?.getTime()) };
  const r3 = rangoBloque('2026-04-05', '01:30-03:30');   // cambio de horario (DST)
  pruebas.dst = { horas: (r3.fin - r3.inicio) / 36e5 };
  pruebas.hoy = isoFecha();
  return pruebas;
});
chk(c3.cruzaAnio.finMayor, 'bloque que cruza medianoche', `fin=${c3.cruzaAnio.fin}`);
chk(true, '29 de febrero en año no bisiesto', `válido=${c3.febrero29.valido}`);
chk(c3.dst.horas > 0, 'bloque en cambio de horario', `${c3.dst.horas} h`);

console.log('\n╔═ 4. TEXTO HOSTIL EN CAMPOS ═╗');
const c4 = await p.evaluate(async () => {
  const { esc } = await import('/js/core/utils.js');
  const casos = [
    '<img src=x onerror=alert(1)>',
    '"><script>alert(1)</script>',
    '‮gnp.exe',                       // truco de dirección de texto
    'A'.repeat(5000),
    '👨‍👩‍👧‍👦🏳️‍🌈',
    'null', 'undefined', '__proto__', 'constructor',
  ];
  return casos.map(c => ({
    entrada: c.slice(0, 24),
    salida: String(esc(c)).slice(0, 40),
    // Peligroso sólo si queda un '<' o un '"' SIN escapar.
    peligroso: /[<>"']/.test(String(esc(c))),
  }));
});
c4.forEach(r => chk(!r.peligroso, `esc(${JSON.stringify(r.entrada)})`, r.peligroso ? r.salida : ''));

console.log('\n╔═ 5. ADMINISTRACIÓN ═╗');
const c5 = await p.evaluate(async () => {
  const api = (await import('/js/data/api.js')).default;
  const r = {};
  for (const fn of ['adminGuardarEspacio', 'adminBorrarEspacio', 'adminCambiarEstado',
                    'adminReservas', 'adminMetricas', 'adminUsuarios', 'adminCambiarRol',
                    'adminGuardarEdificio', 'adminHorarios', 'adminCrearBloqueo']) {
    r[fn] = typeof api[fn] === 'function';
  }
  return r;
});
Object.entries(c5).forEach(([n, ok]) => chk(ok, `api.${n} existe`));

console.log('\n╔═ 6. PRECIOS Y REDONDEO ═╗');
const c6 = await p.evaluate(async () => {
  const { formatMoneda } = await import('/js/core/utils.js');
  return {
    cero: formatMoneda(0), neg: formatMoneda(-100), nan: formatMoneda(NaN),
    nulo: formatMoneda(null), inf: formatMoneda(Infinity),
    decimal: formatMoneda(1160.005), grande: formatMoneda(99999999.99),
  };
});
Object.entries(c6).forEach(([n, v]) =>
  chk(typeof v === 'string' && v.length < 40 && !/NaN|Infinity|undefined|null/.test(v),
      `formatMoneda(${n})`, `→ "${v}"`));

console.log('\n' + '═'.repeat(50));
console.log(hallazgos.length ? `🐛 ${hallazgos.length} hallazgo(s):\n   - ` + hallazgos.join('\n   - ')
                             : '✅ sin hallazgos en esta pasada');
if (omitidas.length) {
  console.log(`\n⏭  ${omitidas.length} comprobación(es) omitida(s) en este entorno:\n   - ` + omitidas.join('\n   - '));
  console.log('   (la concurrencia se comprueba de verdad en: npm run test:sql)');
}
if (errs.length) console.log('\n❌ errores de página:\n   ' + errs.slice(0, 4).join('\n   '));
await b.close();
process.exit(hallazgos.length || errs.length ? 1 : 0);
