#!/usr/bin/env node
/* ======================================================================
   tools/csp.mjs — Recalcula los hashes sha256 de los scripts en línea
   y los escribe en la meta Content-Security-Policy de cada HTML.

   La CSP de la app va SIN 'unsafe-inline' en script-src: los scripts
   incrustados (el arranque del tema, el importmap y el script de
   offline.html) se autorizan uno a uno por hash. Cada vez que se toque
   uno de esos bloques hay que volver a correr:

       node tools/csp.mjs

   Con --check no escribe nada y devuelve código 1 si algún hash está
   desfasado: sirve para un hook de pre-commit o para CI.
   ====================================================================== */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const soloComprobar = process.argv.includes("--check");

/* Scripts en línea = los que no tienen src=. Se ignoran los módulos
   externos (<script type="module" src="...">), que van por 'self'. */
const RE_SCRIPT = /<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/gi;

const sha256 = (texto) => "sha256-" + createHash("sha256").update(texto, "utf8").digest("base64");

function procesar(archivo) {
  const ruta = join(RAIZ, archivo);
  const original = readFileSync(ruta, "utf8");

  // 1. Hashes de los scripts en línea, en orden de aparición.
  const hashes = [...original.matchAll(RE_SCRIPT)].map((m) => sha256(m[2]));
  if (!hashes.length) return { archivo, cambios: false, hashes };

  // 2. La directiva script-src de la meta CSP.
  const meta = original.match(/<meta http-equiv="Content-Security-Policy" content="([\s\S]*?)">/i);
  if (!meta) throw new Error(`${archivo}: no encontré la meta Content-Security-Policy`);

  const directiva = meta[1].match(/(^|;)(\s*script-src\s)([^;]*)/i);
  if (!directiva) throw new Error(`${archivo}: la CSP no declara script-src`);

  // 3. Se sustituyen TODOS los 'sha256-…' (o los marcadores de plantilla)
  //    por la lista recién calculada, respetando el resto de orígenes.
  const valorViejo = directiva[3];
  const resto = valorViejo
    .split(/\s+/)
    .filter((x) => x && !/^'sha(256|384|512)-/.test(x))
    .filter((x) => x !== "'unsafe-inline'");

  const propio = resto.indexOf("'self'");
  const nuevos = hashes.map((h) => `'${h}'`);
  if (propio >= 0) resto.splice(propio + 1, 0, ...nuevos);
  else resto.unshift(...nuevos);

  const valorNuevo = resto.join(" ");
  if (valorNuevo === valorViejo.trim().replace(/\s+/g, " ")) {
    return { archivo, cambios: false, hashes };
  }

  const metaNueva = meta[0].replace(valorViejo, valorNuevo);
  const salida = original.replace(meta[0], metaNueva);

  if (!soloComprobar) writeFileSync(ruta, salida);
  return { archivo, cambios: true, hashes };
}

let desfasados = 0;
for (const archivo of ["index.html", "offline.html"]) {
  const r = procesar(archivo);
  if (r.cambios) desfasados++;
  const estado = r.cambios ? (soloComprobar ? "DESFASADO" : "actualizado") : "al día";
  console.log(`${archivo.padEnd(14)} ${String(r.hashes.length).padStart(2)} script(s) en línea — ${estado}`);
  r.hashes.forEach((h) => console.log(`   '${h}'`));
}

if (soloComprobar && desfasados) {
  console.error(`\n✗ ${desfasados} archivo(s) con hashes desfasados. Corre: node tools/csp.mjs`);
  process.exit(1);
}
console.log(soloComprobar ? "\n✓ hashes al día" : "\n✓ listo");
