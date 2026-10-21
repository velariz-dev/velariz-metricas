# velariz-metricas

Puntajes de Lighthouse de los sitios de ejemplo de [velariz.dev](https://velariz.dev), medidos cada lunes con PageSpeed Insights y guardados en `metricas.json`. La página "Ejemplos" de la web lee ese archivo.

- `medir_metricas.mjs` — hace las mediciones y escribe `metricas.json`.
- `.github/workflows/medir.yml` — lo ejecuta cada lunes y guarda el resultado.
- La clave de la API vive en *Settings → Secrets and variables → Actions* (`PAGESPEED_API_KEY`); no está en ningún archivo.
