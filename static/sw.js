// Service Worker de Vura: permite abrir la aplicación sin conexión.
// Librerías de CDN (versionadas, nunca cambian): caché primero.
// Todo lo propio (páginas y archivos de la app): red primero, caché de respaldo.
const NOMBRE_CACHE = "vura-v2";

self.addEventListener("install", (evento) => {
  evento.waitUntil(
    caches.open(NOMBRE_CACHE)
      .then((cache) => cache.addAll(["/static/css/estilos.css", "/static/js/aplicacion.js"]))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches.keys()
      .then((nombres) => Promise.all(
        nombres.filter((nombre) => nombre !== NOMBRE_CACHE).map((nombre) => caches.delete(nombre))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (evento) => {
  const peticion = evento.request;
  if (peticion.method !== "GET") return;

  const url = new URL(peticion.url);
  if (url.pathname.startsWith("/socket.io")) return; // el tiempo real nunca se cachea

  const esCdn = url.hostname === "cdn.jsdelivr.net";
  if (url.origin !== location.origin && !esCdn) return;

  if (esCdn) {
    // Librerías de CDN: caché primero (sus URL llevan versión y nunca cambian).
    evento.respondWith(
      caches.open(NOMBRE_CACHE).then(async (cache) => {
        const guardada = await cache.match(peticion);
        if (guardada) return guardada;
        const respuesta = await fetch(peticion);
        if (respuesta.ok) cache.put(peticion, respuesta.clone());
        return respuesta;
      })
    );
    return;
  }

  // Todo lo propio (páginas y archivos de la app): red primero;
  // si no hay conexión, la última copia guardada.
  evento.respondWith(
    fetch(peticion)
      .then((respuesta) => {
        if (respuesta.ok) {
          const copia = respuesta.clone();
          caches.open(NOMBRE_CACHE).then((cache) => cache.put(peticion, copia));
        }
        return respuesta;
      })
      .catch(async () => {
        const guardada = await caches.match(peticion);
        return guardada || new Response(
          "Sin conexión: esta página aún no se ha guardado en este navegador.",
          { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } }
        );
      })
  );
});
