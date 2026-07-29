// Notificaciones en toda la aplicación: mensajes de chat y llamadas de mis equipos.
// Este archivo se carga en todas las páginas (para usuarios con sesión iniciada).
// El servidor nos une a las salas de nuestros equipos y aquí decidimos cómo avisar:
// - Toast dentro de la página (siempre).
// - Notificación del sistema (si el usuario dio permiso y la pestaña está en segundo plano).

const miId = Number(document.body.dataset.idUsuario);
const socketNotificaciones = io();

socketNotificaciones.on("connect", () => {
  socketNotificaciones.emit("unirse_notificaciones");
});

// El permiso del navegador se pide en el primer clic, no al cargar la página
// (los navegadores bloquean las solicitudes que no vienen de una acción del usuario).
document.addEventListener("click", function pedirPermiso() {
  if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission();
  }
  document.removeEventListener("click", pedirPermiso);
});

// Generador de sonido corto (tipo "pop") sin necesidad de archivos MP3.
let contextoAudioCompartido = null;

function reproducirSonidoNotificacion() {
  const ContextoAudio = window.AudioContext || window.webkitAudioContext;
  if (!ContextoAudio) return;
  try {
    if (!contextoAudioCompartido) {
      contextoAudioCompartido = new ContextoAudio();
    }
    const ctx = contextoAudioCompartido;
    if (ctx.state === "suspended") {
      ctx.resume();
    }
    
    const osc = ctx.createOscillator();
    const ganancia = ctx.createGain();
    
    osc.type = "sine";
    osc.frequency.setValueAtTime(600, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.1);
    
    ganancia.gain.setValueAtTime(0.15, ctx.currentTime);
    ganancia.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
    
    osc.connect(ganancia);
    ganancia.connect(ctx.destination);
    
    osc.start();
    osc.stop(ctx.currentTime + 0.1);
  } catch (e) {
    // Si el navegador bloquea el audio automático, lo ignoramos silenciosamente
  }
}

socketNotificaciones.on("nuevo_mensaje", (datos) => {
  if (datos.id_usuario === miId) return; // mis propios mensajes no se notifican
  
  reproducirSonidoNotificacion();

  const enlaceChat = `/equipos/${datos.id_equipo}/chat`;
  if (window.location.pathname === enlaceChat) return; // ya estoy viendo ese chat

  const resumen = datos.resumen || datos.texto || "Nuevo mensaje";
  notificar(
    `${datos.nombre} · ${datos.nombre_equipo}`,
    resumen.length > 80 ? resumen.slice(0, 80) + "…" : resumen,
    enlaceChat,
  );
});

// Aviso genérico: notas, tareas, comentarios, archivos, diapositivas...
// El servidor manda título, texto y enlace; aquí solo se decide si mostrarlo.
socketNotificaciones.on("notificacion", (datos) => {
  if (datos.id_usuario === miId) return; // lo que hago yo no se me notifica
  reproducirSonidoNotificacion();
  if (window.location.pathname === datos.enlace) return; // ya estoy viendo esa página
  notificar(datos.titulo, datos.texto, datos.enlace);
});

socketNotificaciones.on("llamada_iniciada", (datos) => {
  reproducirSonidoNotificacion();
  notificar(
    `📞 Videollamada en ${datos.nombre_equipo}`,
    `${datos.nombre} inició una llamada. Haz clic para unirte.`,
    `/equipos/${datos.id_equipo}/llamada`,
  );
});

function notificar(titulo, texto, enlace) {
  // Con la pestaña en segundo plano y permiso dado, se usa la notificación del sistema.
  if (document.hidden && "Notification" in window && Notification.permission === "granted") {
    const notificacion = new Notification(titulo, { body: texto });
    notificacion.addEventListener("click", () => {
      window.focus();
      window.location.href = enlace;
    });
    return;
  }
  mostrarToast(titulo, texto, enlace);
}

function mostrarToast(titulo, texto, enlace) {
  const contenedor = document.getElementById("contenedor-toasts");
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.setAttribute("role", "alert");

  const encabezado = document.createElement("div");
  encabezado.className = "toast-header";
  const tituloElemento = document.createElement("strong");
  tituloElemento.className = "me-auto";
  tituloElemento.textContent = titulo;
  const botonCerrar = document.createElement("button");
  botonCerrar.type = "button";
  botonCerrar.className = "btn-close";
  botonCerrar.setAttribute("data-bs-dismiss", "toast");
  encabezado.append(tituloElemento, botonCerrar);

  const cuerpo = document.createElement("a");
  cuerpo.className = "toast-body d-block text-decoration-none text-body";
  cuerpo.href = enlace;
  cuerpo.textContent = texto;

  toast.append(encabezado, cuerpo);
  contenedor.appendChild(toast);
  const toastBootstrap = new bootstrap.Toast(toast, { delay: 6000 });
  toastBootstrap.show();
  toast.addEventListener("hidden.bs.toast", () => toast.remove());
}
