// Registro del Service Worker e indicador de conexión de toda la aplicación.
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js");
}

const indicadorConexion = document.getElementById("estado-conexion");

function actualizarIndicadorConexion() {
  if (!indicadorConexion) return;
  if (navigator.onLine) {
    indicadorConexion.textContent = "🟢 En línea";
    indicadorConexion.className = "badge bg-success-subtle text-success-emphasis";
  } else {
    indicadorConexion.textContent = "🔴 Sin conexión";
    indicadorConexion.className = "badge bg-danger-subtle text-danger-emphasis";
  }
}

window.addEventListener("online", actualizarIndicadorConexion);
window.addEventListener("offline", actualizarIndicadorConexion);
actualizarIndicadorConexion();
