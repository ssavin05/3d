# Smart Hub V1 — acciones del propietario antes de abrir al público

Este archivo reemplaza la lista histórica. Sólo deja lo que todavía requiere
una cuenta externa, datos reales del negocio o una comprobación sobre la base
de producción. El código de esta entrega es **2.5.0**.

> Regla de V1: cuatro oficinas rentables (`OF-A`, `OF-B`, `OF-C`, `OF-D`),
> pago público únicamente con **Clip**, sin facturación ni proveedores sociales
> hasta que estén configurados y probados.

## 1. 🚨 Base de datos: respaldo y migraciones

Antes de tocar producción, crea/confirmar un backup desde Supabase. Después
revisa y aplica las migraciones pendientes **en orden**. Todas están en
`supabase/` y deben quedar registradas en tu historial de despliegue:

1. `migracion-01-borrado-cuenta`
2. `migracion-02-fuera-de-catalogo`
3. `migracion-03-insert-directo-espacio-cerrado`
4. `migracion-04-turno-por-franja`
5. `migracion-05-idempotencia-de-pagos`
6. `migracion-06-unificar-catalogo`
7. `migracion-07-metodo-de-pago-clip`
8. `migracion-08-telefono-opcional`
9. `migracion-09-nombres-comerciales`
10. `migracion-10-cerrar-escrituras-pospuestas`
11. `migracion-11-limpiar-ubicacion-placeholder`
12. `migracion-12-franjas-y-zona-horaria`
13. `migracion-13-quitar-promocion-ejemplo`

Las ocho últimas son especialmente importantes para esta entrega:

- **06** deja la base con los 24 espacios del plano y sólo 4 rentables.
- **07** permite guardar `clip` como método de pago.
- **08** convierte teléfono vacío a `NULL` y evita el `500` de Auth por
  `usuario_telefono_razonable`.
- **09** fija los nombres comerciales y aforos finales de A/B/C/D.
- **10** cierra INSERT directos de pagos/facturas desde el navegador; Clip sólo escribe desde servidor.
- **11** elimina las coordenadas genéricas de Ensenada para no publicar un pin falso.
- **12** hace que disponibilidad y reservas respeten la zona `America/Tijuana`, el horario de operación y sólo las seis franjas V1; también alinea el límite a 90 días.
- **13** desactiva la promoción de demostración `BIENVENIDO` si todavía conserva exactamente la huella del seed antiguo.

Para una instalación nueva se usa, en este orden:

```text
supabase/schema.sql
supabase/policies.sql
supabase/seguridad.sql
supabase/restricciones.sql
supabase/caducidad.sql
supabase/seed.sql
```

El `seed.sql` de 2.5.0 ya normaliza geometría, aforos, nombres y precios al
mismo canon de `js/data/planta.js`; no debe volver a crear la maqueta antigua.

## 2. 🚨 Clip: encender sólo después de una prueba real

El checkout público de V1 sólo registra **Clip**. Stripe, Mercado Pago,
PayPal, Google Pay, Apple Pay y transferencia no están en el runtime público.
Los adaptadores cliente de esas pasarelas fueron eliminados. Sólo quedan
componentes de servidor necesarios para compatibilidad/reembolsos históricos,
y no forman parte del checkout V1.

Checkout Redireccionado de Clip **no tiene sandbox**. Por eso la función tiene
un freno explícito: mientras `CLIP_COBROS_REALES` no sea `si`, crear un checkout
responde sin llamar a Clip.

Antes de encenderlo:

- [ ] Crear/usar una aplicación real de Clip.
- [ ] Guardar `CLIP_API_KEY` y `CLIP_SECRET_KEY` como secretos de Supabase.
- [ ] Guardar `SITIO_URL` con la URL pública definitiva.
- [ ] Aplicar `migracion-07-metodo-de-pago-clip.sql`.
- [ ] Desplegar `supabase/functions/pagos-clip`.
- [ ] Configurar el webhook de Clip hacia esa Edge Function.
- [ ] Poner `CLIP_COBROS_REALES=si` sólo para la prueba controlada.
- [ ] Habilitar `payments.clip.enabled=true` mediante la configuración de
      producción (`window.__APP_CONFIG__`) o el valor que uses al desplegar.

Prueba obligatoria con **cobro real de importe mínimo**:

- [ ] Crear reserva → ir a Clip → pagar → volver a Smart Hub.
- [ ] La reserva pasa a `confirmada` sólo después de verificar el checkout.
- [ ] Hay una sola fila de pago y el importe coincide.
- [ ] Cancelar una reserva con derecho a devolución y comprobar el reembolso
      en Clip.
