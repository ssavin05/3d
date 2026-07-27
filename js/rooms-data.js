/* ======================================================================
   ⭐ ESTE ES EL ÚNICO ARCHIVO QUE NECESITAS TOCAR PARA:
      - Agregar/editar una oficina, sala o "reward"
      - Cambiar precio, horarios, fotos, descripción o amenidades
      - Cambiar el estado (Disponible / Reservada / Mantenimiento / Próximamente)

   NO necesitas tocar ningún otro archivo .js para eso. Copia uno de los
   objetos dentro de ROOMS, cambia sus datos y listo.

   ⚠️ LAYOUT ACTUALIZADO (v5): coordenadas tomadas directo de las cotas
   en metros del plano de referencia del cliente. `rect(x, y, w, h)`
   recibe metros reales: x/y es la esquina superior-izquierda del
   espacio (norte-oeste) y w/h su ancho y fondo. El edificio completo
   mide 20.00 m de ancho x 27.41 m de fondo.

   A propósito NO se modelan aquí detalles decorativos (pérgolas con
   postes, árboles, coches, cajones de estacionamiento pintados, muros
   achaflanados): sólo los cuartos, sus puertas y los pasillos que los
   conectan, que es lo que necesita el mapa de reservas.
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
const ROOMS = [
  /* ==================== ESPACIOS RENTABLES (oficinas y salas) ==================== */
  {
    id: "oficina-principal", nombre: "Oficina Principal", codigo: "OF-PRINCIPAL", icon: "🏢", bookable: true,
    estado: STATUS.DISPONIBLE.id,
    rect: rect(0.00, 0.00, 6.53, 5.86), capacidad: 10,
    door: { side: "s", offset: 1.335, width: 1.0 },
    precioHora: 320, precioDia: 2100,
    desc: "Oficina en la esquina noroeste del edificio, con luz natural directa y acceso rápido al jardín privado. Ideal para dirección o equipos que necesitan un espacio propio todo el día.",
    amenities: am("wifi", "ac", "proyector", "accesible", "estacionamiento"),
    fotos: ["🏢", "🌿", "💼"],
    horariosPorDia: horariosPorDia([1, 1, 0, 0, 1, 1], "OFP-01"),
  },
  {
    id: "sala-juntas", nombre: "Sala de Juntas", codigo: "SJ-01", icon: "📊", bookable: true,
    estado: STATUS.DISPONIBLE.id,
    rect: rect(6.94, 0.00, 4.78, 4.92), capacidad: 10,
    door: { side: "s", offset: -0.64, width: 1.0 },
    precioHora: 350, precioDia: 2200,
    desc: "Sala ejecutiva con mesa para diez personas, ideal para juntas, entrevistas o presentaciones a clientes.",
    amenities: am("wifi", "ac", "proyector", "pizarron", "accesible", "cafe"),
    fotos: ["🗂", "🖥️", "☕"],
    horariosPorDia: horariosPorDia([1, 1, 1, 0, 1, 0], "SJ-01"),
  },
  {
    id: "oficina-b", nombre: "Oficina B", codigo: "OF-B", icon: "🏢", bookable: true,
    estado: STATUS.DISPONIBLE.id,
    rect: rect(6.53, 13.27, 1.35, 5.65), capacidad: 2,
    door: { side: "e", offset: -0.325, width: 0.9 },
    precioHora: 180, precioDia: 1150,
    desc: "Oficina angosta en el corazón del edificio, junto al archivero, ideal para uso individual o llamadas privadas.",
    amenities: am("wifi", "ac"),
    fotos: ["🏢", "🪑", "💻"],
    horariosPorDia: horariosPorDia([0, 1, 1, 0, 0, 1], "OFB-01"),
  },
  {
    id: "oficina-a", nombre: "Oficina A", codigo: "OF-A", icon: "🏢", bookable: true,
    estado: STATUS.DISPONIBLE.id,
    rect: rect(15.29, 11.78, 4.71, 3.51), capacidad: 5,
    door: { side: "w", offset: -0.255, width: 1.0 },
    precioHora: 260, precioDia: 1700,
    desc: "Oficina ubicada en el ala este del edificio, junto al patio. Perfecta para equipos que buscan independencia y comodidad.",
    amenities: am("wifi", "ac", "proyector", "accesible"),
    fotos: ["🏢", "🚿", "📶"],
    horariosPorDia: horariosPorDia([1, 0, 1, 1, 0, 1], "OFA-01"),
  },
  {
    id: "oficina-d", nombre: "Oficina D", codigo: "OF-D", icon: "🏢", bookable: true,
    estado: STATUS.RESERVADA.id,
    rect: rect(15.29, 15.29, 2.96, 3.63), capacidad: 3,
    door: { side: "s", offset: 0, width: 1.0 },
    precioHora: 220, precioDia: 1450,
    desc: "Oficina en el ala este, junto al baño y almacén comunitarios, con acceso directo al pasillo principal.",
    amenities: am("wifi", "ac"),
    fotos: ["🏢", "🗄️", "💻"],
    horariosPorDia: horariosPorDia([1, 1, 1, 1, 1, 1], "OFD-01"),
  },
  {
    id: "oficina-c", nombre: "Oficina C", codigo: "OF-C", icon: "🏢", bookable: true,
    estado: STATUS.DISPONIBLE.id,
    rect: rect(18.25, 21.21, 1.75, 4.99), capacidad: 3,
    door: { side: "w", offset: 0, width: 1.0 },
    precioHora: 240, precioDia: 1550,
    desc: "Oficina esquinera en la planta baja, junto a la recepción del edificio. Buena opción para negocios que reciben visitas frecuentes.",
    amenities: am("wifi", "ac", "accesible", "estacionamiento"),
    fotos: ["🏢", "🚪", "🖥️"],
    horariosPorDia: horariosPorDia([0, 0, 1, 1, 1, 0], "OFC-01"),
  },
  {
    id: "oficina-recepcion", nombre: "Oficina", codigo: "OF-05", icon: "🏢", bookable: true,
    estado: STATUS.PROXIMAMENTE.id,
    rect: rect(11.52, 21.35, 2.69, 4.85), capacidad: 4,
    door: { side: "s", offset: 0.005, width: 1.0 },
    precioHora: 190, precioDia: 1250,
    desc: "Oficina en planta baja, junto a la recepción y la cochera. Próximamente disponible para reserva.",
    amenities: am("wifi", "ac"),
    fotos: ["🏢", "📦", "🪑"],
    horariosPorDia: horariosPorDia([0, 0, 0, 0, 0, 0], "OF05-01"),
  },
  {
    id: "espacio-abierto", nombre: "Espacio Abierto / Coworking", codigo: "EA-01", icon: "🧑‍💻", bookable: true,
    estado: STATUS.DISPONIBLE.id,
    rect: rect(0.00, 12.79, 6.53, 13.41), capacidad: 18,
    open: true,
    door: { side: "s", offset: -0.065, width: 1.2 },
    precioHora: 150, precioDia: 950,
    desc: "Gran área de coworking de planta abierta junto al jardín privado, con mesas compartidas. Ideal para trabajo flexible por horas.",
    amenities: am("wifi", "ac", "accesible"),
    fotos: ["🧑‍💻", "🪴", "☕"],
    horariosPorDia: horariosPorDia([1, 1, 0, 1, 1, 0], "EA-01"),
  },

  /* ==================== ESPACIOS INFORMATIVOS (no reservables) ==================== */
  {
    id: "bano-of-principal", nombre: "Baño", codigo: "WC-01", icon: "🚻", bookable: false,
    rect: rect(0.00, 5.86, 2.90, 2.09),
    door: { side: "e", offset: -0.045, width: 0.85 },
    desc: "Servicio sanitario de la Oficina Principal.",
  },
  {
    id: "lobby", nombre: "Lobby", codigo: "LB-01", icon: "🛋", bookable: false,
    rect: rect(6.94, 4.92, 2.29, 3.03),
    door: { side: "e", offset: -0.02, width: 1.0 },
    desc: "Vestíbulo de entrada del edificio, junto a la Sala de Juntas.",
  },
  {
    id: "jardin-privado", nombre: "Jardín Privado", codigo: "JP-01", icon: "🌿", bookable: false,
    rect: rect(0.00, 7.95, 6.53, 4.84), open: true,
    door: { side: "n", offset: 0 },
    desc: "Jardín privado exterior contiguo a la Oficina Principal.",
  },
  {
    id: "patio", nombre: "Patio", codigo: "PT-01", icon: "🌳", bookable: false,
    rect: rect(9.23, 0.00, 9.02, 11.78), open: true,
    door: { side: "w", offset: 0 },
    desc: "Patio interior techado, disponible como espacio de descanso para todo el edificio.",
  },
  {
    id: "comunitario-norte", nombre: "Comunitario", codigo: "CM-01", icon: "🌳", bookable: false,
    rect: rect(18.25, 0.00, 1.75, 11.78), open: true,
    door: { side: "w", offset: 0 },
    desc: "Franja de jardín comunitario en el costado este del edificio.",
  },
  {
    id: "bano-b", nombre: "Baño", codigo: "WC-02", icon: "🚻", bookable: false,
    rect: rect(6.53, 11.78, 1.35, 1.49),
    door: { side: "e", offset: 0, width: 0.8 },
    desc: "Servicio sanitario junto a la Oficina B.",
  },
  {
    id: "cocina", nombre: "Cocina Comunitaria", codigo: "SRV-01", icon: "🍳", bookable: false,
    rect: rect(7.88, 11.78, 3.64, 2.56),
    door: { side: "s", offset: -0.02, width: 1.0 },
    desc: "Cocineta compartida con cafetera, microondas y refrigerador para todos los inquilinos del piso.",
  },
  {
    id: "bano-cocina", nombre: "Baño Comunitario", codigo: "WC-03", icon: "🚻", bookable: false,
    rect: rect(11.52, 11.78, 1.07, 2.56),
    door: { side: "s", offset: 0, width: 0.8 },
    desc: "Servicio sanitario de uso común junto a la cocina.",
  },
  {
    id: "servicio", nombre: "Servicio", codigo: "SRV-02", icon: "🧹", bookable: false,
    rect: rect(12.59, 11.78, 2.70, 2.56),
    door: { side: "s", offset: 0, width: 1.0 },
    desc: "Cuarto de servicio y limpieza.",
  },
  {
    id: "archivero", nombre: "Archivero", codigo: "AR-01", icon: "🗄️", bookable: false,
    rect: rect(6.53, 18.92, 2.70, 2.43),
    door: { side: "n", offset: 0, width: 1.0 },
    desc: "Área de archivo muerto y almacenamiento documental.",
  },
  {
    id: "almacen-grande", nombre: "Almacén", codigo: "AL-01", icon: "📦", bookable: false,
    rect: rect(7.88, 14.88, 7.41, 4.04),
    door: { side: "n", offset: -1.2, width: 1.0 },
    desc: "Bodega general del edificio, entre la cocina y la oficina D.",
  },
  {
    id: "bano-d", nombre: "Baño Comunitario", codigo: "WC-04", icon: "🚻", bookable: false,
    rect: rect(18.25, 15.29, 1.75, 3.63),
    door: { side: "w", offset: 0, width: 0.8 },
    desc: "Servicio sanitario de uso común, junto a la Oficina D.",
  },
  {
    id: "almacen-chico", nombre: "Almacén", codigo: "AL-02", icon: "📦", bookable: false,
    rect: rect(18.25, 18.92, 1.75, 2.29),
    door: { side: "w", offset: 0, width: 0.8 },
    desc: "Bodega pequeña junto a la Oficina C.",
  },
  {
    id: "cochera", nombre: "Cochera", codigo: "PK-01", icon: "🚗", bookable: false,
    rect: rect(6.53, 21.35, 4.99, 4.85), open: true,
    door: { side: "s", offset: 0 },
    desc: "Cochera techada con cajón asignado para visitas.",
  },
  {
    id: "recepcion", nombre: "Recepción", codigo: "RC-01", icon: "🛎️", bookable: false,
    rect: rect(14.21, 21.35, 4.04, 4.85),
    door: { side: "s", offset: -0.67, width: 1.0 },
    desc: "Recepción principal de acceso al edificio, junto a la Oficina C.",
  },
];

/* ----------------------------------------------------------------------
   Pasillos: franjas de piso sin muros, para las zonas de circulación
   que no son un "cuarto" propiamente (el corredor junto al Lobby y la
   entrada techada de Acceso Principal).
   ---------------------------------------------------------------------- */
const CORRIDORS = [
  rect(2.90, 5.86, 4.04, 2.09),
  rect(0.00, 26.20, 20.00, 1.21),
];
