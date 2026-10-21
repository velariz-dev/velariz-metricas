/* =====================================================================
   medir_metricas.mjs — mide los 4 sitios de ejemplo de VelarizDev con
   PageSpeed Insights (Lighthouse en los servidores de Google) y guarda
   los resultados en metricas.json.

   QUÉ HACE, EN ORDEN
   1. Para cada sitio de la lista hace varias mediciones (simulación de celular).
   2. Se queda con la MEDIANA (así un mal momento de la red no arruina el número).
   3. Escribe metricas.json, que la web de velariz.dev lee al cargar la página
      "Ejemplos" para mostrar los puntajes con su fecha.
   4. Si un sitio falla (caído, sin cuota…) conserva su medición anterior en vez de
      borrarla o inventar un número. Si TODOS fallan, termina con error y no toca nada.

   DÓNDE CORRE
   Lo ejecuta el flujo .github/workflows/medir.yml cada lunes en los servidores de
   GitHub. La clave de Google llega por la variable PAGESPEED_API_KEY, que sale de los
   "secretos" del repositorio: nunca se escribe en ningún archivo ni se imprime.

   PARA PROBARLO A MANO (en tu PC)
      PAGESPEED_API_KEY=tu_clave node medir_metricas.mjs
      CORRIDAS=1 acelera la prueba (1 medición por sitio en vez de 3).
   ===================================================================== */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = dirname(fileURLToPath(import.meta.url));
const DESTINO = resolve(AQUI, "metricas.json");
const CLAVE = (process.env.PAGESPEED_API_KEY || "").trim();
const CORRIDAS = Math.max(1, Number(process.env.CORRIDAS || 3));

if (!CLAVE) {
  console.error("Falta la variable PAGESPEED_API_KEY (en GitHub: Settings → Secrets and variables → Actions).");
  process.exit(1);
}

// Las claves coinciden con los data-metricas="..." de ejemplos.html
const SITIOS = {
  tatuador:  "https://husseink.netlify.app/",
  panaderia: "https://elchocolate.netlify.app/",
  libreria:  "https://libreriaz.netlify.app/",
  artista:   "https://artistaz.netlify.app/",
};

const mediana = (nums) => {
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// Convierte el resultado de Lighthouse en los datos que usa la web
function extraer(lhr) {
  const cat = (k) => Math.round((lhr.categories[k]?.score ?? 0) * 100);
  return {
    version: lhr.lighthouseVersion,
    rendimiento: cat("performance"),
    accesibilidad: cat("accessibility"),
    buenasPracticas: cat("best-practices"),
    seo: cat("seo"),
    pesoKB: Math.round((lhr.audits["total-byte-weight"]?.numericValue ?? 0) / 1024),
    lcpSeg: Math.round((lhr.audits["largest-contentful-paint"]?.numericValue ?? 0) / 100) / 10,
  };
}

// Una medición en PageSpeed Insights. Un reintento si la API responde con límite de
// uso (429) o con un error temporal (5xx).
async function medir(url) {
  const q = new URLSearchParams({ url, strategy: "mobile", key: CLAVE });
  for (const c of ["performance", "accessibility", "best-practices", "seo"]) q.append("category", c);
  const endpoint = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${q}`;
  for (let intento = 1; intento <= 2; intento++) {
    try {
      const r = await fetch(endpoint, { signal: AbortSignal.timeout(180000) });
      const data = await r.json();
      if (r.ok && data.lighthouseResult) return extraer(data.lighthouseResult);
      const msg = data.error?.message || `HTTP ${r.status}`;
      console.warn(`  intento ${intento} fallido: ${msg.slice(0, 160)}`);
      if (r.status !== 429 && r.status < 500) return null; // clave inválida, etc.: reintentar no sirve
    } catch (e) {
      console.warn(`  intento ${intento} fallido: ${e.message}`);
    }
    await new Promise((ok) => setTimeout(ok, 8000));
  }
  return null;
}

// Lee la medición anterior (si existe) para conservarla cuando un sitio falle
function leerAnterior() {
  if (!existsSync(DESTINO)) return {};
  try {
    return JSON.parse(readFileSync(DESTINO, "utf8")).sitios || {};
  } catch {
    return {};
  }
}

const hoy = new Date();
const fecha = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-${String(hoy.getDate()).padStart(2, "0")}`;
const anterior = leerAnterior();
const sitios = {};
let version = "";
let exitosos = 0;

for (const [clave, url] of Object.entries(SITIOS)) {
  console.log(`\n[${clave}] ${url} — ${CORRIDAS} medición(es)`);
  const ok = [];
  for (let i = 1; i <= CORRIDAS; i++) {
    const r = await medir(url);
    if (r) { ok.push(r); version = r.version; console.log(`  ${i}/${CORRIDAS} rendimiento ${r.rendimiento}`); }
  }
  if (ok.length) {
    const campo = (k) => mediana(ok.map((x) => x[k]));
    sitios[clave] = {
      rendimiento: campo("rendimiento"),
      accesibilidad: campo("accesibilidad"),
      buenasPracticas: campo("buenasPracticas"),
      seo: campo("seo"),
      pesoKB: campo("pesoKB"),
      lcpSeg: campo("lcpSeg"),
      medido: fecha,
      corridas: ok.length,
      fuente: "pagespeed",
    };
    exitosos++;
  } else if (anterior[clave]) {
    console.warn(`  [${clave}] sin datos nuevos: se conserva la medición anterior (${anterior[clave].medido})`);
    sitios[clave] = anterior[clave];
  }
}

if (exitosos === 0) {
  console.error("\nNingún sitio pudo medirse; no se modifica metricas.json");
  process.exit(1);
}

const salida = {
  actualizado: fecha,
  herramienta: `Lighthouse ${version || "?"} · simulación de celular · servidores de Google (PageSpeed Insights)`,
  sitios,
};
writeFileSync(DESTINO, JSON.stringify(salida, null, 2) + "\n", "utf8");
console.log(`\nListo: ${exitosos}/${Object.keys(SITIOS).length} sitios medidos -> metricas.json`);
