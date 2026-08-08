// este archivo administra la ventana desplegable de chat flotante sobre la
// pizarra
// y las diapositivas. su propósito es permitir que los integrantes del
// grupo conversen
// y compartan notas mientras trabajan en el lienzo gráfico sin tener que
// cambiarse de
// pantalla. lo hace conectando la ventana lateral con el sistema de
// mensajería en vivo.
// se creó así para que los alumnos no pierdan la comunicación mientras editan.


if (document.getElementById("panel-chat")) {


const panelChat = document.getElementById("panel-chat");
const idEquipo = Number(panelChat.dataset.idEquipo);
const idUsuarioActual = Number(panelChat.dataset.idUsuario);
const mensajesPanel = document.getElementById("mensajes-panel");
const avisoEscribiendoPanel = document.getElementById("aviso-escribiendo-panel");
const textoChatPanel = document.getElementById("texto-chat-panel");
const badgeChat = document.getElementById("badge-chat-pizarra");
const datosMensajesPanel = new Map();
const emojisReaccionPanel = ["👍", "❤️", "😂", "🎉", "👀"];

window.socketChat = io();
let historialCargado = false;

// Misma cola IndexedDB (Dexie) que el chat completo.
let almacenPanel = null;
async function obtenerAlmacenPanel() {
  if (!almacenPanel) {
    almacenPanel = await import("/colaboracion/static/almacen_local.js");
  }
  return almacenPanel;
}

function horaAhoraPanel() {
  const d = new Date();
  return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
}

function quitarPendientePanel(idLocal) {
  const clave = "pendiente-" + idLocal;
  datosMensajesPanel.delete(clave);
  document.getElementById("mensaje-panel-" + clave)?.remove();
}

async function encolarMensajePanel(texto) {
  const almacen = await obtenerAlmacenPanel();
  const idLocal = await almacen.guardarMensajePendiente({
    id_equipo: idEquipo,
    texto: texto,
  });
  agregarMensajePanel({
    id: "pendiente-" + idLocal,
    id_usuario: idUsuarioActual,
    nombre: "Tú",
    texto: texto,
    hora: horaAhoraPanel(),
    pendiente: true,
    reacciones: { totales: {}, mias: [] },
  });
}

// Evita que "connect" y "online" manden la misma cola a la vez.
let enviandoColaPanel = false;

function emitirMensajePanelConAck(texto) {
  return new Promise((resolver) => {
    let listo = false;
    const terminar = (ok) => {
      if (listo) return;
      listo = true;
      resolver(ok);
    };
    const temporizador = setTimeout(() => terminar(false), 8000);
    socketChat.emit("enviar_mensaje", { id_equipo: idEquipo, texto: texto }, (respuesta) => {
      clearTimeout(temporizador);
      terminar(Boolean(respuesta && respuesta.ok));
    });
  });
}

async function enviarColaPanel() {
  if (enviandoColaPanel || !navigator.onLine || !socketChat.connected) return;
  enviandoColaPanel = true;
  try {
    const almacen = await obtenerAlmacenPanel();
    const pendientes = await almacen.listarMensajesPendientes(idEquipo);
    for (const pendiente of pendientes) {
      const ok = await emitirMensajePanelConAck(pendiente.texto);
      if (!ok) break;
      await almacen.borrarMensajePendiente(pendiente.id);
      quitarPendientePanel(pendiente.id);
    }
  } finally {
    enviandoColaPanel = false;
  }
}

async function mostrarPendientesPanel() {
  const almacen = await obtenerAlmacenPanel();
  const pendientes = await almacen.listarMensajesPendientes(idEquipo);
  for (const pendiente of pendientes) {
    if (datosMensajesPanel.has("pendiente-" + pendiente.id)) continue;
    agregarMensajePanel({
      id: "pendiente-" + pendiente.id,
      id_usuario: idUsuarioActual,
      nombre: "Tú",
      texto: pendiente.texto,
      hora: horaAhoraPanel(),
      pendiente: true,
      reacciones: { totales: {}, mias: [] },
    });
  }
}

socketChat.on("connect", () => {
  socketChat.emit("unirse_sala", { id_equipo: idEquipo });
  enviarColaPanel();
});

window.addEventListener("online", () => enviarColaPanel());

document.getElementById("boton-panel-chat").addEventListener("click", async () => {
  badgeChat.classList.remove("visible");
  panelChat.classList.toggle("abierto");
  if (!panelChat.classList.contains("abierto")) return;
  if (!historialCargado) {
    try {
      const respuesta = await fetch(`/equipos/${idEquipo}/chat/mensajes`);
      const datos = await respuesta.json();
      datos.mensajes.forEach(agregarMensajePanel);
      historialCargado = true;
    } catch (error) {
      // Sin red: solo se muestran los pendientes locales.
      // No marcamos historialCargado para reintentar al volver la red.
    }
    await mostrarPendientesPanel();
  }
  textoChatPanel.focus();
});

document.getElementById("boton-cerrar-chat").addEventListener("click", () => {
  panelChat.classList.remove("abierto");
});

socketChat.on("nuevo_mensaje", (mensaje) => {
  avisoEscribiendoPanel.textContent = "";
  // Si el panel está abierto, mostrar aunque el historial del equipo emisor
  // de la página aún no cargó
  // (p. ej. se abrió sin red y después volvió la conexión).
  const mostrar = historialCargado || panelChat.classList.contains("abierto");
  if (mostrar && !datosMensajesPanel.has(mensaje.id)) agregarMensajePanel(mensaje);

  if (!panelChat.classList.contains("abierto") && mensaje.id_usuario !== idUsuarioActual) {
    badgeChat.classList.add("visible");
  }
});

socketChat.on("reacciones_mensaje", (datos) => {
  const mensaje = datosMensajesPanel.get(datos.id_mensaje);
  if (!mensaje) return;
  mensaje.reacciones.totales = datos.totales;
  if (datos.id_usuario === idUsuarioActual) {
    const mias = new Set(mensaje.reacciones.mias);
    if (datos.activo) mias.add(datos.emoji);
    else mias.delete(datos.emoji);
    mensaje.reacciones.mias = [...mias];
  }
  dibujarReaccionesPanel(mensaje);
});

socketChat.on("usuario_escribiendo", (datos) => {
  avisoEscribiendoPanel.textContent = datos.nombre + " está escribiendo...";
  setTimeout(() => { avisoEscribiendoPanel.textContent = ""; }, 3000);
});

// El campo crece con el texto (hasta el máximo que marca el CSS).
function ajustarAltoCampoPanel() {
  textoChatPanel.style.height = "auto";
  textoChatPanel.style.height = textoChatPanel.scrollHeight + "px";
}

let ultimoAvisoEscribiendo = 0;
textoChatPanel.addEventListener("input", () => {
  ajustarAltoCampoPanel();
  const ahora = Date.now();
  if (ahora - ultimoAvisoEscribiendo > 2000) {
    ultimoAvisoEscribiendo = ahora;
    socketChat.emit("escribiendo", { id_equipo: idEquipo });
  }
});

const formularioChatPanel = document.getElementById("formulario-chat-panel");

// Enter envía; Shift+Enter hace un salto de línea.
textoChatPanel.addEventListener("keydown", (evento) => {
  if (evento.key === "Enter" && !evento.shiftKey) {
    evento.preventDefault();
    formularioChatPanel.requestSubmit();
  }
});

formularioChatPanel.addEventListener("submit", async (evento) => {
  evento.preventDefault();
  const texto = textoChatPanel.value.trim();
  if (!texto) return;
  if (!navigator.onLine || !socketChat.connected) {
    try {
      await encolarMensajePanel(texto);
    } catch (error) {
      return; // si IndexedDB falla, el texto se queda en el campo
    }
    textoChatPanel.value = "";
    ajustarAltoCampoPanel();
    textoChatPanel.focus();
    return;
  }
  textoChatPanel.value = "";
  ajustarAltoCampoPanel();
  textoChatPanel.focus();
  socketChat.emit("enviar_mensaje", { id_equipo: idEquipo, texto: texto });
});

// Emojis del panel.
const emojisPanel = document.getElementById("emojis-chat-panel");
document.getElementById("boton-emojis-panel").addEventListener("click", () => {
  emojisPanel.classList.toggle("abierto");
});
document.querySelectorAll(".emoji-panel").forEach((boton) => {
  boton.addEventListener("click", () => {
    textoChatPanel.value += boton.textContent;
    ajustarAltoCampoPanel();
    textoChatPanel.focus();
  });
});

async function subirAdjuntoPanel(archivo, tipo) {
  const formulario = new FormData();
  formulario.append("archivo", archivo);
  formulario.append("tipo", tipo);
  const respuesta = await fetch(`/equipos/${idEquipo}/chat/adjuntos`, {
    method: "POST",
    body: formulario,
  });
  const datos = await respuesta.json();
  if (!respuesta.ok) throw new Error(datos.error || "No se pudo enviar el archivo.");
}

document.getElementById("boton-imagen-panel").addEventListener("click", () => {
  document.getElementById("entrada-imagen-panel").click();
});
document.getElementById("entrada-imagen-panel").addEventListener("change", async (evento) => {
  const archivo = evento.target.files[0];
  evento.target.value = "";
  if (!archivo) return;
  try {
    await subirAdjuntoPanel(archivo, "imagen");
  } catch (error) {
    alert(error.message);
  }
});

// Voz-it del panel.
const botonVozPanel = document.getElementById("boton-voz-panel");
let grabadoraPanel = null;
let flujoPanel = null;
let trozosPanel = [];
let limitePanel = null;

botonVozPanel.addEventListener("click", async () => {
  if (grabadoraPanel) {
    grabadoraPanel.stop();
    return;
  }
  try {
    flujoPanel = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mime = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm"
      : (MediaRecorder.isTypeSupported("audio/mp4") ? "audio/mp4" : "");
    grabadoraPanel = mime ? new MediaRecorder(flujoPanel, { mimeType: mime }) : new MediaRecorder(flujoPanel);
    trozosPanel = [];
    grabadoraPanel.addEventListener("dataavailable", (evento) => {
      if (evento.data.size) trozosPanel.push(evento.data);
    });
    grabadoraPanel.addEventListener("stop", async () => {
      flujoPanel.getTracks().forEach((pista) => pista.stop());
      clearTimeout(limitePanel);
      const mimeFinal = grabadoraPanel.mimeType || mime || "audio/webm";
      const extension = mimeFinal.includes("mp4") ? "m4a" : "webm";
      const blob = new Blob(trozosPanel, { type: mimeFinal });
      grabadoraPanel = null;
      botonVozPanel.classList.remove("btn-danger");
      botonVozPanel.classList.add("btn-outline-secondary");
      botonVozPanel.textContent = "🎙️";
      if (!blob.size) return;
      try {
        await subirAdjuntoPanel(
          new File([blob], `voz-it-${Date.now()}.${extension}`, { type: mimeFinal }),
          "audio",
        );
      } catch (error) {
        alert(error.message);
      }
    });
    grabadoraPanel.start();
    botonVozPanel.classList.remove("btn-outline-secondary");
    botonVozPanel.classList.add("btn-danger");
    botonVozPanel.textContent = "⏹";
    limitePanel = setTimeout(() => {
      if (grabadoraPanel) grabadoraPanel.stop();
    }, 120000);
  } catch (error) {
    alert("No se pudo usar el micrófono.");
  }
});

function agregarMensajePanel(mensaje) {
  mensaje.reacciones ||= { totales: {}, mias: [] };
  datosMensajesPanel.set(mensaje.id, mensaje);
  const esMio = mensaje.id_usuario === idUsuarioActual;
  const burbuja = document.createElement("div");
  burbuja.id = "mensaje-panel-" + mensaje.id;
  burbuja.className = "burbuja-panel small" + (esMio ? " mia" : "") + (mensaje.pendiente ? " pendiente" : "");

  const encabezado = document.createElement("div");
  encabezado.className = "small " + (esMio ? "text-white-50" : "text-muted");
  encabezado.textContent = (esMio ? "Tú" : mensaje.nombre) + " · " + mensaje.hora;
  burbuja.appendChild(encabezado);

  if (mensaje.texto) {
    const cuerpo = document.createElement("div");
    cuerpo.className = "texto-panel";
    cuerpo.textContent = mensaje.texto;
    burbuja.appendChild(cuerpo);
  }
  if (mensaje.adjunto?.tipo === "imagen") {
    const imagen = document.createElement("img");
    imagen.className = "imagen-chat-panel mt-1";
    imagen.src = mensaje.adjunto.url;
    imagen.alt = mensaje.adjunto.nombre;
    imagen.addEventListener("click", () => window.open(imagen.src, "_blank"));
    burbuja.appendChild(imagen);
  } else if (mensaje.adjunto?.tipo === "audio") {
    const audio = document.createElement("audio");
    audio.controls = true;
    audio.preload = "metadata";
    audio.src = mensaje.adjunto.url;
    audio.style.maxWidth = "240px";
    burbuja.appendChild(audio);
  }

  if (mensaje.pendiente) {
    const etiqueta = document.createElement("div");
    etiqueta.className = "etiqueta-pendiente";
    etiqueta.textContent = "⏳ pendiente";
    burbuja.appendChild(etiqueta);
  }

  const reacciones = document.createElement("div");
  reacciones.id = "reacciones-panel-" + mensaje.id;
  reacciones.className = "reacciones-panel";
  burbuja.appendChild(reacciones);

  if (!mensaje.pendiente) {
    const filaAcciones = document.createElement("div");
    filaAcciones.className = "acciones-reaccion-panel";

    const botonAgregar = document.createElement("button");
    botonAgregar.type = "button";
    botonAgregar.className = "boton-agregar-reaccion";
    botonAgregar.title = "Agregar reacción";
    botonAgregar.textContent = "😊+";

    const menu = document.createElement("div");
    menu.className = "menu-reacciones-panel";
    emojisReaccionPanel.forEach((emoji) => {
      const boton = document.createElement("button");
      boton.type = "button";
      boton.textContent = emoji;
      boton.title = "Reaccionar con " + emoji;
      boton.addEventListener("click", (evento) => {
        evento.stopPropagation();
        socketChat.emit("reaccionar_mensaje", {
          id_equipo: idEquipo, id_mensaje: mensaje.id, emoji: emoji,
        });
        menu.classList.remove("abierto");
      });
      menu.appendChild(boton);
    });

    botonAgregar.addEventListener("click", (evento) => {
      evento.stopPropagation();
      document.querySelectorAll(".menu-reacciones-panel.abierto").forEach((otro) => {
        if (otro !== menu) otro.classList.remove("abierto");
      });
      menu.classList.toggle("abierto");
    });

    filaAcciones.appendChild(botonAgregar);
    filaAcciones.appendChild(menu);
    burbuja.appendChild(filaAcciones);
  }

  mensajesPanel.appendChild(burbuja);
  dibujarReaccionesPanel(mensaje);
  mensajesPanel.scrollTop = mensajesPanel.scrollHeight;
}

function dibujarReaccionesPanel(mensaje) {
  const contenedor = document.getElementById("reacciones-panel-" + mensaje.id);
  if (!contenedor) return;
  contenedor.innerHTML = "";
  const mias = new Set(mensaje.reacciones.mias || []);
  Object.entries(mensaje.reacciones.totales || {}).forEach(([emoji, cantidad]) => {
    if (!cantidad) return;
    const boton = document.createElement("button");
    boton.type = "button";
    boton.className = "reaccion-panel" + (mias.has(emoji) ? " mia" : "");
    boton.textContent = `${emoji} ${cantidad}`;
    boton.addEventListener("click", () => {
      socketChat.emit("reaccionar_mensaje", {
        id_equipo: idEquipo, id_mensaje: mensaje.id, emoji: emoji,
      });
    });
    contenedor.appendChild(boton);
  });
}

document.addEventListener("click", () => {
  document.querySelectorAll(".menu-reacciones-panel.abierto").forEach((menu) => {
    menu.classList.remove("abierto");
  });
});

}

