/* ======================================================================
   admin/panel.js — Resumen del panel de administración.
   ====================================================================== */
import { html, raw, esc, formatMoneda, formatNumero, formatPorcentaje, isoFecha, fechaHora } from "../../core/utils.js";
import { t } from "../../core/i18n.js";
import { icono } from "../../core/iconos.js";
import { vacio } from "../../core/ui.js";
import api from "../../data/api.js";
import store from "../../core/store.js";
import { esAdmin } from "../../auth/permisos.js";
import { enModoDemo } from "../../data/api.js";

export const titulo = () => t("admin.titulo");
export const subtitulo = () => store.get().organizacion?.nombre || "";

export async function render(contenedor) {
  contenedor.innerHTML = html`
    <div class="vista-scroll">
      <div class="vista-contenido">
        ${enModoDemo() ? raw(`<div class="aviso aviso-warm">
          <strong>Modo local.</strong> Los datos se guardan en este equipo. Para compartirlos entre
          dispositivos aplica <code>supabase/schema.sql</code>, <code>policies.sql</code> y
          <code>seguridad.sql</code> en tu proyecto de Supabase.
        </div>`) : ""}

        <div class="grid-3" id="ad-kpis">
          ${raw('<div class="esqueleto" style="height:88px;border-radius:var(--r)"></div>'.repeat(4))}
        </div>

        <section class="seccion mt-6">
          <h2 class="seccion-titulo">Accesos rápidos</h2>
          <div class="grid-auto">
            ${acceso("/admin/espacios", "edificio", t("admin.espacios"), "Crear, editar, precios, fotos y estados")}
            ${acceso("/admin/reservas", "calendario", t("admin.reservas"), "Buscar, confirmar y cancelar")}
            ${acceso("/admin/apariencia", "ajustes", "Qué se ve en la app", "Apagar secciones y esconder espacios")}
            ${acceso("/admin/estadisticas", "grafica", t("admin.estadisticas"), "Ingresos, ocupación y horarios pico")}
            ${acceso("/admin/edificios", "cubo", t("admin.edificios"), "Sedes, edificios y pisos")}
            ${acceso("/admin/usuarios", "personas", t("admin.usuarios"), "Roles y permisos")}
          </div>
        </section>

        <section class="seccion">
          <div class="seccion-cab">
            <h2>Reservas de hoy</h2>
            <a class="enlace" href="#/admin/reservas">${t("home.verTodo")}</a>
          </div>
          <div id="ad-hoy"><div class="esqueleto esq-tarjeta"></div></div>
        </section>

        <section class="seccion">
          <div class="seccion-cab"><h2>Ocupación por espacio</h2></div>
          <div id="ad-ocupacion"><div class="esqueleto esq-tarjeta"></div></div>
        </section>
      </div>
    </div>`;

  const [metricas, reservasHoy, espacios] = await Promise.all([
    api.adminMetricas({ dias: 30 }).catch(() => ({ totales: {}, populares: [] })),
    api.adminReservas({ desde: `${isoFecha()}T00:00:00`, hasta: `${isoFecha()}T23:59:59`, limite: 30 }).catch(() => []),
    api.getEspacios(),
  ]);

  pintarKpis(contenedor, metricas, espacios);
  pintarHoy(contenedor, reservasHoy);
  pintarOcupacion(contenedor, metricas, espacios);
}

const acceso = (ruta, ico, titulo, desc) => html`
  <a class="tarjeta tarjeta-pad canal" href="#${ruta}">
    <span class="canal-ico" style="background:var(--marca-suave);color:var(--marca)">${raw(icono(ico, { size: 19 }))}</span>
    <strong>${titulo}</strong>
    <span class="texto-sm texto-dim">${desc}</span>
  </a>`;

function pintarKpis(contenedor, metricas, espacios) {
  const tot = metricas.totales || {};
  const reservables = espacios.filter((e) => e.reservable);
  const disponibles = reservables.filter((e) => e.estado === "disponible").length;

  contenedor.querySelector("#ad-kpis").innerHTML = html`
    ${kpi(formatMoneda(tot.ingresos || 0), t("admin.ingresos"), "30 días", "wallet", "ok")}
    ${kpi(formatNumero(tot.reservas || 0), t("admin.reservas"), "30 días", "calendario", "marca")}
    ${kpi(`${disponibles}/${reservables.length}`, "Espacios activos", "Disponibles ahora", "edificio", "purple")}
    ${kpi(formatPorcentaje(tot.tasaCancelacion || 0, 1), "Cancelaciones", "30 días", "cerrar", (tot.tasaCancelacion || 0) > 0.15 ? "taken" : "neutro")}`;
}

const kpi = (valor, etiqueta, sub, ico, tono) => html`
  <div class="tarjeta stat stat-kpi">
    <span class="stat-ico stat-${raw(tono)}">${raw(icono(ico, { size: 17 }))}</span>
    <strong class="stat-valor">${valor}</strong>
    <span class="stat-etiqueta">${etiqueta}</span>
    <span class="texto-xs texto-suave">${sub}</span>
  </div>`;

function pintarHoy(contenedor, reservas) {
  const caja = contenedor.querySelector("#ad-hoy");
  if (!reservas.length) {
    caja.innerHTML = vacio({ ico: "📅", titulo: "Sin reservas hoy", desc: "Cuando alguien reserve, aparecerá aquí." });
    return;
  }
  const orden = [...reservas].sort((a, b) => new Date(a.inicio) - new Date(b.inicio));
  caja.innerHTML = `<div class="lista tarjeta">${orden.map((r) => html`
    <a class="lista-item" href="#/admin/reservas?folio=${encodeURIComponent(r.folio || "")}">
      <span class="li-ico">${new Date(r.inicio).getHours()}h</span>
      <span class="li-txt">
        <span class="li-titulo">${r.espacios?.nombre || "Espacio"}</span>
        <span class="li-sub">${r.usuarios?.nombre || r.usuarios?.email || "Usuario"} · ${r.asistentes || 1} pers.</span>
      </span>
      <span class="li-fin col" style="align-items:flex-end;gap:3px">
        <strong class="mono texto-sm">${formatMoneda(r.total || 0)}</strong>
        <span class="chip chip-${raw(r.estado === "confirmada" ? "ok" : r.estado === "cancelada" ? "taken" : "warm")}">${r.estado}</span>
      </span>
    </a>`).join("")}</div>`;
}

function pintarOcupacion(contenedor, metricas, espacios) {
  const caja = contenedor.querySelector("#ad-ocupacion");
  const populares = metricas.populares || [];
  if (!populares.length) {
    caja.innerHTML = vacio({ ico: "📊", titulo: "Aún sin datos", desc: "Las estadísticas aparecen tras las primeras reservas." });
    return;
  }
  const max = Math.max(1, ...populares.map((p) => Number(p.reservas || 0)));
  caja.innerHTML = `<div class="tarjeta tarjeta-pad">${populares.slice(0, 8).map((p) => html`
    <div class="barra-fila">
      <span class="texto-sm crece">${p.nombre}</span>
      <div class="barra" style="flex:2"><span style="width:${Math.round((Number(p.reservas) / max) * 100)}%"></span></div>
      <span class="mono texto-sm" style="min-width:52px;text-align:right">${formatNumero(p.reservas)}</span>
    </div>`).join("")}</div>`;
}
