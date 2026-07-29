// Chat en tiempo real: texto, emojis, imágenes, Voz-it y reacciones.
const contenedorChat = document.getElementById("chat");
const idEquipo = Number(contenedorChat.dataset.idEquipo);
const idUsuarioActual = Number(contenedorChat.dataset.idUsuario);
const mensajes = new Map();
const EMOJIS_REACCION = ["👍", "❤️", "😂", "🎉", "👀"];

const listaMensajes = document.getElementById("lista-mensajes");
const formularioMensaje = document.getElementById("formulario-mensaje");
const campoTexto = document.getElementById("campo-texto");
const avisoEscribiendo = document.getElementById("aviso-escribiendo");
const botonVoz = document.getElementById("boton-voz-chat");
const socket = io();

socket.on("connect", () => {
  socket.emit("unirse_sala", { id_equipo: idEquipo });
});

JSON.parse(document.getElementById("datos-mensajes").textContent).forEach(agregarMensaje);

socket.on("nuevo_mensaje", (mensaje) => {
  avisoEscribiendo.textContent = "";
  if (!mensajes.has(mensaje.id)) agregarMensaje(mensaje);
});

socket.on("reacciones_mensaje", (datos) => {
  const mensaje = mensajes.get(datos.id_mensaje);
  if (!mensaje) return;
  mensaje.reacciones.totales = datos.totales;
  if (datos.id_usuario === idUsuarioActual) {
    const mias = new Set(mensaje.reacciones.mias);
    if (datos.activo) mias.add(datos.emoji);
    else mias.delete(datos.emoji);
    mensaje.reacciones.mias = [...mias];
  }
  dibujarReacciones(mensaje);
});

// ---- Escritura y envío ----

let ultimoAvisoEnviado = 0;
let temporizadorAviso = null;

campoTexto.addEventListener("input", () => {
  const ahora = Date.now();
  if (ahora - ultimoAvisoEnviado > 2000) {
    ultimoAvisoEnviado = ahora;
    socket.emit("escribiendo", { id_equipo: idEquipo });
  }
});

socket.on("usuario_escribiendo", (datos) => {
  avisoEscribiendo.textContent = datos.nombre + " está escribiendo...";
  clearTimeout(temporizadorAviso);
  temporizadorAviso = setTimeout(() => {
    avisoEscribiendo.textContent = "";
  }, 3000);
});

formularioMensaje.addEventListener("submit", (evento) => {
  evento.preventDefault();
  const texto = campoTexto.value.trim();
  if (!texto) return;
  socket.emit("enviar_mensaje", { id_equipo: idEquipo, texto: texto });
  campoTexto.value = "";
  campoTexto.focus();
});

// ---- Selector pequeño de emojis ----

const selectorEmojis = document.getElementById("selector-emojis-chat");
document.getElementById("boton-emojis-chat").addEventListener("click", () => {
  selectorEmojis.classList.toggle("abierto");
});
document.querySelectorAll(".emoji-chat").forEach((boton) => {
  boton.addEventListener("click", () => {
    campoTexto.value += boton.textContent;
    campoTexto.focus();
  });
});

// ---- Imágenes y Voz-it ----

