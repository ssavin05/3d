# Smart Hub — Sistema de reservas con mapa 3D

> **Mapa de reservas 2.6.0:** bloques 3D cerrados. Rojo = no disponible/no reservable, ámbar = disponibilidad parcial, verde = todo libre. Horario: todos los días, 08:00 a 19:00, en bloques de 1 hora.


Aplicación web progresiva (PWA) para reservar oficinas, con mapa 3D
interactivo del edificio, disponibilidad en tiempo real, pagos en línea y
panel de administración.

Sin paso de compilación: son módulos ES nativos. Se sube tal cual a
GitHub Pages, Netlify, Vercel o cualquier servidor estático.

> **Antes de abrir al público**, lee [`OWNER_ACTIONS.md`](OWNER_ACTIONS.md):
> hay datos/configuraciones de producción que no deben inventarse
> (domicilio, textos legales, SMTP y credenciales de Clip). La checklist de
> lanzamiento está en [`RELEASE_CHECKLIST.md`](RELEASE_CHECKLIST.md) y la
> arquitectura de seguridad en [`SECURITY.md`](SECURITY.md).

---

## Puesta en marcha en 5 minutos

```bash
# 1. Servir la carpeta (cualquier servidor estático sirve)
npm start
#   o:  python3 -m http.server 8099
```

Abre `http://localhost:8099`. **Funciona de inmediato** en modo
demostración con el plano real del edificio, aunque no configures nada.

Para conectar la base de datos real:

```
2. Crea un proyecto en supabase.com
3. SQL Editor → pega y ejecuta, en este orden:
     supabase/schema.sql
     supabase/policies.sql
     supabase/seguridad.sql
     supabase/restricciones.sql
     supabase/caducidad.sql
     supabase/seed.sql
4. Pon tu URL y tu llave pública en js/core/config.js  →  SUPABASE
5. Regístrate en la app y hazte administrador:
     update public.usuarios set rol = 'admin' where email = 'tucorreo@ejemplo.com';
```

Si ya tenías la base montada de antes, aplica también las migraciones
pendientes (`supabase/migracion-*.sql`) **en orden**. Las 03 y 04 son de
seguridad; ver `OWNER_ACTIONS.md §1`.

---

## Pruebas

```bash
npm install
npm run db:preparar     # PostgreSQL local con todo el esquema
npm test                # las 11 suites
```

| Comando | Qué corre |
|---|---|
| `npm test` | todo |
| `npm run test:e2e` | navegador: flujos, formularios, accesibilidad |
| `npm run test:sql` | RLS, roles y concurrencia contra PostgreSQL real |
| `npm run test:security` | lo anterior más los ataques desde el cliente |
| `npm run test:auth` | ⚠️ toca tu Supabase **real** — ver abajo |

`tests/coherencia.mjs` no necesita ni navegador ni base: comprueba que el
repositorio no se contradiga a sí mismo —que planta.js y `seed.sql` sigan
describiendo el mismo edificio, que las guías de instalación listen los
seis `.sql` en orden, que cada migración esté en `OWNER_ACTIONS.md` y que
no se cuele ninguna credencial de producción—. Los tres fallos más caros
de este proyecto fueron de esa clase y ninguna prueba de código los veía.

Las de SQL necesitan un PostgreSQL local (`npm run db:preparar` lo monta).
Si no lo encuentra, la suite sale **OMITIDA** — nunca en verde.

`test:auth` va aparte de `npm test` a propósito: habla con un proyecto de
Supabase real y puede consumir límites de Auth/correo. Córrela sólo con un
entorno de prueba preparado; el estado de SMTP actual está en
`OWNER_ACTIONS.md §3`.

---

## Qué hay implementado

### Autenticación y cuentas
Inicio de sesión con correo y contraseña · Registro con validación de fuerza
de contraseña · Sesión persistente opcional ("mantener sesión iniciada") ·
Perfil editable con foto · Roles (usuario / staff / admin / superadmin).
Recuperación por correo, enlace mágico, Google OAuth y Apple Sign In existen
en el código, pero **no se anuncian por defecto**: se habilitan sólo cuando
el SMTP/proveedor correspondiente esté configurado y probado.

**Seguridad de la cuenta:** cambio de contraseña desde dentro (verificando
la actual) · cierre de sesión en el resto de dispositivos · exportación de
datos personales en JSON · **eliminación de cuenta real**, con confirmación
escrita, que borra perfil, foto, favoritos, reseñas, notificaciones, lista
de espera, suscripciones push y conversaciones, y anonimiza únicamente los
comprobantes que la ley obliga a conservar.

