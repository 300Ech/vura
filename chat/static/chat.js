// Chat en tiempo real del equipo. Usa Socket.IO; el servidor guarda el historial.
const contenedorChat = document.getElementById("chat");
const idEquipo = Number(contenedorChat.dataset.idEquipo);
const idUsuarioActual = Number(contenedorChat.dataset.idUsuario);

const listaMensajes = document.getElementById("lista-mensajes");
const formularioMensaje = document.getElementById("formulario-mensaje");
const campoTexto = document.getElementById("campo-texto");

const socket = io();

socket.on("connect", () => {
  socket.emit("unirse_sala", { id_equipo: idEquipo });
});

socket.on("nuevo_mensaje", (mensaje) => {
  avisoEscribiendo.textContent = "";
  agregarMensaje(mensaje);
});

// ---- Aviso de "está escribiendo..." ----
const avisoEscribiendo = document.getElementById("aviso-escribiendo");
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

function agregarMensaje(mensaje) {
  const esMio = mensaje.id_usuario === idUsuarioActual;

  const burbuja = document.createElement("div");
  burbuja.className = "p-2 rounded mb-2 " + (esMio ? "bg-primary text-white ms-auto" : "bg-white border");
  burbuja.style.maxWidth = "75%";

  const encabezado = document.createElement("div");
  encabezado.className = "small " + (esMio ? "text-white-50" : "text-muted");
  encabezado.textContent = mensaje.nombre + " · " + mensaje.hora;

  const cuerpo = document.createElement("div");
  cuerpo.textContent = mensaje.texto;

  burbuja.appendChild(encabezado);
  burbuja.appendChild(cuerpo);
  listaMensajes.appendChild(burbuja);
  listaMensajes.scrollTop = listaMensajes.scrollHeight;
}

listaMensajes.scrollTop = listaMensajes.scrollHeight;