async function subirAdjunto(archivo, tipo) {
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

document.getElementById("boton-imagen-chat").addEventListener("click", () => {
  document.getElementById("entrada-imagen-chat").click();
});
document.getElementById("entrada-imagen-chat").addEventListener("change", async (evento) => {
  const archivo = evento.target.files[0];
  evento.target.value = "";
  if (!archivo) return;
  try {
    await subirAdjunto(archivo, "imagen");
  } catch (error) {
    alert(error.message);
  }
});

let grabadora = null;
let trozosAudio = [];
let flujoAudio = null;
let limiteGrabacion = null;

botonVoz.addEventListener("click", async () => {
  if (grabadora) {
    grabadora.stop();
    return;
  }
  try {
    flujoAudio = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mime = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm"
      : (MediaRecorder.isTypeSupported("audio/mp4") ? "audio/mp4" : "");
    grabadora = mime ? new MediaRecorder(flujoAudio, { mimeType: mime }) : new MediaRecorder(flujoAudio);
    trozosAudio = [];
    grabadora.addEventListener("dataavailable", (evento) => {
      if (evento.data.size) trozosAudio.push(evento.data);
    });
    grabadora.addEventListener("stop", async () => {
      flujoAudio.getTracks().forEach((pista) => pista.stop());
      clearTimeout(limiteGrabacion);
      const mimeFinal = grabadora.mimeType || mime || "audio/webm";
      const extension = mimeFinal.includes("mp4") ? "m4a" : "webm";
      const blob = new Blob(trozosAudio, { type: mimeFinal });
      grabadora = null;
      botonVoz.classList.remove("btn-danger");
      botonVoz.classList.add("btn-outline-secondary");
      botonVoz.textContent = "🎙️";
      if (!blob.size) return;
      try {
        await subirAdjunto(
          new File([blob], `voz-it-${Date.now()}.${extension}`, { type: mimeFinal }),
          "audio",
        );
      } catch (error) {
        alert(error.message);
      }
    });
    grabadora.start();
    botonVoz.classList.remove("btn-outline-secondary");
    botonVoz.classList.add("btn-danger");
    botonVoz.textContent = "⏹";
    limiteGrabacion = setTimeout(() => {
      if (grabadora) grabadora.stop();
    }, 120000);
  } catch (error) {
    alert("No se pudo usar el micrófono. Revisa el permiso del navegador.");
  }
});

// ---- Dibujo de mensajes y reacciones ----

function agregarMensaje(mensaje) {
  mensaje.reacciones ||= { totales: {}, mias: [] };
  mensajes.set(mensaje.id, mensaje);

  const esMio = mensaje.id_usuario === idUsuarioActual;
  const burbuja = document.createElement("div");
  burbuja.id = "mensaje-" + mensaje.id;
  burbuja.className = "burbuja-chat p-2 rounded mb-2 "
    + (esMio ? "bg-primary text-white ms-auto" : "bg-white border");

  const encabezado = document.createElement("div");
  encabezado.className = "small " + (esMio ? "text-white-50" : "text-muted");
  encabezado.textContent = mensaje.nombre + " · " + mensaje.hora;
  burbuja.appendChild(encabezado);

  if (mensaje.texto) {
    const cuerpo = document.createElement("div");
    cuerpo.textContent = mensaje.texto;
    burbuja.appendChild(cuerpo);
  }

  if (mensaje.adjunto?.tipo === "imagen") {
    const imagen = document.createElement("img");
    imagen.className = "imagen-chat mt-1";
    imagen.src = mensaje.adjunto.url;
    imagen.alt = mensaje.adjunto.nombre;
    imagen.addEventListener("click", () => ampliarImagen(imagen.src));
    burbuja.appendChild(imagen);
  } else if (mensaje.adjunto?.tipo === "audio") {
    const audio = document.createElement("audio");
    audio.className = "mt-1";
    audio.controls = true;
    audio.preload = "metadata";
    audio.src = mensaje.adjunto.url;
    burbuja.appendChild(audio);
  }

  const reacciones = document.createElement("div");
  reacciones.className = "reacciones-chat";
  reacciones.id = "reacciones-" + mensaje.id;
  burbuja.appendChild(reacciones);

  const menu = document.createElement("div");
  menu.className = "menu-reacciones";
  EMOJIS_REACCION.forEach((emoji) => {
    const boton = document.createElement("button");
    boton.type = "button";
    boton.textContent = emoji;
    boton.title = "Reaccionar con " + emoji;
    boton.addEventListener("click", () => {
      socket.emit("reaccionar_mensaje", {
        id_equipo: idEquipo,
        id_mensaje: mensaje.id,
        emoji: emoji,
      });
    });
    menu.appendChild(boton);
  });
  burbuja.appendChild(menu);

  listaMensajes.appendChild(burbuja);
  dibujarReacciones(mensaje);
  listaMensajes.scrollTop = listaMensajes.scrollHeight;
}

function dibujarReacciones(mensaje) {
  const contenedor = document.getElementById("reacciones-" + mensaje.id);
  if (!contenedor) return;
  contenedor.innerHTML = "";
  const mias = new Set(mensaje.reacciones.mias || []);
  Object.entries(mensaje.reacciones.totales || {}).forEach(([emoji, cantidad]) => {
    if (!cantidad) return;
    const boton = document.createElement("button");
    boton.type = "button";
    boton.className = "reaccion-chat" + (mias.has(emoji) ? " mia" : "");
    boton.textContent = `${emoji} ${cantidad}`;
    boton.addEventListener("click", () => {
      socket.emit("reaccionar_mensaje", {
        id_equipo: idEquipo,
        id_mensaje: mensaje.id,
        emoji: emoji,
      });
    });
    contenedor.appendChild(boton);
  });
}

const visorImagen = document.getElementById("visor-imagen-chat");
function ampliarImagen(url) {
  visorImagen.querySelector("img").src = url;
  visorImagen.classList.add("abierto");
}
visorImagen.addEventListener("click", () => {
  visorImagen.classList.remove("abierto");
  visorImagen.querySelector("img").removeAttribute("src");
});

listaMensajes.scrollTop = listaMensajes.scrollHeight;
