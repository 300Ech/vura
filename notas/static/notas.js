// Pizarra colaborativa (estilo FigJam): Fabric.js + Yjs.
// Cada post-it, texto o trazo es una entrada en el mapa compartido de Yjs
// (igual que las tareas del tablero): así dos personas pueden mover
// objetos distintos a la vez sin pisarse.
import * as Y from "https://cdn.jsdelivr.net/npm/yjs@13.6.14/+esm";
import { conectarDocumento } from "/colaboracion/static/colaboracion.js";

const contenedorNotas = document.getElementById("notas");
const idProyecto = Number(contenedorNotas.dataset.idProyecto);
const contenidoInicial = JSON.parse(document.getElementById("contenido-inicial").textContent);

const indicadorEstado = document.getElementById("estado-guardado");

const lienzo = new fabric.Canvas("lienzo-pizarra", { preserveObjectStacking: true });

// El color elegido en la paleta se usa para post-its nuevos y para el lápiz.
let colorActual = "#fde047"; // amarillo post-it vibrante

// ---- Post-it de verdad ----
// Es un Textbox de Fabric con dos detalles extra que lo hacen parecer papel:
// nunca es más bajo que ancho (el papelito es cuadrado aunque tenga poco texto)
// y viene con una pequeña inclinación aleatoria, como pegado a mano.

const PostIt = fabric.util.createClass(fabric.Textbox, {
  type: "post-it",

  initDimensions: function () {
    this.callSuper("initDimensions");
    this.height = Math.max(this.height, this.width);
  },
});

// Permite que Fabric reconstruya los post-its guardados o los de un compañero.
PostIt.fromObject = function (objeto, callback) {
  return fabric.Object._fromObject("PostIt", objeto, callback, "text");
};
fabric.PostIt = PostIt;

function crearPostIt(texto, opciones) {
  return new PostIt(texto, {
    width: 190,
    fontSize: 28,
    fontFamily: "Caveat",
    fill: "#1e293b",
    backgroundColor: colorActual,
    padding: 14,
    angle: Math.random() * 6 - 3, // inclinación de -3° a +3°
    shadow: { color: "rgba(0,0,0,0.2)", blur: 4, offsetX: 4, offsetY: 5 },
    ...opciones,
  });
}

const ORIGEN_LOCAL = "local";
const doc = new Y.Doc();
const objetosCompartidos = doc.getMap("objetos"); // uuid -> objeto de Fabric en JSON

let aplicandoRemoto = false; // evita re-publicar lo que llega de un compañero

// ---- Publicar y aplicar cambios ----

function publicarObjeto(objeto) {
  if (!objeto.uuid) objeto.uuid = crypto.randomUUID();
  doc.transact(() => {
    objetosCompartidos.set(objeto.uuid, objeto.toObject(["uuid"]));
  }, ORIGEN_LOCAL);
  programarCopia();
}

function quitarObjeto(objeto) {
  if (!objeto.uuid) return;
  doc.transact(() => {
    objetosCompartidos.delete(objeto.uuid);
  }, ORIGEN_LOCAL);
  programarCopia();
}

function buscarEnLienzo(uuid) {
  return lienzo.getObjects().find((objeto) => objeto.uuid === uuid);
}

objetosCompartidos.observe((evento) => {
  if (evento.transaction.origin === ORIGEN_LOCAL) return;
  aplicandoRemoto = true;
  evento.keysChanged.forEach((uuid) => {
    const existente = buscarEnLienzo(uuid);
    if (existente) lienzo.remove(existente);
    const datos = objetosCompartidos.get(uuid);
    if (datos) {
      fabric.util.enlivenObjects([datos], (objetos) => {
        objetos.forEach((objeto) => {
          objeto.uuid = uuid;
          lienzo.add(objeto);
        });
        lienzo.renderAll();
      });
    }
  });
  aplicandoRemoto = false;
  lienzo.renderAll();
  programarCopia();
});

conectarDocumento({
  tipo: "notas",
  idProyecto: idProyecto,
  doc: doc,
  alRecibirEstado: () => {
    if (objetosCompartidos.size > 0) return;
    // Documento compartido vacío: se siembra con la copia del servidor.
    doc.transact(() => {
      if (contenidoInicial && contenidoInicial.objetos) {
        // Copia de una pizarra ya guardada.
        Object.entries(contenidoInicial.objetos).forEach(([uuid, datos]) => {
          objetosCompartidos.set(uuid, datos);
        });
      } else if (contenidoInicial && contenidoInicial.ops) {
        // Notas viejas del bloc de texto (Quill): se convierten en un post-it grande.
        const texto = contenidoInicial.ops
          .map((operacion) => (typeof operacion.insert === "string" ? operacion.insert : ""))
          .join("").trim();
        if (texto) {
          const postIt = crearPostIt(texto.slice(0, 2000), { left: 60, top: 60, width: 420 });
          objetosCompartidos.set(crypto.randomUUID(), postIt.toObject(["uuid"]));
        }
      }
    }, ORIGEN_LOCAL);
    cargarDesdeCompartido();
  },
});

