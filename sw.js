/* ======================================================================
   sw.js — Service worker.

   Estrategias:
     • App shell (HTML, CSS, JS propios) → stale-while-revalidate.
     • Fuentes y librerías de CDN        → cache-first con caducidad.
     • Imágenes de Storage               → cache-first acotada.
     • API de Supabase                   → network-first con respaldo.
     • Navegación sin red                → offline.html.

   También recibe las notificaciones push y solicita Background Sync
   para operaciones no críticas pendientes (por ejemplo, favoritos).
   Reservar, modificar, cancelar y pagar requieren conexión real.
   ====================================================================== */

/* ⚠️  SUBE ESTO EN CADA DESPLIEGUE.
 *
 * El JS y el CSS se sirven con stale-while-revalidate: se entrega la
 * copia de la caché y se refresca por detrás. Esa caché lleva la VERSION
 * en el nombre, así que mientras no cambie, quien ya tenga la app
 * instalada sigue ejecutando el código viejo aunque el servidor tenga el
 * nuevo. El HTML sí va network-first y no se queda pegado, lo que
 * empeora la mezcla: index.html nuevo pidiendo módulos viejos.
 *
 * Tiene que coincidir con APP.version de js/core/config.js — hay una
 * prueba que lo comprueba (tests/prelanzamiento.mjs, caso P), justo para
 * que no se olvide.
 */
const VERSION = "v2.7.2";
const CACHE_SHELL = `co-shell-${VERSION}`;
const CACHE_EXTERNO = `co-externo-${VERSION}`;
const CACHE_IMG = `co-img-${VERSION}`;
const CACHE_DATOS = `co-datos-${VERSION}`;

const BASE = new URL(self.registration.scope).pathname;

/* Archivos imprescindibles para que la app abra sin red. */
const SHELL = [
  "",
  "index.html",
  "offline.html",
  "manifest.webmanifest",
  "css/tokens.css",
  "css/base.css",
  "css/components.css",
  "css/views.css",
  "css/executive-theme.css",
  "js/main.js",
  "js/pwa.js",
  "js/core/config.js",
  "js/core/utils.js",
  "js/core/bus.js",
  "js/core/store.js",
  "js/core/i18n.js",
  "js/core/tema.js",
  "js/core/haptics.js",
  "js/core/iconos.js",
  "js/core/ui.js",
  "js/core/router.js",
  "js/data/db.js",
  "js/data/api.js",
  "js/data/cache.js",
  "js/data/mock.js",
  "js/data/medios-locales.js",
  "js/data/planta.js",
  "assets/fotos/oficina-a/01.jpg",
  "assets/fotos/oficina-a/02.jpg",
  "assets/fotos/oficina-b/01.jpg",
  "assets/fotos/oficina-b/02.jpg",
  "assets/fotos/oficina-c/01.jpg",
  "assets/fotos/oficina-d/01.jpg",
  "assets/fotos/oficina-d/02.jpg",
  "assets/fotos/patio/01.jpg",
  "assets/fotos/patio/02.jpg",
  "assets/fotos/recepcion/01.jpg",
  "assets/fotos/recepcion/02.jpg",
  "assets/fotos/recepcion/03.jpg",
  "js/data/sync.js",
  "js/data/realtime.js",
  "js/auth/auth.js",
  "js/auth/permisos.js",
  "js/views/componentes.js",
  "js/views/drawer.js",
  "js/views/inicio.js",
  "js/views/nosotros.js",
  "js/data/contenido.js",
  "js/ai/busqueda.js",
].map((p) => BASE + p);

const MAX_IMG = 80;
const MAX_DATOS = 60;

/* ---------------------------------------------------------------------
   Instalación y activación
   --------------------------------------------------------------------- */
self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE_SHELL);
    // addAll falla entero si un archivo falta: los agregamos uno a uno.
    await Promise.allSettled(SHELL.map((url) => cache.add(new Request(url, { cache: "reload" }))));
    // Evita que una versión anterior siga sirviendo JS sin las fotos.
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const claves = await caches.keys();
    await Promise.all(claves
      .filter((k) => k.startsWith("co-") && !k.endsWith(VERSION))
      .map((k) => caches.delete(k)));
    if (self.registration.navigationPreload) await self.registration.navigationPreload.enable();
    await self.clients.claim();
  })());
});

self.addEventListener("message", (e) => {
  if (e.data?.tipo === "saltar-espera") self.skipWaiting();

  // Al cerrar sesión la app pide borrar todo lo que pueda contener datos
  // de la persona: respuestas de la API e imágenes privadas (avatares,
  // fotos de facturas…). El shell se conserva para que siga abriendo
  // sin conexión.
  if (e.data?.tipo === "purgar-datos") {
    e.waitUntil?.((async () => {
      await Promise.all([caches.delete(CACHE_DATOS), caches.delete(CACHE_IMG)]);
      e.source?.postMessage({ tipo: "datos-purgados" });
    })());
  }
});

