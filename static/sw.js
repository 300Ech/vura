// este archivo actúa como un asistente en segundo plano para permitir el uso
// de la página sin conexión a internet. su propósito es guardar copias de
// seguridad de los botones, estilos e imágenes para que la pantalla abra rápido
// aun cuando falle la red. lo hace almacenando los componentes en la
// memoria del
// navegador. se diseñó así para garantizar la disponibilidad continua del
// sitio.


const NOMBRE_CACHE = "vura-v8";


// Shell útil: estilos, JS, PWA, cola offline y Bootstrap (CDN). No incluye
// socket.io.
const PRECACHE = [
  "/manifest.webmanifest",
  "/static/css/estilos.css",
  "/static/js/aplicacion.js",
  "/static/js/notificaciones.js",
  "/static/js/chat_global.js",
  "/static/iconos/icono-192.png",
  "/static/iconos/icono-512.png",
  "/static/iconos/apple-touch-icon.png",
  "/colaboracion/static/almacen_local.js",
  "https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css",
  "https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js",
  "https://cdn.jsdelivr.net/npm/dexie@4.0.8/+esm",
];

self.addEventListener("install", (evento) => {
  evento.waitUntil(
    caches.open(NOMBRE_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
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
    // Librerías de CDN: caché primero (sus enlace del archivo llevan versión y
    // nunca cambian).
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