### Reservas
Disponibilidad en tiempo real por WebSocket · Calendario rápido de 14 días
y calendario mensual completo · Bloques de 2 horas · Reserva atómica (el
motor de base de datos hace **imposible** el doble booking) · Cancelación
con política de reembolso · Modificación de fecha y hora · Lista de espera
con aviso automático al liberarse un horario · Historial completo ·
Favoritos · Reseñas y calificaciones · Recordatorios 24 h y 1 h antes ·
Archivo `.ics` para el calendario del teléfono.

### Mapa 3D
Escena Three.js construida desde los datos reales de la base · Materiales
PBR con texturas generadas por código (sin descargas pesadas) ·
Iluminación por imagen HDRI (o entorno generado si no hay archivo) ·
Sombras suaves · Reflejos · Carga de modelos GLTF/GLB con compresión Draco,
Meshopt y KTX2 · Puertas animadas · Personas caminando con ciclo de marcha ·
Elevador con puertas correderas · Vegetación con vaivén · Autos en la
cochera · Mobiliario por tipo de espacio · Mini mapa 2D sincronizado ·
Ruta animada hacia la oficina · Indicador de ubicación pulsante ·
Semáforo de disponibilidad en los volúmenes · Tres niveles de calidad con
detección automática de dispositivo y degradación si bajan los FPS.

### Pagos

**V1 público:** Clip, y únicamente Clip. Los adaptadores cliente de
Stripe, Mercado Pago, PayPal, Google Pay, Apple Pay y transferencia fueron
eliminados para que una configuración vieja no pueda reactivarlos. Sólo se
conserva compatibilidad de servidor donde hace falta para datos/reembolsos
históricos.

Clip está **apagado por defecto** hasta que estén cargadas las credenciales
reales en Supabase, desplegada `pagos-clip`, aplicada la migración 07 y
activado deliberadamente `CLIP_COBROS_REALES=si`. Checkout Redireccionado
no tiene sandbox: la prueba punta a punta mueve dinero real.

El importe del cobro siempre se obtiene de la reserva en la base. El
navegador no puede autorizar su propio pago ni elegir el importe de un
reembolso. Al volver de Clip, la app verifica el `payment_request_id`
contra la Edge Function antes de considerar confirmada la reserva.

La facturación CFDI está apagada por defecto hasta configurar y probar un
PAC real. El comprobante interno de la reserva sigue disponible.

### Administración
Panel con KPIs · CRUD completo de espacios (datos, precios, geometría del
plano, amenidades, fotos, video, 360°, modelo 3D) · Cambio de estado ·
Subida y ordenación de fotos con portada · Gestión de reservas (confirmar,
cancelar, exportar CSV) · Promociones · Sedes, edificios y pisos ·
Usuarios y roles · Bloqueos por mantenimiento · Horarios de operación.

### Analítica
Ingresos por día (gráfica de área) · Reservas y cancelaciones (barras) ·
Espacios más reservados · Mapa de calor de horarios pico · Ocupación ·
Ticket promedio · Tasa de cancelación · Exportación a CSV.

### Experiencia
Pantalla de carga · Tutorial de tres pasos · Navegación inferior · Menú
lateral con gesto de cierre · Modo claro, oscuro y automático · Español e
inglés · Animaciones suaves desactivables · Vibración háptica · Avisos
(toasts) · Hojas inferiores arrastrables · Esqueletos de carga · Foco
atrapado en diálogos · Respeto de `prefers-reduced-motion` y
`prefers-contrast`.

### PWA y offline
Instalable como PWA · Service worker con cuatro estrategias de caché ·
Pantalla offline · Lectura de datos ya descargados · Cola sólo para
operaciones no críticas (favoritos) · Background Sync · Notificaciones
push Web Push (VAPID) cuando se configuran · Aviso de versión nueva ·
Atajos de aplicación · Share Target. Reservar, modificar, cancelar y pagar
requieren conexión real para no vender una disponibilidad inventada.

### Página pública
"Quiénes somos" con historia, cifras, servicios, diferenciadores, el
edificio, el equipo, horarios, ubicación y testimonios reales tomados de la
base de datos. Todo el texto se edita en un solo archivo
(`js/data/contenido.js`); los testimonios se ocultan solos en modo
demostración para no publicar reseñas inventadas.

### Comunicación
Chat en tiempo real con la administración · Asistente de IA con
herramientas reales (consulta catálogo y disponibilidad) y motor local de
respaldo que funciona sin llaves · Búsqueda en lenguaje natural
("sala para 8 personas el jueves por la tarde con proyector") ·
Recomendaciones personalizadas · WhatsApp, llamada y correo · Centro de
ayuda con 17 preguntas frecuentes buscables.

