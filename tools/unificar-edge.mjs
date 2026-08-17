/* Genera la versión de un solo archivo de `pagos-stripe`, para pegar en
   el Dashboard de Supabase cuando no hay CLI.

     node tools/unificar-edge.mjs

   Se genera a partir de los archivos de verdad, así que no puede quedar
   desfasada respecto a `index.ts` y `_compartido/utiles.ts`: si alguien
   cambia uno, se vuelve a correr esto y ya está. Escribirla a mano sería
   garantizar que tarde o temprano digan cosas distintas.
*/
import { readFileSync, writeFileSync } from "node:fs";

const RAIZ = new URL("../", import.meta.url).pathname;
const leer = (p) => readFileSync(RAIZ + p, "utf8");

const utiles = leer("supabase/functions/_compartido/utiles.ts");
const indice = leer("supabase/functions/pagos-stripe/index.ts");

/* --- 1. De `utiles.ts`: quitar su import y el `export` de cada símbolo.
       Al quedar todo en el mismo archivo, `export` sobra y Deno se queja
       de exportar desde un módulo que además hace `Deno.serve`. */
const cuerpoUtiles = utiles
  .replace(/^import\s+\{[^}]*\}\s+from\s+"https:\/\/esm\.sh\/@supabase[^"]*";\s*$/m, "")
  .replace(/^\/\*[\s\S]*?\*\/\s*/, "")            // su cabecera larga
  .replace(/^export\s+(const|function|async function)\s/gm, "$1 ")
  .trim();

/* --- 2. De `index.ts`: quitar el import de `_compartido` y su cabecera. */
const cuerpoIndice = indice
  .replace(/^import\s+\{[^}]*\}\s+from\s+"\.\.\/_compartido\/utiles\.ts";\s*$/m, "")
  .replace(/^\/\*[\s\S]*?\*\/\s*/, "")
  .replace(/^import Stripe from [^\n]*\n/m, "")   // se reubica arriba
  .trim();

const CABECERA = `/* ======================================================================
   pagos-stripe — VERSIÓN DE UN SOLO ARCHIVO (Dashboard de Supabase)

   GENERADO. No se edita a mano.
     Fuente:  supabase/functions/pagos-stripe/index.ts
              supabase/functions/_compartido/utiles.ts
     Rehacer: node tools/unificar-edge.mjs

   CÓMO SE USA
     1. Supabase → Edge Functions → pagos-stripe → Code
     2. Se borra todo lo que haya y se pega este archivo entero.
     3. Deploy.

   AJUSTES DE LA FUNCIÓN
     Verify JWT debe estar DESACTIVADO. Si no, Stripe no puede entregar
     el webhook: llega sin sesión de Supabase y recibiría un 401 antes de
     que el código llegue a comprobar la firma. La autenticación de las
     llamadas del navegador la hace \`requiereUsuario()\`, y la del webhook
     la firma \`stripe-signature\`.

   SECRETOS  (Edge Functions → Secrets)
     STRIPE_SECRET_KEY      sk_test_… o sk_live_…
     STRIPE_WEBHOOK_SECRET  whsec_…
     Los otros tres (SUPABASE_URL, SUPABASE_ANON_KEY,
     SUPABASE_SERVICE_ROLE_KEY) ya los pone Supabase.

     Ninguna de estas llaves va nunca en el navegador, ni en el ZIP, ni
     en el repositorio. Sólo aquí.

   WEBHOOK EN STRIPE
     https://<proyecto>.supabase.co/functions/v1/pagos-stripe/webhook
     Eventos: payment_intent.succeeded · payment_intent.payment_failed
              charge.refunded

   SÓLO TARJETA
     El PaymentIntent fija \`payment_method_types: ["card"]\`. No se usa
     \`automatic_payment_methods\`, porque con eso quien decide qué se
     ofrece es el panel de Stripe y podían aparecer carteras que esta
     entrega no lleva configuradas.
   ====================================================================== */
import Stripe from "https://esm.sh/stripe@16.9.0?target=deno";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

/* ══════════════════════════════════════════════════════════════════════
   PARTE 1 · utilidades compartidas
   (de supabase/functions/_compartido/utiles.ts)
   ══════════════════════════════════════════════════════════════════════ */

`;

const SEPARADOR = `

/* ══════════════════════════════════════════════════════════════════════
   PARTE 2 · la función
   (de supabase/functions/pagos-stripe/index.ts)
   ══════════════════════════════════════════════════════════════════════ */

`;

const salida = CABECERA + cuerpoUtiles + SEPARADOR + cuerpoIndice + "\n";

const destino = "supabase/functions/pagos-stripe/DASHBOARD-un-solo-archivo.ts";
writeFileSync(RAIZ + destino, salida);

/* --- 3. Comprobaciones: que no se haya colado nada roto.
       Se miran sobre el código SIN comentarios: varios comentarios
       nombran a propósito lo que ya no se usa («no se usa
       automatic_payment_methods, porque…») y no son un fallo. */
const soloCodigo = salida
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

const fallos = [];
if (/from "\.\.\/_compartido/.test(soloCodigo)) fallos.push("queda un import de _compartido");
if (/^export /m.test(soloCodigo)) fallos.push("queda algún export (sobra en un archivo suelto)");
if ((soloCodigo.match(/import Stripe from/g) || []).length !== 1) fallos.push("el import de Stripe no está exactamente una vez");
if ((soloCodigo.match(/createClient/g) || []).length < 2) fallos.push("falta createClient");
if (!/payment_method_types: \["card"\]/.test(soloCodigo)) fallos.push("no fija payment_method_types card");
if (/automatic_payment_methods/.test(soloCodigo)) fallos.push("todavía usa automatic_payment_methods");
if (/sk_(test|live)_[A-Za-z0-9]{10}/.test(salida)) fallos.push("¡lleva una llave secreta dentro!");
for (const s of ["preflight", "respuesta", "requiereUsuario", "reservaDelUsuario",
                 "reservaParaReembolso", "confirmarPago", "centavos", "clienteServicio",
                 "clienteUsuario"]) {
  if (!new RegExp(`(const|function|async function) ${s}\\b`).test(soloCodigo)) fallos.push(`falta ${s}()`);
}

console.log(`${destino}  ·  ${salida.split("\n").length} líneas`);
if (fallos.length) {
  console.log("✗ " + fallos.join("\n✗ "));
  process.exit(1);
}
console.log("✓ un solo archivo, sin imports relativos, sin secretos, sólo tarjeta");
