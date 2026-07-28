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
let colorActual = "#fff59d"; // amarillo post-it

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
          objetosCompartidos.set(crypto.randomUUID(), {
            type: "textbox",
            text: texto.slice(0, 2000),
            left: 60, top: 60, width: 420,
            fontSize: 18, fontFamily: "Arial",
            fill: "#333333", backgroundColor: "#fff59d",
          });
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
  const postIt = new fabric.Textbox("Escribe aquí", {
    left: 80 + Math.random() * 200,
    top: 80 + Math.random() * 150,
    width: 180,
    fontSize: 20,
    fontFamily: "Arial",
    fill: "#333333",
    backgroundColor: colorActual,
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
  const texto = new fabric.Textbox("Texto", {
    left: 120 + Math.random() * 200,
    top: 120 + Math.random() * 150,
    width: 250,
    fontSize: 28,
    fontFamily: "Arial",
    fill: "#212529",
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
    if (objeto && objeto.type === "textbox") {
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