/* ---------------------------------------------------------------------
   ¿La petición lleva la sesión de una persona?

   Supabase manda siempre `Authorization: Bearer …`. Cuando nadie ha
   iniciado sesión ese token es la llave anónima (role "anon") y la
   respuesta es pública. Cuando hay sesión, el token trae un `sub` con
   el id del usuario y la respuesta es privada: no se guarda en disco.
   --------------------------------------------------------------------- */
function cargaJwt(token) {
  try {
    const cuerpo = token.split(".")[1];
    if (!cuerpo) return null;
    const b64 = cuerpo.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(cuerpo.length / 4) * 4, "=");
    return JSON.parse(decodeURIComponent(escape(atob(b64))));
  } catch { return null; }
}

function esPeticionDeUsuario(req) {
  const cabecera = req.headers.get("authorization") || "";
  const token = cabecera.replace(/^Bearer\s+/i, "").trim();
  if (!token || token.split(".").length !== 3) return false;
  const carga = cargaJwt(token);
  if (!carga) return true;                     // no se pudo leer: se asume privado
  return Boolean(carga.sub) && carga.role !== "anon";
}

/* Tablas de catálogo: su contenido es el mismo para todo el mundo, así
   que sí vale la pena guardarlo para abrir sin conexión. Cualquier otra
   ruta (reservas, pagos, facturas, notificaciones, usuarios, mensajes…)
   nunca toca el disco. Lista blanca a propósito: si mañana se añade una
   tabla con datos personales, por omisión NO se cachea. */
const TABLAS_PUBLICAS = new Set([
  "edificios", "pisos", "espacios", "espacio_amenidades", "amenidades",
  "tipos_espacio", "organizaciones", "horarios", "contenido", "faq",
]);

function esCatalogoPublico(url) {
  const m = url.pathname.match(/\/rest\/v1\/([^/?]+)/);
  return Boolean(m && TABLAS_PUBLICAS.has(m[1]));
}

/* Los archivos privados de Storage llegan con URL firmada (token en la
   query o ruta /object/sign|authenticated/). Esos tampoco se guardan. */
function esArchivoPrivado(url) {
  return url.searchParams.has("token")
    || /\/object\/(sign|authenticated)\//.test(url.pathname);
}

/* ---------------------------------------------------------------------
   Enrutado de peticiones
   --------------------------------------------------------------------- */
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.protocol !== "http:" && url.protocol !== "https:") return;

  // Navegación (documentos HTML)
  if (req.mode === "navigate") {
    e.respondWith(manejarNavegacion(e));
    return;
  }

  // API de Supabase (REST, RPC, Auth)
  if (/supabase\.(co|in)/.test(url.hostname)) {
    // Auth y realtime: jamás se guardan (contienen tokens de sesión).
    if (url.pathname.includes("/auth/") || url.pathname.includes("/realtime/")) return;

    if (url.pathname.includes("/storage/")) {
      if (esArchivoPrivado(url)) return;                       // URL firmada → sin caché
      e.respondWith(cacheFirst(req, CACHE_IMG, MAX_IMG));
      return;
    }

    // Sólo se guarda el catálogo público y sólo si la petición no lleva
    // la sesión de nadie. Todo lo demás (reservas, pagos, facturas,
    // notificaciones, conversaciones, perfiles…) va directo a la red:
    // en un equipo compartido no puede quedar rastro en el disco.
    // Para funcionar sin conexión la app tiene su propia caché en
    // IndexedDB, que sí se borra al cerrar sesión.
    if (esCatalogoPublico(url) && !esPeticionDeUsuario(req)) {
      e.respondWith(networkFirst(req, CACHE_DATOS, MAX_DATOS));
    }
    return;
  }

  // Recursos externos (fuentes, SDKs de pago, Three.js)
  if (url.origin !== self.location.origin) {
    e.respondWith(cacheFirst(req, CACHE_EXTERNO, 60));
    return;
  }

  // Imágenes propias
  if (req.destination === "image") {
    e.respondWith(cacheFirst(req, CACHE_IMG, MAX_IMG));
    return;
  }

  // Resto del shell
  e.respondWith(staleWhileRevalidate(req, CACHE_SHELL));
});

