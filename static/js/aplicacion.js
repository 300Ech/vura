// este archivo controla las funciones generales de la plataforma web en el
// navegador. su propósito es detectar si la computadora tiene o no conexión a
// internet, mostrar un aviso de alerta en pantalla si se cae la señal y
// permitir
// instalar la página como una aplicación en el escritorio o teléfono. lo hace
// revisando el estado de red de la computadora. se construyó así para mantener
// orientado al estudiante sobre el estado de su conexión.


// registra el asistente de servicio para funcionamiento cuando se cae la red
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js");
}

const indicadorConexion = document.getElementById("estado-conexion");
const bannerSinConexion = document.getElementById("banner-sin-conexion");
const botonInstalar = document.getElementById("boton-instalar-pwa");


// función que revisa si el alumno tiene internet y actualiza el indicador
// flotante de pantalla.
// sirve para advertir visualmente al estudiante si se fue la señal de red.
function actualizarIndicadorConexion() {
  const enLinea = navigator.onLine;
  document.body.classList.toggle("sin-conexion", !enLinea);
  if (indicadorConexion) {
    if (enLinea) {
      indicadorConexion.textContent = "🟢 En línea";
      indicadorConexion.className = "badge bg-success-subtle text-success-emphasis mb-2 d-block mx-auto";
    } else {
      indicadorConexion.textContent = "🔴 Sin conexión";
      indicadorConexion.className = "badge bg-danger-subtle text-danger-emphasis mb-2 d-block mx-auto";
    }
  }
  if (bannerSinConexion) {
    bannerSinConexion.hidden = enLinea;
  }
}


window.addEventListener("online", actualizarIndicadorConexion);
window.addEventListener("offline", actualizarIndicadorConexion);
actualizarIndicadorConexion();

// ---- Instalar como app (PWA) ----
// Chrome/Edge disparan "beforeinstallprompt". En iPhone no existe ese evento:
// ahí se instala con Compartir → Añadir a pantalla de inicio.

let eventoInstalacion = null;

function yaEstaInstalada() {
  return window.matchMedia("(display-mode: standalone)").matches
    || window.navigator.standalone === true;
}

window.addEventListener("beforeinstallprompt", (evento) => {
  evento.preventDefault();
  eventoInstalacion = evento;
  if (botonInstalar && !yaEstaInstalada()) botonInstalar.hidden = false;
});

window.addEventListener("appinstalled", () => {
  eventoInstalacion = null;
  if (botonInstalar) botonInstalar.hidden = true;
});

if (botonInstalar) {
  if (yaEstaInstalada()) botonInstalar.hidden = true;

  botonInstalar.addEventListener("click", async () => {
    if (eventoInstalacion) {
      eventoInstalacion.prompt();
      await eventoInstalacion.userChoice;
      eventoInstalacion = null;
      botonInstalar.hidden = true;
      return;
    }
    // iPhone / navegadores sin prompt automático.
    const esIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    if (esIos) {
      alert("En iPhone: tocá Compartir y después «Añadir a pantalla de inicio».");
    } else {
      alert("Abrí el menú del navegador y elegí «Instalar aplicación» o «Añadir a la pantalla de inicio».");
    }
  });

  // En iOS mostramos el botón siempre (con instrucciones), porque no hay
  // beforeinstallprompt.
  if (/iphone|ipad|ipod/i.test(navigator.userAgent) && !yaEstaInstalada()) {
    botonInstalar.hidden = false;
  }
}