function cargarDesdeCompartido() {
  aplicandoRemoto = true;
  lienzo.clear();
  objetosCompartidos.forEach((datos, uuid) => {
    fabric.util.enlivenObjects([datos], (objetos) => {
      objetos.forEach((objeto) => {
        objeto.uuid = uuid;
        lienzo.add(objeto);
      });
      lienzo.renderAll();
    });
  });
  aplicandoRemoto = false;
}

cargarDesdeCompartido();

// ---- Eventos locales del lienzo ----

lienzo.on("object:modified", (evento) => {
  if (!aplicandoRemoto) publicarObjeto(evento.target);
});

// Un trazo del lápiz recién terminado también se comparte.
lienzo.on("path:created", (evento) => {
  if (!aplicandoRemoto) publicarObjeto(evento.path);
});

// Al escribir dentro de un texto, se comparte con una pequeña espera.
let temporizadorTexto = null;
lienzo.on("text:changed", (evento) => {
  clearTimeout(temporizadorTexto);
  temporizadorTexto = setTimeout(() => publicarObjeto(evento.target), 500);
});

// ---- Menú inferior ----

function agregarPostIt() {
  const postIt = crearPostIt("Escribe aquí", {
    left: 80 + Math.random() * 200,
    top: 80 + Math.random() * 150,
  });
  lienzo.add(postIt);
  lienzo.setActiveObject(postIt);
  publicarObjeto(postIt);
}

document.getElementById("boton-postit").addEventListener("click", agregarPostIt);
lienzo.on("mouse:dblclick", (evento) => {
  if (!evento.target) agregarPostIt(); // doble clic en un espacio vacío crea un post-it
});

document.getElementById("boton-texto-suelto").addEventListener("click", () => {
  const texto = new fabric.IText("Texto", {
    left: 120 + Math.random() * 200,
    top: 120 + Math.random() * 150,
    fontSize: 32,
    fontFamily: "Caveat",
    fill: "#1e293b",
    padding: 8, /* Añade área de agarre */
    transparentCorners: false
  });
  lienzo.add(texto);
  lienzo.setActiveObject(texto);
  publicarObjeto(texto);
});

const botonLapiz = document.getElementById("boton-lapiz");
botonLapiz.addEventListener("click", () => {
  lienzo.isDrawingMode = !lienzo.isDrawingMode;
  lienzo.freeDrawingBrush.color = "#495057";
  lienzo.freeDrawingBrush.width = 3;
  botonLapiz.classList.toggle("active", lienzo.isDrawingMode);
});

// Paleta de colores: pinta el post-it seleccionado y queda como color para los nuevos.
document.querySelectorAll(".muestra-color").forEach((muestra) => {
  muestra.addEventListener("click", () => {
    colorActual = muestra.dataset.color;
    document.querySelectorAll(".muestra-color").forEach((m) => m.classList.remove("activa"));
    muestra.classList.add("activa");
    const objeto = lienzo.getActiveObject();
    if (objeto && (objeto.type === "post-it" || objeto.type === "textbox" || objeto.type === "i-text")) {
      objeto.set("backgroundColor", colorActual);
      lienzo.renderAll();
      publicarObjeto(objeto);
    }
  });
});

function eliminarSeleccion() {
  lienzo.getActiveObjects().forEach((objeto) => {
    lienzo.remove(objeto);
    quitarObjeto(objeto);
  });
  lienzo.discardActiveObject();
  lienzo.renderAll();
}

document.getElementById("boton-borrar-objeto").addEventListener("click", eliminarSeleccion);

document.addEventListener("keydown", (evento) => {
  if (evento.key !== "Delete" && evento.key !== "Backspace") return;
  const objeto = lienzo.getActiveObject();
  const escribiendo = (objeto && objeto.isEditing) || ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName);
  if (objeto && !escribiendo) {
    evento.preventDefault();
    eliminarSeleccion();
  }
});

// ---- Copia de lectura en el servidor (para vistas y exportación) ----

let temporizadorCopia = null;
let hayCambiosSinGuardar = false;

