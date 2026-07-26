/* ======================================================================
   ⭐ ESTE ES EL ÚNICO ARCHIVO QUE NECESITAS TOCAR PARA:
      - Agregar/editar una oficina, sala o "reward"
      - Cambiar precio, horarios, fotos, descripción o amenidades
      - Cambiar el estado (Disponible / Reservada / Mantenimiento / Próximamente)

   NO necesitas tocar ningún otro archivo .js para eso. Copia uno de los
   objetos dentro de ROOMS, cambia sus datos y listo.

   ⚠️ LAYOUT ACTUALIZADO (v4): las coordenadas de este archivo se volvieron
   a trazar directamente sobre el plano arquitectónico (P.A.P.) que subió
   el cliente, usando las COTAS EN METROS impresas en el plano en vez de
   medir píxeles a ojo. `rect(x, y, w, h)` recibe metros reales: x/y es la
   esquina superior-izquierda del espacio (norte-oeste) y w/h su ancho y
   fondo. El edificio completo mide 22.45 m de ancho x 29.60 m de fondo.
   Si el plano físico vuelve a cambiar, hay que volver a medir sobre el
   plano y ajustar los rect() de aquí abajo (y CENTER_X/CENTER_Y en
   config-utils.js si el tamaño total cambia).
   ====================================================================== */
/* ============================== rooms.js ============================== */
/* ======================================================================
   rooms.js — Catálogo de espacios del centro de oficinas + lógica de
   disponibilidad/estado. Todo el edificio se describe con UN solo
   arreglo (ROOMS), pensado para que un futuro panel de administración
   pueda leerlo/escribirlo tal cual (o generarlo desde una API/BD).

   Para agregar una nueva oficina, sala o piso basta con añadir un
   objeto más a ROOMS con la misma forma. No hace falta tocar ningún
   otro módulo.
   ====================================================================== */
/* ---- amenidades: azúcar sintáctica para no repetir claves largas ---- */
function am(...keys) {
  const o = {};
  keys.forEach(k => (o[k] = true));
  return o;
}

/* genera la disponibilidad de cada día a partir de un patrón base para
   "Hoy" y un hash estable (sala + día) para el resto de las fechas */
function horariosPorDia(basePattern, seed) {
  const porDia = {};
  DAYS.forEach((_, di) => {
    let pattern;
    if (di === 0) {
      pattern = basePattern;
    } else {
      pattern = HOURS.map((_, i) => (hashInt(`${seed}|${di}|${i}`) % 100) < 60);
    }
    porDia[di] = HOURS.map((h, i) => {
      const [inicio, fin] = h.split("-");
      return { inicio, fin, ocupado: !!pattern[i] };
    });
  });
  return porDia;
}

/* ======================================================================
   1. ARREGLO ÚNICO DE ESPACIOS (fuente de verdad, lista para admin)
   ====================================================================== */
/* ----------------------------------------------------------------------
   Cuadrícula del plano (cotas en metros, tomadas del plano P.A.P.):

   Columna A (x  0.00- 5.15): Oficina Principal / Baño / Jardín Privado /
                               Espacio Abierto
   Columna B (x  5.15- 9.75): Sala de Juntas / Lobby / Baño / Oficina B /
                               Archivero / Cochera
   Columna C (x  9.75-16.45): Patio 1 / Cocina + Baño + Servicio /
                               Almacén / Oficina + Recepción
   Columna D (x 16.45-22.45): Patio 2 / Oficina A / Oficina D / Baño /
                               Almacén / Oficina C

   `door` indica en qué muro y con qué desplazamiento (en metros, desde
   el centro de esa pared) va la puerta. `open: true` = espacio sin muro
   completo (patio, jardines, cochera), con un bordillo bajo en vez de
   muro alto y totalmente abierto por el lado de la puerta.
   ---------------------------------------------------------------------- */
