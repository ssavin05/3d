# Checklist de lanzamiento — Smart Hub V1

Orden recomendado: de arriba abajo. Los pasos marcados 🚫 bloquean el
lanzamiento.

Lo que ya está hecho y probado no aparece aquí; esto es lo que queda por
verificar **en tu entorno real**, con tus datos y tus cuentas.

---

## 1. Marca

- [ ] La app dice «Smart Hub» en: pestaña del navegador, splash, barra
      superior, menú lateral, pantalla sin conexión y notificaciones push
- [ ] El icono de la PWA es el definitivo (`assets/icons/`)
- [ ] Al instalarla en el móvil, el nombre bajo el icono es correcto

> Comprobado en código. Falta verlo en un dispositivo real.

---

## 2. 🚫 Datos reales

- [ ] Correo público correcto y visible; dirección/teléfono/WhatsApp sólo si son reales → `OWNER_ACTIONS.md §4`
- [ ] Los mismos datos reales en la tabla `sedes` de Supabase
- [ ] Abrir `#/ayuda` y comprobar que sólo aparecen canales configurados
- [ ] Probar cada canal publicado desde un móvil

---

## 3. Fotos

- [ ] Ninguna ficha del catálogo enseña «Sin foto»
- [ ] Las fotos se ven bien en móvil (no deformadas, no cortadas por la mitad)
- [ ] Cargan desde el dominio de producción, no sólo en local

---

## 4. 🚫 Supabase

- [ ] Copia de seguridad hecha **antes** de tocar nada
- [ ] Migraciones 01–13 revisadas/aplicadas en orden → `OWNER_ACTIONS.md §1`
- [ ] Migración 03 aplicada (**seguridad**)
- [ ] Migración 04 aplicada (**seguridad**)
- [ ] 🚨 Migración 05 aplicada — **sin ella no se registra ningún cobro**
- [ ] 🚨 Migración 06 aplicada — **sin ella tu catálogo vende 18 espacios**,
      incluidos el jardín, el patio, el almacén, la cochera y la recepción
- [ ] 🚨 Migración 12 aplicada — franjas/horarios y zona horaria quedan cerrados también en API
- [ ] 🚨 Migración 13 aplicada — la promoción de ejemplo `BIENVENIDO` no queda activa
- [ ] 🚨 Migración 14 aplicada — horario 08:00–19:00 todos los días y semáforo del mapa coherente
- [ ] Comprobado: `select pg_get_constraintdef(oid) from pg_constraint
      where conname='uq_pagos_proveedor'` dice `UNIQUE (proveedor_id)`,
      **sin ningún WHERE**
- [ ] Consulta de auditoría de la migración 03 ejecutada: 0 filas
- [ ] Security Advisor revisado — los avisos que quedan están en
      `SECURITY.md §5` y son intencionales
- [ ] `select count(*) filter (where reservable) from espacios` → **4**
- [ ] `select count(*) filter (where activo) from espacios` → **24**
- [ ] Los 4 son `OF-A, OF-B, OF-C, OF-D`
- [ ] Migración 08 aplicada: teléfono opcional no rompe `/signup`
- [ ] Migración 09 aplicada: nombres/aforos A–D coinciden con el plano
- [ ] Precios A–D confirmados por negocio → `OWNER_ACTIONS.md §5`

---

## 5. 🚫 Autenticación

Estado temporal: el SMTP aún no está listo, por eso la entrega 2.5.0 oculta
recuperación por correo y OAuth, y Supabase puede mantenerse con **Confirm
email** desactivado sólo para pruebas internas.

Antes de abrir al público:

- [ ] SMTP real funcionando y `auth.emailDeliveryEnabled=true`
- [ ] Volver a activar **Confirm email** en Supabase
- [ ] Registro → llega correo → confirmar → entrar
- [ ] Recuperar contraseña → llega correo y vuelve al dominio correcto
- [ ] Cerrar sesión y volver a entrar
- [ ] Correo ya usado no revela existencia de la cuenta
- [ ] Eliminar cuenta desde Configuración → se borra y no se puede entrar
- [ ] Google/Apple siguen ocultos salvo que cada proveedor esté configurado y probado

---

## 6. 🚫 Correo

El bloqueo actual no es el código: el SMTP usado durante las pruebas no está
habilitado para enviar. No abras registro público con confirmación apagada.