async function manejarNavegacion(evento) {
  try {
    const preload = await evento.preloadResponse;
    if (preload) return preload;
    return await fetch(evento.request);
  } catch {
    const cache = await caches.open(CACHE_SHELL);
    return (await cache.match(BASE + "index.html"))
      || (await cache.match(BASE))
      || (await cache.match(BASE + "offline.html"))
      || new Response("Sin conexión", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
}

async function staleWhileRevalidate(req, nombreCache) {
  const cache = await caches.open(nombreCache);
  const enCache = await cache.match(req);
  const red = fetch(req).then((res) => {
    if (res && res.status === 200) cache.put(req, res.clone());
    return res;
  }).catch(() => null);
  return enCache || (await red) || new Response("", { status: 504 });
}

async function cacheFirst(req, nombreCache, maximo) {
  const cache = await caches.open(nombreCache);
  const enCache = await cache.match(req);
  if (enCache) return enCache;
  try {
    const res = await fetch(req);
    if (res && (res.status === 200 || res.type === "opaque")) {
      cache.put(req, res.clone());
      recortar(nombreCache, maximo);
    }
    return res;
  } catch {
    return enCache || new Response("", { status: 504 });
  }
}

async function networkFirst(req, nombreCache, maximo) {
  const cache = await caches.open(nombreCache);
  try {
    const res = await fetch(req);
    if (res && res.status === 200) {
      cache.put(req, res.clone());
      recortar(nombreCache, maximo);
    }
    return res;
  } catch {
    const enCache = await cache.match(req);
    if (enCache) {
      // Marca la respuesta para que la app sepa que viene de la caché.
      const cuerpo = await enCache.blob();
      return new Response(cuerpo, {
        status: 200,
        headers: { ...Object.fromEntries(enCache.headers.entries()), "x-desde-cache": "1" },
      });
    }
    return new Response(JSON.stringify({ error: "offline" }), {
      status: 503, headers: { "Content-Type": "application/json" },
    });
  }
}

async function recortar(nombreCache, maximo) {
  if (!maximo) return;
  const cache = await caches.open(nombreCache);
  const claves = await cache.keys();
  if (claves.length <= maximo) return;
  for (const k of claves.slice(0, claves.length - maximo)) await cache.delete(k);
}

/* ---------------------------------------------------------------------
   Background Sync — avisa a la app para reenviar operaciones seguras
   --------------------------------------------------------------------- */
self.addEventListener("sync", (e) => {
  if (e.tag === "sincronizar-operaciones-seguras" || e.tag === "sincronizar-reservas") {
    e.waitUntil(avisarClientes({ tipo: "sync-solicitado" }));
  }
});

self.addEventListener("periodicsync", (e) => {
  if (e.tag === "refrescar-disponibilidad") {
    e.waitUntil(avisarClientes({ tipo: "refrescar" }));
  }
});

async function avisarClientes(mensaje) {
  const clientes = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  clientes.forEach((c) => c.postMessage(mensaje));
}

/* ---------------------------------------------------------------------
   Notificaciones push
   --------------------------------------------------------------------- */
self.addEventListener("push", (e) => {
  let datos = { titulo: "Smart Hub", cuerpo: "Tienes una novedad." };
  try { if (e.data) datos = { ...datos, ...e.data.json() }; }
  catch { if (e.data) datos.cuerpo = e.data.text(); }

  const opciones = {
    body: datos.cuerpo || datos.body || "",
    icon: BASE + "assets/icons/icono-192.png",
    badge: BASE + "assets/icons/icono-96.png",
    vibrate: [90, 50, 90],
    tag: datos.tag || datos.tipo || "general",
    renotify: Boolean(datos.tag),
    requireInteraction: datos.tipo === "recordatorio",
    data: { url: datos.enlace || datos.url || "#/", ...datos.datos },
    actions: datos.tipo === "recordatorio"
      ? [{ action: "ver", title: "Ver reserva" }, { action: "cerrar", title: "Cerrar" }]
      : datos.tipo === "espera"
        ? [{ action: "ver", title: "Reservar ahora" }]
        : [],
  };

  e.waitUntil(self.registration.showNotification(datos.titulo || datos.title || "Smart Hub", opciones));
});

/* El destino viene dentro del push: se acota a una ruta interna para que
   un push manipulado no pueda mandar a la gente a otro sitio. */
function rutaSegura(valor) {
  const s = String(valor ?? "").trim();
  if (!/^#?\/[A-Za-z0-9/_.:~%+=&?-]*$/.test(s)) return "#/";
  if (s.startsWith("#//") || s.startsWith("//")) return "#/";
  return s.startsWith("#") ? s : "#" + s;
}

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  if (e.action === "cerrar") return;

  const destino = rutaSegura(e.notification.data?.url);
  e.waitUntil((async () => {
    const clientes = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of clientes) {
      if (c.url.includes(BASE)) {
        c.postMessage({ tipo: "navegar", payload: { url: destino } });
        return c.focus();
      }
    }
    return self.clients.openWindow(BASE + (destino.startsWith("#") ? destino : "#" + destino));
  })());
});
