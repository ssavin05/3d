# Seguridad — Smart Hub

Cómo está defendida esta aplicación, qué avisos son intencionales y qué
hacer si algo se rompe.

---

## 1. El principio: la base de datos manda

El frontend es una app estática. Cualquiera puede abrir las herramientas
de desarrollo, editar el JavaScript y mandar lo que quiera a la API — y
la API de Supabase (PostgREST) es pública por diseño.

Por eso **ninguna regla de negocio vive sólo en el cliente**. Todo lo que
importa se comprueba en PostgreSQL:

| Regla | Dónde se aplica de verdad |
|---|---|
| Quién ve cada fila | RLS (`policies.sql`) |
| Quién puede escribir | RLS + triggers guardián (`seguridad.sql`) |
| Cuánto cuesta una reserva | `guardia_reserva_insert()` y `crear_reserva()` |
| Si un espacio se puede reservar | las dos funciones de arriba |
| Que no haya dos reservas encima | restricción de exclusión `reservas_sin_solape` |
| Que nadie se haga admin | `proteger_rol()` |

Que la interfaz no pinte un botón **no es una defensa**. Se documenta
aquí porque ya costó un agujero real (ver §6).

---

## 2. Roles

| Rol | Quién es | Qué puede |
|---|---|---|
| `anon` | visitante sin sesión | leer el catálogo y los espacios activos |
| `authenticated` | cuenta iniciada | lo suyo: sus reservas, su perfil, sus pagos |
| `service_role` | Edge Functions | **salta RLS entero** |

`service_role` **jamás** va en el navegador. Vive sólo en los Secrets de
Supabase, que el frontend no puede leer. Si esa llave se filtra, quien la
tenga lee y escribe toda la base sin restricción: es la llave maestra.

Hay una prueba que lo recuerda: `tests/sql/suite.mjs` verifica que
`service_role` tiene `bypassrls`.

---

## 3. Cómo se prueba

Leer los `.sql` no demuestra nada: una policy puede estar escrita y no
aplicarse, y **RLS no se evalúa nunca para el superusuario**. Por eso las
pruebas se conectan como lo hace PostgREST:

```sql
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"…","role":"authenticated"}', true);
```

```bash
npm run db:preparar     # monta un PostgreSQL local con todo el esquema
npm run test:sql        # 19 casos propios + las 3 tandas SQL del repo
npm run test:security   # eso más los ataques desde el cliente
npm run test:auth       # ⚠️ toca el Supabase REAL — ver OWNER_ACTIONS §3
```

`test:sql` cubre RLS, aislamiento entre personas, escalada de rol,
catálogo, las dos vías de reserva, recálculo de precio, concurrencia,
idempotencia del webhook de pago y dos guardias estructurales. Las tandas
del repositorio (`supabase/pruebas-*.sql`) añaden restricciones,
seguridad y caducidad de apartados.

`test:auth` queda fuera de `npm test` porque habla con el proyecto de
verdad: dispara el freno a la fuerza bruta y gasta cupo de correo.

> ⚠️ **Trampa que ya mordió una vez.** Hay que poner también el claim
> `role`, no sólo el `sub`. `rol_peticion()` cae a `'postgres'` cuando no
> encuentra ninguno, y con eso `escritura_confiable()` devuelve `true` y
> los triggers se apartan creyendo que escribe el servidor. Una suite que
> sólo ponga el `sub` **pasa en verde mientras comprueba lo contrario de
> lo que dice comprobar**.

---

## 4. Funciones con privilegios (`SECURITY DEFINER`)

Corren con los permisos de quien las creó, no de quien las llama. Son
necesarias —RLS no se puede aplicar a sí misma— pero cada una es una
puerta, así que todas llevan:

- `set search_path = public` — sin esto, alguien podría crear un esquema
  propio con funciones que suplanten a las del sistema y colarlas dentro
  de la función privilegiada;
- comprobación de identidad (`auth.uid() is null` → excepción);
- comprobación de propiedad (que la reserva sea tuya, que la organización
  sea la tuya);
- validación de los argumentos antes de tocar nada.

Las principales:

| Función | Por qué necesita privilegios |
|---|---|
| `crear_reserva` | escribe saltándose RLS tras validar dueño, precio y hueco |
| `cancelar_reserva` / `modificar_reserva` | igual, y calculan el reembolso |
| `esta_disponible` | tiene que ver reservas ajenas para saber si hay hueco, sin enseñarlas |
| `es_staff` / `es_admin` | las llaman las propias policies: si no fueran definer, RLS se mordería la cola |
| `guardia_*` | triggers que reescriben lo que manda el cliente |
| `manejar_nuevo_usuario` | escribe en `public.usuarios` al crearse una cuenta en `auth` |