- [ ] SMTP/proveedor activado → `OWNER_ACTIONS.md §3`
- [ ] Dominio/remitente propio cuando esté disponible
- [ ] SPF, DKIM y DMARC verificados
- [ ] Registro, recuperación y cambio de correo probados de punta a punta
- [ ] Confirm email reactivado en Supabase

---

## 7. 🚫 Pagos

### 7a. Clip (pasarela principal)

> ⚠️ **Clip no tiene sandbox para este flujo.** Checkout Redireccionado no
> funciona con credenciales de prueba y no hay host de pruebas: todo lo
> que se marque abajo como cobro es dinero real. El detalle está en
> `OWNER_ACTIONS.md` §2.

**Configuración (todavía sin cobrar nada):**

- [ ] `migracion-07` aplicada — sin ella la base rechaza los cobros de Clip
- [ ] `CLIP_API_KEY`, `CLIP_SECRET_KEY` y `SITIO_URL` en los secretos,
      con las credenciales **reales** (las `test_` no sirven aquí)
- [ ] `supabase functions deploy pagos-clip`
- [ ] `PAYMENTS.clip.enabled = true`
- [ ] Webhook dado de alta en el panel de Clip
- [ ] `CLIP_COBROS_REALES` **sin poner** → intentar pagar devuelve `503`
      y la app dice «todavía no está habilitado». Compruébalo: es el
      freno que impide cobrar por accidente

**Comprobaciones que no cuestan dinero:**

- [ ] `npm test` en verde — cubre que la reserva quede pendiente, que el
      webhook no confirme por sí solo y que el pago no se duplique
- [ ] **Webhook falso rechazado**: mandar a mano un POST a
      `/functions/v1/pagos-clip/webhook` con un `payment_request_id`
      inventado y `resource_status: COMPLETED` → **no debe confirmar nada**
      (el servidor verifica contra Clip, no se cree el aviso)
- [ ] `grep -ri "CLIP_.*_KEY" js/` → **sin resultados**

**La prueba real — con dinero, y sin alternativa:**

- [ ] `CLIP_COBROS_REALES=si`, y el ciclo completo de `OWNER_ACTIONS` §2
      hecho y comprobado en el panel de Clip: cobro mínimo real,
      verificación, reembolso, reembolso repetido que no duplica, pago
      abandonado, pago de un apartado caducado
- [ ] Sólo entonces, Clip abierto al público

### 7b. Métodos históricos

- [ ] Confirmar que Stripe, Mercado Pago, PayPal, Google Pay, Apple Pay y
      transferencia **no aparecen** en el checkout de V1.
- [ ] No reactivarlos mediante `window.__APP_CONFIG__`: el registro runtime
      de V1 sólo acepta Clip.

## 8. Reservas

- [ ] Crear, modificar y cancelar una reserva
- [ ] Dos navegadores distintos reservando el mismo horario a la vez →
      **sólo una gana**, y la otra ve «ese horario ya está ocupado»
      (no un error raro de base de datos)
- [ ] No se puede reservar en el pasado
- [ ] No se pueden reservar: Oficina Principal, Sala de Juntas, Espacio
      Abierto, Habitación, Oficina (OF-01), Almacén ni Cochera
- [ ] Con la app cerrada, llega el recordatorio (si activaste push)

---

## 9. Zona horaria

Baja California cambia de horario dos veces al año, y aquí ya hubo un
bug: las horas se interpretaban en la zona del **dispositivo**, no en la
del edificio. Reservar «09:00» desde Madrid guardaba las 00:00 de
Tijuana. Está corregido y cubierto por `tests/zona-horaria.mjs`
(10 casos: cinco zonas distintas, verano, invierno, los dos días de
cambio, la tira de días y el último bloque).

Queda por comprobar con datos reales:

- [ ] Reservar a las 09:00 y comprobar que en «Mis reservas» dice 09:00
- [ ] Que el correo de confirmación diga también la hora correcta
- [ ] Reservar desde un teléfono con otra zona horaria puesta y ver que
      llega la hora del edificio
- [ ] Comprobar la disponibilidad del **último bloque del día** (18:00–19:00)

---

## 10. Mapa 3D