function programarCopia() {
  hayCambiosSinGuardar = true;
  indicadorEstado.textContent = "Cambios sin guardar...";
  indicadorEstado.className = "text-warning small";
  clearTimeout(temporizadorCopia);
  temporizadorCopia = setTimeout(guardarCopia, 2000);
}

async function guardarCopia() {
  if (!hayCambiosSinGuardar) return;
  clearTimeout(temporizadorCopia);

  const objetos = {};
  objetosCompartidos.forEach((datos, uuid) => { objetos[uuid] = datos; });

  try {
    const respuesta = await fetch(`/proyectos/${idProyecto}/notas/guardar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contenido: { objetos: objetos } }),
    });
    if (!respuesta.ok) throw new Error("Error del servidor");

    const datos = await respuesta.json();
    hayCambiosSinGuardar = false;
    indicadorEstado.textContent = "Guardado a las " + datos.actualizado_en;
    indicadorEstado.className = "text-success small";
  } catch (error) {
    indicadorEstado.textContent = "No se pudo guardar. Reintentando...";
    indicadorEstado.className = "text-danger small";
    temporizadorCopia = setTimeout(guardarCopia, 5000);
  }
}

// Aviso al salir con cambios sin guardar.
window.addEventListener("beforeunload", (evento) => {
  if (hayCambiosSinGuardar) {
    evento.preventDefault();
  }
});

// ---- Panel de chat sobre la pizarra ----
// Reutiliza los mismos eventos de Socket.IO del chat normal;
// el historial se pide al servidor la primera vez que se abre.

const panelChat = document.getElementById("panel-chat");
const idEquipo = Number(panelChat.dataset.idEquipo);
const idUsuarioActual = Number(panelChat.dataset.idUsuario);
const mensajesPanel = document.getElementById("mensajes-panel");
const avisoEscribiendoPanel = document.getElementById("aviso-escribiendo-panel");
const textoChatPanel = document.getElementById("texto-chat-panel");

const socketChat = io();
let historialCargado = false;

socketChat.on("connect", () => {
  socketChat.emit("unirse_sala", { id_equipo: idEquipo });
});

document.getElementById("boton-panel-chat").addEventListener("click", async () => {
  panelChat.classList.toggle("abierto");
  if (panelChat.classList.contains("abierto")) {
    if (!historialCargado) {
      historialCargado = true;
      const respuesta = await fetch(`/equipos/${idEquipo}/chat/mensajes`);
      const datos = await respuesta.json();
      datos.mensajes.forEach(agregarMensajePanel);
    }
    textoChatPanel.focus();
  }
});

document.getElementById("boton-cerrar-chat").addEventListener("click", () => {
  panelChat.classList.remove("abierto");
});

socketChat.on("nuevo_mensaje", (mensaje) => {
  avisoEscribiendoPanel.textContent = "";
  if (historialCargado) agregarMensajePanel(mensaje);
});

socketChat.on("usuario_escribiendo", (datos) => {
  avisoEscribiendoPanel.textContent = datos.nombre + " está escribiendo...";
  setTimeout(() => { avisoEscribiendoPanel.textContent = ""; }, 3000);
});

let ultimoAvisoEscribiendo = 0;
textoChatPanel.addEventListener("input", () => {
  const ahora = Date.now();
  if (ahora - ultimoAvisoEscribiendo > 2000) {
    ultimoAvisoEscribiendo = ahora;
    socketChat.emit("escribiendo", { id_equipo: idEquipo });
  }
});

document.getElementById("formulario-chat-panel").addEventListener("submit", (evento) => {
  evento.preventDefault();
  const texto = textoChatPanel.value.trim();
  if (!texto) return;
  socketChat.emit("enviar_mensaje", { id_equipo: idEquipo, texto: texto });
  textoChatPanel.value = "";
  textoChatPanel.focus();
});

function agregarMensajePanel(mensaje) {
  const esMio = mensaje.id_usuario === idUsuarioActual;
  const burbuja = document.createElement("div");
  burbuja.className = "p-2 rounded mb-2 small " + (esMio ? "bg-primary text-white ms-auto" : "bg-white border");
  burbuja.style.maxWidth = "85%";

  const encabezado = document.createElement("div");
  encabezado.className = "small " + (esMio ? "text-white-50" : "text-muted");
  encabezado.textContent = mensaje.nombre + " · " + mensaje.hora;
  const cuerpo = document.createElement("div");
  cuerpo.textContent = mensaje.texto;

  burbuja.append(encabezado, cuerpo);
  mensajesPanel.appendChild(burbuja);
  mensajesPanel.scrollTop = mensajesPanel.scrollHeight;
}