const ROOMS = [
  /* ==================== ESPACIOS RENTABLES (oficinas y salas) ==================== */
  {
    id: "oficina-principal", nombre: "Oficina Principal", codigo: "OF-PRINCIPAL", icon: "🏢", bookable: true,
    estado: STATUS.DISPONIBLE.id,
    rect: rect(0.00, 0.00, 5.15, 5.35), capacidad: 8,
    door: { side: "s", offset: 1.8, glass: true, width: 1.15 },
    wallHeight: 2.6,
    precioHora: 320, precioDia: 2100,
    desc: "Oficina en la esquina noroeste del edificio, con luz natural directa y acceso rápido al jardín privado. Ideal para dirección o equipos que necesitan un espacio propio todo el día.",
    amenities: am("wifi", "ac", "proyector", "accesible", "estacionamiento"),
    fotos: ["🏢", "🌿", "💼"],
    horariosPorDia: horariosPorDia([1, 1, 0, 0, 1, 1], "OFP-01"),
  },
  {
    id: "sala-juntas", nombre: "Sala de Juntas", codigo: "SJ-01", icon: "📊", bookable: true,
    estado: STATUS.DISPONIBLE.id,
    rect: rect(5.15, 0.00, 4.60, 4.00), capacidad: 10,
    door: { side: "s", offset: 0 },
    wallHeight: 2.4,
    precioHora: 350, precioDia: 2200,
    desc: "Sala ejecutiva con mesa para diez personas, ideal para juntas, entrevistas o presentaciones a clientes.",
    amenities: am("wifi", "ac", "proyector", "pizarron", "accesible", "cafe"),
    fotos: ["🗂", "🖥️", "☕"],
    horariosPorDia: horariosPorDia([1, 1, 1, 0, 1, 0], "SJ-01"),
  },
  {
    id: "oficina-b", nombre: "Oficina B", codigo: "OF-B", icon: "🏢", bookable: true,
    estado: STATUS.DISPONIBLE.id,
    rect: rect(5.15, 8.00, 4.60, 4.80), capacidad: 4,
    door: { side: "n", offset: 0 },
    wallHeight: 2.4,
    precioHora: 200, precioDia: 1300,
    desc: "Oficina privada de tamaño mediano en el corazón del edificio, junto al archivero, ideal para equipos pequeños que necesitan concentración.",
    amenities: am("wifi", "ac", "accesible"),
    fotos: ["🏢", "🪑", "💻"],
    horariosPorDia: horariosPorDia([0, 1, 1, 0, 0, 1], "OFB-01"),
  },
  {
    id: "oficina-a", nombre: "Oficina A", codigo: "OF-A", icon: "🏢", bookable: true,
    estado: STATUS.DISPONIBLE.id,
    rect: rect(16.45, 12.90, 6.00, 4.10), capacidad: 6,
    door: { side: "w", offset: 0, glass: true, width: 1.15 },
    wallHeight: 2.4,
    precioHora: 260, precioDia: 1700,
    desc: "Oficina ubicada en el ala este del edificio, junto al Patio 2. Perfecta para equipos que buscan independencia y comodidad.",
    amenities: am("wifi", "ac", "proyector", "accesible"),
    fotos: ["🏢", "🚿", "📶"],
    horariosPorDia: horariosPorDia([1, 0, 1, 1, 0, 1], "OFA-01"),
  },
  {
    id: "oficina-d", nombre: "Oficina D", codigo: "OF-D", icon: "🏢", bookable: true,
    estado: STATUS.RESERVADA.id,
    rect: rect(16.45, 17.00, 6.00, 3.60), capacidad: 5,
    door: { side: "w", offset: 0 },
    wallHeight: 2.4,
    precioHora: 220, precioDia: 1450,
    desc: "Oficina en el ala este, junto al baño y almacén comunitarios, con acceso directo al pasillo principal.",
    amenities: am("wifi", "ac"),
    fotos: ["🏢", "🗄️", "💻"],
    horariosPorDia: horariosPorDia([1, 1, 1, 1, 1, 1], "OFD-01"),
  },
  {
    id: "oficina-c", nombre: "Oficina C", codigo: "OF-C", icon: "🏢", bookable: true,
    estado: STATUS.DISPONIBLE.id,
    rect: rect(16.45, 24.00, 6.00, 5.60), capacidad: 7,
    door: { side: "w", offset: 0, glass: true, width: 1.15 },
    wallHeight: 2.4,
    precioHora: 240, precioDia: 1550,
    desc: "Oficina esquinera en la planta baja, junto a la recepción del edificio. Buena opción para negocios que reciben visitas frecuentes.",
    amenities: am("wifi", "ac", "accesible", "estacionamiento"),
    fotos: ["🏢", "🚪", "🖥️"],
    horariosPorDia: horariosPorDia([0, 0, 1, 1, 1, 0], "OFC-01"),
  },
  {
    id: "oficina-recepcion", nombre: "Oficina", codigo: "OF-05", icon: "🏢", bookable: true,
    estado: STATUS.PROXIMAMENTE.id,
    rect: rect(9.75, 22.30, 3.35, 7.30), capacidad: 4,
    door: { side: "e", offset: 0 },
    wallHeight: 2.4,
    precioHora: 190, precioDia: 1250,
    desc: "Oficina en planta baja, junto a la recepción y la cochera. Próximamente disponible para reserva.",
    amenities: am("wifi", "ac"),
    fotos: ["🏢", "📦", "🪑"],
    horariosPorDia: horariosPorDia([0, 0, 0, 0, 0, 0], "OF05-01"),
  },
  {
    id: "espacio-abierto", nombre: "Espacio Abierto / Coworking", codigo: "EA-01", icon: "🧑‍💻", bookable: true,
    estado: STATUS.DISPONIBLE.id,
    rect: rect(0.00, 12.10, 5.15, 17.50), capacidad: 15,
    open: true,
    door: { side: "n", offset: 0 },
    precioHora: 150, precioDia: 950,
    desc: "Gran área de coworking de planta abierta junto al jardín privado, con mesas compartidas. Ideal para trabajo flexible por horas.",
    amenities: am("wifi", "ac", "accesible"),
    fotos: ["🧑‍💻", "🪴", "☕"],
    horariosPorDia: horariosPorDia([1, 1, 0, 1, 1, 0], "EA-01"),
  },

  /* ==================== ESPACIOS INFORMATIVOS (no reservables) ==================== */
  {
    id: "bano-of-principal", nombre: "Baño", codigo: "WC-01", icon: "🚻", bookable: false,
    rect: rect(0.00, 5.35, 5.15, 1.60),
    door: { side: "n", offset: 0 },
    desc: "Servicio sanitario de la Oficina Principal.",
  },
  {
    id: "jardin-privado", nombre: "Jardín Privado", codigo: "JP-01", icon: "🌿", bookable: false,
    rect: rect(0.00, 6.95, 5.15, 5.15), open: true,
    door: { side: "n", offset: 0 },
    desc: "Jardín privado exterior contiguo a la Oficina Principal.",
  },
  {
    id: "lobby", nombre: "Lobby", codigo: "LB-01", icon: "🛋", bookable: false,
    rect: rect(5.15, 4.00, 4.60, 2.20),
    door: { side: "s", offset: 0 },
    desc: "Vestíbulo de entrada del edificio, junto a la Sala de Juntas.",
  },
  {
    id: "patio-1", nombre: "Patio 1", codigo: "PT-01", icon: "🌳", bookable: false,
    rect: rect(9.75, 0.00, 6.70, 12.90), open: true,
    door: { side: "w", offset: 0 },
    desc: "Patio interior techado, disponible como espacio de descanso para todo el edificio.",
  },
  {
    id: "patio-2", nombre: "Patio 2", codigo: "PT-02", icon: "🌳", bookable: false,
    rect: rect(16.45, 0.00, 6.00, 12.90), open: true,
    door: { side: "w", offset: 0 },
    desc: "Segundo patio interior, con pendiente del 2% para desalojo de agua pluvial, de uso compartido entre todos los inquilinos.",
  },
  {
    id: "bano-b", nombre: "Baño", codigo: "WC-02", icon: "🚻", bookable: false,
    rect: rect(5.15, 6.20, 4.60, 1.80),
    door: { side: "s", offset: 0 },
    desc: "Servicio sanitario junto al Lobby.",
  },
  {
    id: "archivero", nombre: "Archivero", codigo: "AR-01", icon: "🗄️", bookable: false,
    rect: rect(5.15, 12.80, 4.60, 3.00),
    door: { side: "n", offset: 0 },
    desc: "Área de archivo muerto y almacenamiento documental.",
  },
  {
    id: "cocina", nombre: "Cocina Comunitaria", codigo: "SRV-01", icon: "🍳", bookable: false,
    rect: rect(9.75, 12.90, 2.70, 4.80),
    door: { side: "s", offset: 0 },
    desc: "Cocineta compartida con cafetera, microondas y refrigerador para todos los inquilinos del piso.",
  },
  {
    id: "bano-cocina", nombre: "Baño Comunitario", codigo: "WC-03", icon: "🚻", bookable: false,
    rect: rect(12.45, 12.90, 1.80, 4.80),
    door: { side: "s", offset: 0 },
    desc: "Servicio sanitario de uso común junto a la cocina.",
  },
  {
    id: "servicio", nombre: "Servicio", codigo: "SRV-02", icon: "🧹", bookable: false,
    rect: rect(14.25, 12.90, 2.20, 4.80),
    door: { side: "s", offset: 0 },
    desc: "Cuarto de servicio y limpieza.",
  },
  {
    id: "almacen-grande", nombre: "Almacén", codigo: "AL-01", icon: "📦", bookable: false,
    rect: rect(9.75, 17.70, 6.70, 4.60),
    door: { side: "n", offset: 0 },
    desc: "Bodega general del edificio, entre la cocina y la oficina D.",
  },
  {
    id: "bano-d", nombre: "Baño Comunitario", codigo: "WC-04", icon: "🚻", bookable: false,
    rect: rect(16.45, 20.60, 6.00, 1.40),
    door: { side: "w", offset: 0 },
    desc: "Servicio sanitario de uso común, junto a la Oficina D.",
  },
  {
    id: "almacen-chico", nombre: "Almacén", codigo: "AL-02", icon: "📦", bookable: false,
    rect: rect(16.45, 22.00, 6.00, 2.00),
    door: { side: "w", offset: 0 },
    desc: "Bodega pequeña junto a la Oficina C.",
  },
  {
    id: "cochera", nombre: "Cochera", codigo: "PK-01", icon: "🚗", bookable: false,
    rect: rect(5.15, 15.80, 4.60, 13.80), open: true,
    door: { side: "s", offset: 0 },
    desc: "Cochera techada con cajón asignado para visitas.",
  },
  {
    id: "recepcion", nombre: "Recepción", codigo: "RC-01", icon: "🛎️", bookable: false,
    rect: rect(13.10, 22.30, 3.35, 7.30),
    door: { side: "s", offset: 0 },
    desc: "Recepción principal de acceso al edificio, junto a la Oficina C.",
  },
];

/* ----------------------------------------------------------------------
   Pasillos: en este plano casi todos los espacios comparten muro
   directamente (sin huecos de pasillo entre ellos), así que no hace
   falta ninguna franja de piso extra a modo de acento visual.
   ---------------------------------------------------------------------- */
const CORRIDORS = [];