- [ ] Se ven los 24 espacios y el edificio está completo, sin huecos
- [ ] Las 4 oficinas en renta salen en azul con su punto de disponibilidad
- [ ] Los espacios que no se rentan salen en gris (coincide con la leyenda)
- [ ] Tocar un espacio abre su panel
- [ ] Zoom, giro y arrastre funcionan con el dedo en un móvil
- [ ] En un móvil de gama baja no se calienta ni se traba

---

## 11. Rendimiento

Medido aquí con WebGL por software (sin GPU), así que los tiempos
absolutos del mapa 3D **no son representativos** de un teléfono real.
Lo que sí es sólido, porque se midió aisladamente y sin ruido:

| | antes | ahora |
|---|---|---|
| Fase de datos del mapa, backend caído | 3 501 ms | **602 ms** |
| Fotogramas dibujados con la escena quieta (3 s) | ~180 | **3** |

- [ ] Medir la carga real en un móvil de gama media, con datos móviles
- [ ] Pasar Lighthouse sobre el dominio de producción
- [ ] Comprobar que el mapa abre en menos de 3 s en un teléfono normal
- [ ] Con la app abierta y quieta en el mapa, el teléfono no se calienta

---

## 12. Móvil y responsive

Probar en un teléfono de verdad, no sólo redimensionando la ventana:

- [ ] iPhone pequeño (SE) — que el mapa y el calendario quepan
- [ ] Android de gama media
- [ ] Tablet
- [ ] El teclado virtual no tapa el campo que estás escribiendo
- [ ] El checkout se puede completar con una sola mano
- [ ] Nada se sale horizontalmente

---

## 13. Accesibilidad

- [ ] Se puede llegar a «Reservar» sólo con el teclado (Tab)
- [ ] Se ve dónde está el foco en todo momento
- [ ] Los errores de formulario se anuncian (probar con VoiceOver o TalkBack)
- [ ] Con el texto al 200 % nada se rompe

---

## 14. 🚫 Legal

- [ ] Los 14 huecos rellenados → `OWNER_ACTIONS.md §4`
- [ ] **Ninguna página legal muestra marcas naranjas** (si quedan, no está listo)
- [ ] Revisado por asesoría legal
- [ ] Los enlaces de la casilla de registro abren y se leen sin sesión

---

## 15. PWA

- [ ] Se instala en Android y en iOS
- [ ] Sin conexión: la app abre y muestra el aviso de offline
- [ ] Al desplegar una versión nueva, aparece el aviso de actualizar
- [ ] Tras actualizar, se ve el cambio (no queda pegada la versión vieja)
- [ ] **`VERSION` de `sw.js` subida en este despliegue** — hay una prueba
      que lo comprueba contra `APP.version`

---

## 16. Dominio

- [ ] Dominio apuntando y HTTPS funcionando
- [ ] «Site URL» y «Redirect URLs» de Supabase con el dominio definitivo
- [ ] La app carga bien desde la raíz del dominio

---

## 17. Pruebas automáticas

```bash
npm install
npm run db:preparar
npm test
```

- [ ] **11/11 suites en verde**
- [ ] Ninguna suite sale `OMITIDA` (si sale, es que no se ejecutó)
- [ ] `npm run test:auth` — va aparte porque toca tu Supabase de verdad.
      Mientras `auth.emailDeliveryEnabled=false`, las pruebas que dependen de
      correo no representan el lanzamiento público. Reactiva SMTP/Confirm email
      y ejecuta esta suite antes de publicar. Ver OWNER_ACTIONS §3.

---

## 18. Copias de seguridad

- [ ] Backups automáticos activados en Supabase
- [ ] Probado **restaurar** una copia (un backup sin probar no es un backup)
- [ ] Sabes dónde están las llaves y quién tiene acceso

---

## 19. El día del lanzamiento

- [ ] Copia de seguridad justo antes
- [ ] Desplegar
- [ ] Hacer una reserva real de principio a fin, pagando
- [ ] Cancelarla y comprobar el reembolso
- [ ] Mirar los logs de Supabase la primera hora
- [ ] Tener a mano cómo volver atrás

---

## Lo que queda para V1.1

No hace falta para abrir:

- Transferencia SPEI (apagada hasta tener cuenta real)
- PayPal y Mercado Pago (apagados, sin probar de punta a punta)
- Google Pay y Apple Pay (apagados a propósito)
- Facturación CFDI (si no facturas desde el día uno)
- Notificaciones push
- Multi-sede (el motor lo soporta; hay una sola sede)