**No conviertas estas funciones a `SECURITY INVOKER` en bloque.** Varias
las llama RLS: al quitarles el privilegio, las policies dejan de poder
evaluarse y el efecto es que **todo el mundo deja de ver sus propios
datos** — o peor, según cómo esté escrita la policy.

---

## 5. Avisos del Security Advisor que son intencionales

No perseguimos «0 warnings» por estética. Estos están puestos a
propósito:

- **Funciones `SECURITY DEFINER` en `public`.** Sí, están expuestas por
  PostgREST. Es lo que se quiere: `crear_reserva` tiene que poder
  llamarse desde el navegador. La defensa no es esconderla, es que
  valida identidad, propiedad y argumentos, y que su `search_path` está
  fijado.
- **`service_role` con `bypassrls`.** Es su función. El control está en
  que la llave no salga del servidor.
- **Tablas de catálogo legibles por `anon`.** `espacios`, `amenidades` y
  `sedes` son públicas a propósito: es el escaparate del negocio.

Lo que **no** es intencional y hay que arreglar si aparece: cualquier
policy `using (true)` sobre `usuarios`, `reservas`, `pagos` o
`facturas`; cualquier función definer sin `search_path`; cualquier
`grant` a `anon` sobre tablas de escritura.

---

## 6. Agujeros encontrados y cerrados

Se dejan documentados: entender por qué pasó vale más que la línea que lo
arregló.

### INSERT directo sobre un espacio que no se renta
*Migración 03.* `crear_reserva()` comprobaba `activo`, `reservable` y
`estado`. El trigger que vigila los INSERT directos, no. Como PostgREST
expone la tabla, bastaba con:

```
POST /rest/v1/reservas   { "espacio_id": "<id de la Oficina Principal>", … }
```

y quedaba reservado un espacio que no está a la venta. Servía igual para
un espacio en mantenimiento o marcado «próximamente».

**Lección:** cada camino de escritura necesita su propio guardián. Que la
RPC valide no protege a la tabla.

### El cobro con tarjeta no llegaba a registrarse
*Migración 05. El peor de los tres.* El webhook guarda el pago con
`upsert(..., { onConflict: "proveedor_id" })`, que exige una restricción
única **inferible**. La que había era un índice **parcial**
(`where proveedor_id is not null`), y PostgreSQL no infiere índices
parciales salvo que la sentencia repita el predicado — cosa que PostgREST
no hace. Cada upsert moría con `42P10`.

Como `confirmarPago()` hace `throw` ante ese error, el webhook devolvía
500: el cliente pagaba, Stripe le cobraba, el pago no se registraba y la
reserva jamás pasaba a confirmada. Dinero cobrado, nada entregado, y sin
rastro en la base para reclamarlo.

**Lección:** un índice puede estar, verse bien y no servir. Lo único que
lo demuestra es ejecutar la sentencia real contra PostgreSQL. Ahora hay
una prueba que entrega el mismo webhook dos veces, y una guardia
estructural que rechaza cualquier índice único parcial nuevo.

### El catálogo real vendía 18 espacios, no 5
*Migración 06.* Tres ficheros decían describir el mismo edificio y ninguno
coincidía: el plano (24 espacios, 5 en renta), el seed (23, códigos
distintos) y la base real (18, **todos** en renta). La base nunca se
sembró con `seed.sql`, así que llevaba códigos `ESP-nnn` propios.

El efecto no era teórico: el catálogo público ofrecía reservar el Jardín
Privado, el Patio, el Almacén, la Cochera y la Recepción. Y las
migraciones 02 y 03 —escritas buscando por código— no encontraban nada
allí, así que parecían aplicadas y no hacían nada.

**Lección:** una migración que filtra por una clave de negocio (`codigo`)
sólo funciona si esa clave es la misma en todas partes. Antes de escribir
un `where codigo in (…)`, hay que mirar qué hay de verdad en la base, no
qué dice el repositorio que debería haber. Ahora una prueba compara
`planta.js` con la base y falla si divergen.

### `caducidad.sql` no se aplicaba nunca
Mismo desenlace, otra causa. Ese archivo crea `reservas.expira_en`, que
`confirmarPago()` lee — y no estaba en ninguna secuencia de instalación:
ni en el README, ni en el preparador de la base, ni en la documentación.
En una instalación nueva el webhook reventaba al seleccionar una columna
inexistente, con el mismo resultado: cobro hecho, nada registrado.

