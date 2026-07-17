/* config.js + utils.js — se carga PRIMERO, antes que rooms-data.js */
/* ============================== config.js ============================== */
/* ======================================================================
   config.js — Constantes globales de la aplicación.
   Cambiar valores aquí afecta a toda la app sin tocar otros módulos.
   ====================================================================== */

/* Escala del plano: convierte píxeles del plano original a unidades 3D */
const SCALE = 0.042;
/* CENTER_X/CENTER_Y recalculados a partir del plano arquitectónico real
   (planos_oficina_y_estacionamiento.pdf): el edificio real es más
   profundo (norte-sur) que ancho (este-oeste), al revés de como estaba
   antes. Ver rooms-data.js para las coordenadas de cada espacio. */
const CENTER_X = 640, CENTER_Y = 789;

/* Bloques horarios reservables (2 h cada uno) */
const HOURS = ["09:00-11:00", "11:00-13:00", "13:00-15:00", "15:00-17:00", "17:00-19:00", "19:00-21:00"];

/* Selector de fecha: cuántos días hacia adelante se muestran */
const DAYS_COUNT = 6;

/* Alturas de los volúmenes 3D */
const HEIGHT_MUTE = 0.9;   // espacios informativos (no reservables)
const HEIGHT_BOOK = 1.35;  // espacios reservables

/* Estados posibles de un espacio reservable.
   "color" se usa cuando el estado por sí mismo determina el color
   (Mantenimiento / Próximamente). "Disponible" delega el color al
   semáforo de disponibilidad horaria (ver rooms.js -> availabilityLevel). */
const STATUS = {
  DISPONIBLE:  { id: "disponible",  label: "Disponible",   color: null },
  RESERVADA:   { id: "reservada",   label: "Reservada",    color: 0xff6b6b },
  MANTENIMIENTO: { id: "mantenimiento", label: "Mantenimiento", color: 0x7f95ab },
  PROXIMAMENTE: { id: "proximamente", label: "Próximamente", color: 0x9b8cff },
};

/* Colores del semáforo de disponibilidad (estado Disponible) */
const AVAILABILITY_COLOR = {
  green:  0x4ade80, // muchos horarios libres
  yellow: 0xffb454, // pocos horarios libres
  red:    0xff6b6b, // sin disponibilidad
};

const MUTED_FILL_COLOR = 0x161c26;   // color de espacios no reservables
const MUTED_HOVER_COLOR = 0x1c2430;

/* Catálogo de amenidades disponibles. Para agregar una nueva amenidad basta
   con añadir una entrada aquí y usar su clave en el arreglo `amenities` de
   cualquier sala (ver rooms.js). */
const AMENITY_DEFS = {
  wifi:            { ico: "📶", label: "WiFi" },
  ac:              { ico: "❄️", label: "Aire acondicionado" },
  proyector:       { ico: "📽️", label: "Proyector / Pantalla" },
  pizarron:        { ico: "🖊️", label: "Pizarrón" },
  accesible:       { ico: "♿", label: "Acceso para discapacidad" },
  estacionamiento: { ico: "🚗", label: "Estacionamiento incluido" },
  cafe:            { ico: "☕", label: "Servicio de café" },
};

/* ---------- arquitectura: muros, puertas y pasillos ---------- */
const WALL_HEIGHT = 1.7;     // altura de muro divisorio (envuelve el volumen de estado)
const WALL_THICKNESS = 0.14;
const WALL_COLOR = 0xdce3ec;
const CURB_HEIGHT = 0.32;    // altura reducida para espacios "abiertos" (patio, estacionamiento)
const DOOR_WIDTH = 1.15;
const DOOR_COLOR = 0x8a6a45;
const GLASS_DOOR_COLOR = 0xbfe0ea;
const GLASS_DOOR_OPACITY = 0.35;
const CORRIDOR_COLOR = 0x1b2634; // tono del piso de pasillo, distinto del blueprint general

/* Duración y easing de las transiciones de cámara */
const CAMERA_FLY_DURATION = 900;
const RESET_FLY_DURATION = 800;

/* Límites de zoom sobre la vista general */
const ZOOM_MIN = 0.32, ZOOM_MAX = 1.9;

/* Contacto / compartir (fácil de reconfigurar) */
const CONTACT_INFO = {
  telefono: "+52 646 000 0000",
  email: "reservas@centrodeoficinas.mx",
};


/* ============================== utils.js ============================== */
/* ======================================================================
   utils.js — Funciones puras reutilizables. No dependen de THREE.js
   ni del DOM, así que son fáciles de probar de forma aislada.
   ====================================================================== */
/** Convierte un rectángulo en píxeles del plano original a coordenadas
 *  del mundo 3D (centradas y escaladas). */
function rect(px, py, pw, ph) {
  return {
    x: (px + pw / 2 - CENTER_X) * SCALE,
    z: (py + ph / 2 - CENTER_Y) * SCALE,
    w: pw * SCALE,
    d: ph * SCALE,
  };
}

/** Hash determinístico simple (FNV-1a). Se usa para generar disponibilidad
 *  "pseudo-aleatoria" pero estable por sala y día, sin Math.random(). */
function hashInt(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/* ---------- fechas del selector de día ---------- */
const DAY_MS = 24 * 60 * 60 * 1000;
const TODAY0 = new Date();
TODAY0.setHours(0, 0, 0, 0);

const DAYS = Array.from({ length: DAYS_COUNT }, (_, i) => new Date(TODAY0.getTime() + i * DAY_MS));

function diaLabel(i) {
  const d = DAYS[i];
  if (i === 0) return { top: "Hoy", num: d.getDate() };
  if (i === 1) return { top: "Mañana", num: d.getDate() };
  const top = d.toLocaleDateString("es-MX", { weekday: "short" }).replace(".", "");
  return { top: top.charAt(0).toUpperCase() + top.slice(1), num: d.getDate() };
}

function diaFechaLarga(i) {
  const d = DAYS[i];
  const txt = d.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" });
  return txt.charAt(0).toUpperCase() + txt.slice(1);
}

/** Escapa texto para insertarlo de forma segura en innerHTML. */
function escapeHtml(str = "") {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Formatea un número como moneda MXN sin decimales. */
function formatMXN(n) {
  return "$" + Number(n).toLocaleString("es-MX") + " MXN";
}

