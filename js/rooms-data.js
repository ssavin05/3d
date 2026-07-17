/* ======================================================================
   ⭐ ESTE ES EL ÚNICO ARCHIVO QUE NECESITAS TOCAR PARA:
      - Agregar/editar una oficina, sala o "reward"
      - Cambiar precio, horarios, fotos, descripción o amenidades
      - Cambiar el estado (Disponible / Reservada / Mantenimiento / Próximamente)

   NO necesitas tocar ningún otro archivo .js para eso. Copia uno de los
   objetos dentro de ROOMS, cambia sus datos y listo.

   ⚠️ LAYOUT ACTUALIZADO (v3): las coordenadas de este archivo se volvieron
   a trazar directamente sobre el plano arquitectónico real subido por el
   cliente (planos_oficina_y_estacionamiento.pdf), midiendo la posición y
   tamaño de cada muro en la imagen del plano. A diferencia de la v2, esta
   versión corrige la PROPORCIÓN GENERAL del edificio: el edificio real es
   bastante más profundo (eje norte-sur / Z) que ancho (eje este-oeste / X)
   — antes era al revés. Si el plano físico vuelve a cambiar, hay que
   volver a medir sobre el PDF y ajustar los rect() de aquí abajo (y,
   si el tamaño total cambia mucho, CENTER_X/CENTER_Y en config-utils.js).
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
   Cuadrícula del plano (medida directamente sobre el PDF del cliente):

   Columna A (x   45- 395): Oficina Principal / Baño / Jardín Privado /
                             Espacio Abierto / Cochera
   Columna B (x  395- 675): Sala de Juntas / Lobby / Baño + Oficina B +
                             Archivero / Oficina (planta baja, junto a
                             recepción)
   Columna C (x  675- 975): Patio / Cocina + Baño + Servicio / Almacén /
                             Recepción
   Columna D (x  975-1235): Jardín Comunitario (terraza con pérgola) /
                             Oficina A / Oficina D + Baño + Almacén /
                             Oficina C

   El edificio real mide aprox. 1190 x 1552 unidades de plano (más
   profundo que ancho — antes estaba al revés). `door` indica en qué
   muro y con qué desplazamiento va la puerta. `open: true` = espacio
   sin muro completo (patio, jardines, cochera), con un bordillo bajo en
   vez de muro alto.
   ---------------------------------------------------------------------- */