Salió al ejecutar por primera vez las tres tandas SQL que ya venían en
`supabase/pruebas-*.sql` y que no lanzaba nadie.

**Lección:** un fichero de pruebas que ningún comando ejecuta es
documentación, no una prueba. Ahora las corre `npm run test:sql`.

### La reserva perdedora moría con `deadlock detected`
*Migración 04.* Con dos personas sobre el mismo hueco, la restricción de
exclusión hacía su trabajo —sólo entraba una— pero cada transacción
insertaba su entrada en el índice, veía la de la otra y se esperaba. Dos
esperándose es un ciclo, y el motor mataba una arbitrariamente.

No era un fallo de corrección, era un fallo de diagnóstico: la persona
veía un error de motor en vez de «ese horario ya está ocupado», y `40P01`
es oficialmente reintentable, así que el cliente no sabía qué hacer.

Ahora se toma `pg_advisory_xact_lock(espacio, franja)` **antes** de
comprobar disponibilidad: los contendientes pasan de uno en uno y el
segundo sale con el error de negocio correcto. La restricción de
exclusión se queda: es la garantía real, el lock sólo ordena la cola.

---

## 7. Clip: un webhook sin firma

Clip México es la pasarela principal, y su webhook de checkout **no está
firmado**: la documentación no define cabecera de firma, ni HMAC, ni
secreto compartido. Un webhook sin firma es un endpoint público.

Si se confiara en su contenido, esto bastaría para reservar gratis:

```
POST /functions/v1/pagos-clip/webhook
{ "payment_request_id": "<el de otra persona>", "resource_status": "COMPLETED" }
```

**Por eso el webhook no confirma nada.** Sólo aporta un identificador; a
partir de ahí el servidor le pregunta a Clip con nuestras credenciales
(`GET https://api.payclip.com/v2/checkout/{payment_request_id}`) y actúa
según lo que responda Clip, no según lo que diga el aviso. El
identificador tampoco se cree hasta comprobar que existe en nuestra
propia tabla de pagos.

El peor abuso posible queda en obligarnos a hacer una consulta de más.

Lo mismo vale para la vuelta del cliente desde Clip: la pantalla no
confirma por haber vuelto con `?success`, llama a `/verificar`, que hace
exactamente la misma comprobación contra la API.

**Idempotencia.** Clip no ofrece llave de idempotencia, ni en cobros ni
en reembolsos. La ponemos nosotros: los cobros se apuntan con
`proveedor_id = payment_request_id` sobre la restricción única de
`pagos`, así que un aviso repetido actualiza la misma fila; y antes de
reembolsar se mira el estado del pago, para no devolver dos veces.

### 7b. Sin sandbox: por qué eso también es un asunto de seguridad

Checkout Redireccionado **no funciona con las credenciales de prueba de
Clip**. Su modo de prueba cubre Checkout Transparente, la API de
reembolsos y el SDK, y la documentación cierra la lista: *«Cualquier otra
API que no se encuentre en esta lista no funcionará en el modo de
prueba.»* Tampoco hay host de sandbox — sólo `https://api.payclip.com`.

Esto es de seguridad y no sólo de pruebas, por dos razones.

La primera: un despliegue que *cree* estar en un entorno de pruebas cobra
dinero real. La versión anterior de esta función aceptaba
`CLIP_ENTORNO=pruebas`, no cambiaba de host —no hay otro— y encima
guardaba `entorno: "pruebas"` en cada fila de `pagos`. Cargos reales
etiquetados como pruebas: un problema de integridad de los datos
contables, además de una invitación a encender la pasarela creyendo que
no pasa nada. Esa variable ya no existe.

La segunda: como no se puede validar el cobro sin cobrar, hace falta un
freno explícito en vez de un falso entorno seguro. Es
`CLIP_COBROS_REALES`; mientras no valga `si`, crear un checkout responde
`503` y no se llama a Clip. Y si las credenciales llevan el prefijo
`test_`, la función lo dice con una frase clara en vez de dejar que Clip
conteste un 401 que parece un fallo del código. El prefijo se comprueba;
el valor no se registra ni se devuelve nunca.

Lo que se verifica sin cobrar es **estructura** —la reserva queda
pendiente, el webhook no confirma solo, el pago no se duplica, ninguna
credencial llega al navegador— y en este repositorio se llama estructura,
no «prueba de cobro». La validación de punta a punta es un cargo real de
importe mínimo, y está en `OWNER_ACTIONS.md` §3d.