- [ ] Repetir el reembolso y comprobar que no devuelve dos veces.
- [ ] Dejar un checkout incompleto y comprobar que la reserva pendiente caduca.

El navegador **no decide el monto del reembolso**: la Edge Function usa
`reservas.monto_reembolso`, calculado por la base.

## 3. 🚨 Correo/Auth: estado temporal

El envío SMTP de Brevo quedó bloqueado porque la cuenta SMTP todavía no está
activada. Para poder seguir probando, en Supabase se desactivó temporalmente
**Confirm email**.

El código 2.5.0 refleja esa realidad:

- `auth.emailDeliveryEnabled=false` por defecto;
- no muestra “Olvidé mi contraseña” como si funcionara;
- no anuncia Google/Apple por defecto;
- el registro por correo/contraseña puede usarse mientras Supabase tenga
  desactivada la confirmación.

**Antes de abrir al público**, elige y prueba un SMTP real (idealmente con el
dominio de la empresa), activa SPF/DKIM/DMARC y entonces:

- [ ] Activar la entrega de correo en el proveedor.
- [ ] Configurar SMTP en Supabase Auth.
- [ ] Probar registro, confirmación, recuperación y cambio de correo.
- [ ] Volver a activar **Confirm email** en Supabase.
- [ ] Poner `auth.emailDeliveryEnabled=true` en la configuración pública.

No actives Google o Apple hasta completar sus credenciales y redirects. Cuando
estén probados, usa `auth.googleEnabled=true` y/o `auth.appleEnabled=true`.

## 4. 🚨 Datos legales y del negocio

El correo público de soporte ya está configurado como
`savinsaul750@gmail.com`. Todavía faltan datos que no deben inventarse:

- [ ] Dirección completa del edificio.
- [ ] Teléfono/WhatsApp si se van a publicar.
- [ ] Razón social y RFC.
- [ ] Domicilio fiscal.
- [ ] Representante legal / correo legal si corresponde.
- [ ] Ley/jurisdicción y demás marcas `PENDIENTE` de `js/data/legal.js`.

No publiques los textos legales mientras `pendientes()` devuelva campos por
resolver. Una revisión profesional/legal sigue siendo decisión del negocio.

## 5. 🚨 Confirmar precios finales

El código conserva estos importes porque son los valores existentes del
proyecto; **no los cambié sin autorización comercial**:

| Código | Nombre | Capacidad | Hora | Día |
|---|---|---:|---:|---:|
| OF-A | Ejecutiva Plus | 5 | $260 | $1,700 |
| OF-B | Ejecutiva Compact | 4 | $180 | $1,150 |
| OF-C | Premium Patio View | 4 | $240 | $1,550 |
| OF-D | Ejecutiva Lounge | 3 | $220 | $1,450 |

- [ ] Confirmar que esos cuatro precios son los que realmente se cobrarán.
- [ ] Confirmar IVA/regla fiscal antes de cobrar al público.

## 6. Lo que queda deliberadamente fuera de V1

No bloquea el flujo principal y está apagado para no enseñar botones falsos:

- transferencia SPEI;
- Stripe / Mercado Pago / PayPal / Google Pay / Apple Pay;
- facturación CFDI (hasta tener emisor/PAC real);
- promociones;
- login Google/Apple;
- recuperación por correo mientras SMTP no esté listo.

## 7. Cierre mínimo antes de publicación

En este orden:

1. Backup + migraciones 01–13 verificadas.
2. Confirmar catálogo: 24 espacios activos, sólo A/B/C/D rentables.
3. Confirmar precios A/B/C/D.
4. Clip: despliegue + pago real + reembolso real.
5. SMTP/dominio + volver a activar confirmación de correo.
6. Completar datos legales/contacto.
7. Ejecutar pruebas del repositorio y recorrido manual de cliente/admin.
8. Sólo entonces empaquetar Android/iOS y mandar a tiendas.

Nada de Stripe es requisito de esta V1.


## Actualización 2.6.0 — mapa y horario

- [ ] Aplicar `supabase/migracion-14-horario-8-a-19-y-mapa-semaforo.sql` en producción.
- [ ] Verificar que los 7 días estén abiertos de 08:00 a 19:00.
- [ ] Verificar el mapa: verde = 11/11 libres, ámbar = 1–10/11 libres, rojo = 0/11 o espacio no reservable.