const ROOMS = [
  /* ==================== ESPACIOS RENTABLES (oficinas y salas) ==================== */
  {
    id: "habitacion", nombre: "Habitación", codigo: "HB-01", icon: "🛏️", bookable: true,
    estado: STATUS.DISPONIBLE.id,
    rect: rect(45, 13, 350, 168), capacidad: 3,
    door: { side: "s", offset: 0 },
    wallHeight: 2.6,
    precioHora: 180, precioDia: 1150,
    desc: "Cuarto privado en la esquina superior del edificio, junto a la Oficina Principal. Bueno para trabajo individual o llamadas privadas.",
    amenities: am("wifi", "ac", "accesible"),
    fotos: ["🛏️", "🪟", "💼"],
    horariosPorDia: horariosPorDia([1, 0, 1, 1, 0, 1], "HB-01"),
  },
  {
    id: "oficina-principal", nombre: "Oficina Principal", codigo: "OF-PRINCIPAL", icon: "🏢", bookable: true,
    estado: STATUS.DISPONIBLE.id,
    rect: rect(45, 181, 350, 314), capacidad: 8,
    door: { side: "s", offset: 0, glass: true, width: 5.2 },
    furniture: "oficina-ejecutiva",
    wallHeight: 2.6,
    precioHora: 320, precioDia: 2100,
    desc: "La oficina más amplia del edificio, con luz natural directa y acceso rápido al jardín privado. Ideal para dirección o equipos que necesitan un espacio propio todo el día.",
    amenities: am("wifi", "ac", "proyector", "accesible", "estacionamiento"),
    fotos: ["🏢", "🌿", "💼"],
    horariosPorDia: horariosPorDia([1, 1, 0, 0, 1, 1], "OFP-01"),
  },
  {
    id: "sala-juntas", nombre: "Sala de Juntas", codigo: "SJ-01", icon: "📊", bookable: true,
    estado: STATUS.DISPONIBLE.id,
    rect: rect(395, 13, 280, 285), capacidad: 10,
    door: { side: "s", offset: 0 },
    wallHeight: 2.4,
    precioHora: 350, precioDia: 2200,
    desc: "Sala ejecutiva con mesa para diez personas, pantalla de videoconferencia y pizarrón, ideal para juntas, entrevistas o presentaciones a clientes.",
    amenities: am("wifi", "ac", "proyector", "pizarron", "accesible", "cafe"),
    fotos: ["🗂", "🖥️", "☕"],
    horariosPorDia: horariosPorDia([1, 1, 1, 0, 1, 0], "SJ-01"),
  },
  {
    id: "oficina-b", nombre: "Oficina B", codigo: "OF-B", icon: "🏢", bookable: true,
    estado: STATUS.DISPONIBLE.id,
    rect: rect(485, 565, 190, 210), capacidad: 4,
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
    rect: rect(975, 475, 260, 275), capacidad: 6,
    door: { side: "w", offset: 0, glass: true, width: 5.2 },
    wallHeight: 2.4,
    precioHora: 260, precioDia: 1700,
    desc: "Oficina con baño propio, ubicada en el ala este del edificio junto a la cocina comunitaria. Perfecta para equipos que buscan independencia y comodidad.",
    amenities: am("wifi", "ac", "proyector", "accesible"),
    fotos: ["🏢", "🚿", "📶"],
    horariosPorDia: horariosPorDia([1, 0, 1, 1, 0, 1], "OFA-01"),
  },
  {
    id: "oficina-d", nombre: "Oficina D", codigo: "OF-D", icon: "🏢", bookable: true,
    estado: STATUS.RESERVADA.id,
    rect: rect(975, 750, 260, 225), capacidad: 4,
    door: { side: "w", offset: 0 },
    wallHeight: 2.4,
    precioHora: 220, precioDia: 1450,
    desc: "Oficina compacta junto al almacén y baño comunitario del ala este, con acceso directo al pasillo principal.",
    amenities: am("wifi", "ac"),
    fotos: ["🏢", "🗄️", "💻"],
    horariosPorDia: horariosPorDia([1, 1, 1, 1, 1, 1], "OFD-01"),
  },
  {
    id: "oficina-c", nombre: "Oficina C", codigo: "OF-C", icon: "🏢", bookable: true,
    estado: STATUS.DISPONIBLE.id,
    rect: rect(975, 1250, 260, 315), capacidad: 5,
    door: { side: "w", offset: 0, glass: true, width: 5.2 },
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
    rect: rect(485, 975, 190, 590), capacidad: 4,
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
    rect: rect(45, 775, 350, 475), capacidad: 15,
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
    rect: rect(45, 495, 150, 130),
    door: { side: "n", offset: 0 },
    desc: "Servicio sanitario de la Oficina Principal.",
  },
  {
    id: "jardin-privado", nombre: "Jardín Privado", codigo: "JP-01", icon: "🌿", bookable: false,
    rect: rect(45, 625, 350, 150), open: true,
    door: { side: "n", offset: 0 },
    desc: "Jardín privado exterior contiguo a la Oficina Principal.",
  },
  {
    id: "lobby", nombre: "Lobby", codigo: "LB-01", icon: "🛋", bookable: false,
    rect: rect(395, 298, 280, 177),
    door: { side: "s", offset: 0 },
    desc: "Vestíbulo de entrada del edificio, junto a la Sala de Juntas.",
  },
  {
    id: "patio", nombre: "Patio Comunitario", codigo: "PT-01", icon: "🌳", bookable: false,
    rect: rect(675, 13, 300, 462), open: true,
    door: { side: "w", offset: 0 },
    desc: "Patio interior techado con pérgola, disponible como espacio de descanso para todo el edificio.",
  },
  {
    id: "jardin-comunitario", nombre: "Jardín Comunitario", codigo: "JC-01", icon: "🌲", bookable: false,
    rect: rect(975, 13, 260, 462), open: true,
    door: { side: "s", offset: 0 },
    desc: "Terraza ajardinada con árboles y pérgola, de uso compartido entre todos los inquilinos.",
  },
  {
    id: "bano-b", nombre: "Baño", codigo: "WC-02", icon: "🚻", bookable: false,
    rect: rect(395, 475, 90, 90),
    door: { side: "s", offset: 0 },
    desc: "Servicio sanitario junto al Lobby.",
  },
  {
    id: "archivero", nombre: "Archivero", codigo: "AR-01", icon: "🗄️", bookable: false,
    rect: rect(485, 775, 190, 200),
    door: { side: "n", offset: 0 },
    desc: "Área de archivo muerto y almacenamiento documental.",
  },
  {
    id: "cocina", nombre: "Cocina Comunitaria", codigo: "SRV-01", icon: "🍳", bookable: false,
    rect: rect(675, 475, 150, 150),
    door: { side: "s", offset: 0 },
    desc: "Cocineta compartida con cafetera, microondas y refrigerador para todos los inquilinos del piso.",
  },
  {
    id: "bano-cocina", nombre: "Baño Comunitario", codigo: "WC-03", icon: "🚻", bookable: false,
    rect: rect(825, 475, 65, 150),
    door: { side: "s", offset: 0 },
    desc: "Servicio sanitario de uso común junto a la cocina.",
  },
  {
    id: "servicio", nombre: "Servicio", codigo: "SRV-02", icon: "🧹", bookable: false,
    rect: rect(890, 475, 85, 150),
    door: { side: "s", offset: 0 },
    desc: "Cuarto de servicio y limpieza.",
  },
  {
    id: "almacen-grande", nombre: "Almacén", codigo: "AL-01", icon: "📦", bookable: false,
    rect: rect(675, 625, 300, 350),
    door: { side: "n", offset: 0 },
    desc: "Bodega general del edificio, entre la cocina y la oficina D.",
  },
  {
    id: "bano-d", nombre: "Baño Comunitario", codigo: "WC-04", icon: "🚻", bookable: false,
    rect: rect(975, 975, 260, 125),
    door: { side: "w", offset: 0 },
    desc: "Servicio sanitario de uso común, junto a la Oficina D.",
  },
  {
    id: "almacen-chico", nombre: "Almacén", codigo: "AL-02", icon: "📦", bookable: false,
    rect: rect(975, 1100, 260, 150),
    door: { side: "w", offset: 0 },
    desc: "Bodega pequeña junto a la Oficina C.",
  },
  {
    id: "cochera", nombre: "Cochera", codigo: "PK-01", icon: "🚗", bookable: false,
    rect: rect(45, 1250, 350, 315), open: true,
    door: { side: "n", offset: 0 },
    desc: "Cochera techada con cajón asignado para visitas.",
  },
  {
    id: "recepcion", nombre: "Recepción", codigo: "RC-01", icon: "🛎️", bookable: false,
    rect: rect(675, 975, 300, 590),
    door: { side: "n", offset: 0 },
    desc: "Recepción principal de acceso al edificio, junto a la Oficina C.",
  },
];

/* ----------------------------------------------------------------------
   Pasillos: en el plano real casi todos los espacios comparten muro
   directamente (sin huecos de pasillo entre ellos), así que aquí sólo se
   marcan un par de franjas de piso a modo de acento visual sobre las
   zonas de circulación principal (Lobby/Patio y Archivero/Almacén).
   ---------------------------------------------------------------------- */
const CORRIDORS = [
  rect(395, 460, 840, 30),
  rect(485, 960, 750, 30),
];