---

## 8. Storage — pendiente de verificar en el proyecto real

Los cuatro buckets están acotados razonablemente:

| Bucket | Lectura | Escritura |
|---|---|---|
| `avatares` | pública | sólo tu carpeta `<uid>/` |
| `espacios`, `modelos-3d` | pública | staff de la organización dueña del espacio |
| `facturas` | **privado**: su dueño o el staff | servicio |

**Un punto sin resolver.** `avatares_lectura` es
`for select using (bucket_id = 'avatares')`, sin restricción de rol. En
Storage, `select` sobre `storage.objects` no es sólo descargar: es
**listar**. Y como cada avatar vive en `<uid>/…`, listar el bucket
enumera el identificador de todos los usuarios registrados que tengan
foto.

Que el archivo sea público no obliga a que el catálogo lo sea: un bucket
público sirve las imágenes por su URL pública sin consultar RLS, así que
en principio se puede cerrar el listado sin romper que las fotos se vean.

No lo he cambiado a propósito: **no se tocan políticas de Storage sin
probar el acceso real**, y aquí no hay un Supabase en vivo contra el que
comprobarlo (el PostgreSQL local de las pruebas no trae el esquema
`storage`). Queda como tarea del propietario, en `OWNER_ACTIONS.md §12`,
con los cuatro accesos que hay que probar por separado: URL pública,
listado, subida y borrado.

---

## 9. Datos que no se guardan

- **Números de tarjeta.** No pasan por el servidor de Smart Hub. En V1 los captura Clip en
  su propio iframe. No existe formulario propio de tarjeta: se quitó, y
  hay una prueba (`caso D2`) que falla si alguien lo reintroduce.
- **Ubicación GPS.** La app no la pide. Nunca.
- **Tokens de sesión en caché.** El service worker tiene prohibido
  guardar `/auth/` y `/realtime/`.

---

## 10. Secretos: dónde va cada cosa

| Secreto | Dónde vive | ¿Puede ir al repositorio? |
|---|---|---|
| `SUPABASE_URL`, llave publicable | `js/core/config.js` | Sí — son públicas |
| `pk_test_` / `pk_live_` de Stripe | No se usa en V1 | Histórico; no debe quedar embebido |
| `CLIP_API_KEY` y `CLIP_SECRET_KEY` | Secrets de Supabase | **NO** — Clip no tiene llave pública |
| `sk_live_` / `sk_test_` de Stripe | Secrets de Supabase | **NO** |
| `STRIPE_WEBHOOK_SECRET` | Secrets de Supabase | **NO** |
| `SUPABASE_SERVICE_ROLE_KEY` | Secrets de Supabase | **NO** |
| `VAPID_PRIVATE_KEY` | Secrets de Supabase | **NO** |
| `ANTHROPIC_API_KEY` | Secrets de Supabase | **NO** |
| Credenciales del PAC | Secrets de Supabase | **NO** |

Regla rápida: si empieza por `sk_`, `whsec_` o lleva `SERVICE_ROLE` o
`PRIVATE`, no toca el navegador.

---

## 11. Si pasa algo

**Sospecha de llave filtrada** (`service_role`, `sk_live`, VAPID privada):

1. Rótala **primero**, investiga después. En Stripe: Developers → API
   keys → Roll. En Supabase: Settings → API → Reset.
2. Actualiza el secreto en Supabase → Edge Functions → Secrets.
3. Revisa los logs de las últimas 48 h buscando escrituras raras:
   reservas sobre espacios cerrados, cambios de rol, pagos sin webhook.
4. Si era `service_role`, asume que **toda** la base fue legible.

**Reservas que entraron por un agujero:**

```sql
select r.id, r.folio, r.inicio, e.codigo, e.nombre
  from public.reservas r
  join public.espacios e on e.id = r.espacio_id
 where (not e.reservable or not e.activo or e.estado <> 'disponible')
   and r.estado in ('pendiente','confirmada','en_curso');
```

**Cuenta comprometida:** Supabase → Authentication → el usuario →
«Sign out user» invalida sus sesiones.

**Antes de tocar producción:** copia de seguridad (Database → Backups),
probar la migración en local (`npm run db:preparar`), y tener a mano cómo
deshacerlo.

---

## 12. Reportar un fallo de seguridad

Escribe a `CORREO_LEGAL` *(pendiente — ver OWNER_ACTIONS.md §1)*. No
abras un issue público con los detalles.