### Seguridad
HTTPS obligatorio para service worker y carteras de pago · JWT con
refresco automático · OAuth 2.0 / OIDC · Row Level Security en **todas**
las tablas · Validación de importes en servidor · Escapado de HTML en
todas las interpolaciones · Protección contra escalado de rol por trigger ·
Restricción de exclusión contra doble booking · Buckets de Storage con
políticas por carpeta de usuario.

Se comprueba conectándose como PostgREST (`set local role` + claims del
JWT), no como superusuario: RLS no se evalúa nunca para el superusuario,
así que probar desde `postgres` no demuestra nada. Ver
[`SECURITY.md`](SECURITY.md).

---

## Estructura

```
index.html                 Cascarón de la aplicación
manifest.webmanifest       Manifiesto PWA
sw.js                      Service worker
offline.html               Pantalla sin conexión

css/
  tokens.css               Colores, tipografía, espacios (claro + oscuro)
  base.css                 Reset y layout raíz
  components.css           Botones, tarjetas, hojas, avisos…
  views.css                Estilos por pantalla

js/
  main.js                  Arranque y registro de rutas
  pwa.js                   Instalación, actualizaciones y push
  core/                    config · utils · bus · store · router · i18n ·
                           tema · haptics · iconos · ui
  data/                    db (Supabase) · api · cache (IndexedDB) ·
                           sync (cola offline) · realtime · mock ·
                           contenido (textos de "Quiénes somos")
  auth/                    auth · permisos
  views/                   Una pantalla por archivo (carga diferida)
    admin/                 Panel de administración
  three/                   loader · materiales · edificio · vida ·
                           escena · minimapa
  payments/                index · clip · comprobante
  ai/                      busqueda · asistente

supabase/
  schema.sql               Tablas, funciones, triggers y vistas
  policies.sql             Row Level Security y buckets
  seed.sql                 Plano real del edificio (24 espacios)
  migracion-01-*.sql       Sólo si ya aplicaste una versión anterior
  functions/               Edge Functions (Deno)

docs/CONFIGURACION.md      Guía detallada de cada integración
```

---

## Configuración

Todo se centraliza en **`js/core/config.js`**. Para no tocar el código
fuente, puedes definir `window.__APP_CONFIG__` antes de cargar `js/main.js`:

```html
<script>
window.__APP_CONFIG__ = {
  supabase: { url: "https://xxx.supabase.co", anonKey: "sb_publishable_..." },
  auth: {
    emailDeliveryEnabled: false,
    googleEnabled: false,
    appleEnabled: false
  },
  payments: {
    clip: { enabled: false } // encender sólo después del checklist real
  },
  push:    { vapidPublicKey: "B..." },
  contact: { whatsapp: "526461234567", email: "hola@tudominio.mx" }
};
</script>
```

Detalle de cada integración en [`docs/CONFIGURACION.md`](docs/CONFIGURACION.md).

---

## Modo demostración

Si Supabase **no está configurado**, puede usarse el modo demostración para
enseñar el catálogo sin backend. Si Supabase sí está configurado pero se cae
o agota el tiempo, la app **no inventa disponibilidad, reservas ni pagos**:
las operaciones críticas fallan de forma explícita. Así una caída de red no
puede hacer creer a una persona que apartó un horario que nunca llegó a la
base.

---

## Compatibilidad

| Navegador       | Versión mínima | Notas                                   |
|-----------------|----------------|-----------------------------------------|
| Chrome / Edge   | 89             | Flujo web/PWA y Clip                     |
| Safari          | 16.4           | Flujo web/PWA y push en iOS              |
| Firefox         | 108            | Flujo web/PWA                            |
| Samsung Internet| 15             | Flujo web/PWA                            |

El mapa 3D necesita WebGL 2. Si no está disponible, la app ofrece el
catálogo en lista sin romperse.

---

## Rendimiento

- **Arranque:** sólo el núcleo (~45 KB de JS propio sin comprimir). Cada
  vista y Three.js se descargan al visitarlas.
- **Datos:** la caché en IndexedDB pinta la pantalla al instante y la red
  refresca detrás (*stale-while-revalidate*).
- **3D:** tres perfiles de calidad, texturas generadas al vuelo con
  resolución adaptable, y apagado automático de sombras si los FPS bajan
  de 26.
- **Imágenes:** `loading="lazy"` y `decoding="async"` en todas.

---

## Licencia

Código propiedad del cliente. El plano y los datos del edificio son reales
y confidenciales.

## Auditoría de endurecimiento 2.5.0

El barrido agresivo de V1, los recortes realizados, pruebas ejecutadas y
bloqueos reales de producción están en [`docs/ATAQUE-2.5.0.md`](docs/ATAQUE-2.5.0.md).
