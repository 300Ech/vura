// Editor de diapositivas colaborativo: Fabric.js + Yjs.
// Cada diapositiva vive en un mapa compartido de Yjs; si dos personas editan la misma,
// gana el último cambio de esa diapositiva (y Yjs deja a todos con la misma versión).
import * as Y from "https://cdn.jsdelivr.net/npm/yjs@13.6.14/+esm";
import { conectarDocumento } from "/colaboracion/static/colaboracion.js";

const contenedorEditor = document.getElementById("editor-presentacion");
const diapositivasIniciales = JSON.parse(document.getElementById("datos-diapositivas").textContent);
const idPresentacion = Number(contenedorEditor.dataset.idPresentacion);
const idProyecto = Number(contenedorEditor.dataset.idProyecto);

const indicadorEstado = document.getElementById("estado-guardado");
const panelDiapositivas = document.getElementById("panel-diapositivas");
const selectorColor = document.getElementById("selector-color");
const selectorFondo = document.getElementById("selector-fondo");
const selectorTamano = document.getElementById("selector-tamano");

const lienzo = new fabric.Canvas("lienzo", { backgroundColor: "#ffffff", preserveObjectStacking: true });

// diapositivas = [{ id, contenido }] en el orden actual.
let diapositivas = diapositivasIniciales.map((d) => ({ id: d.id, contenido: d.contenido }));
let indiceActual = 0;
let cargandoDiapositiva = false;
let temporizadorGuardado = null;
let hayCambiosSinGuardar = false;

// ---- Documento compartido ----

const ORIGEN_LOCAL = "local";
const doc = new Y.Doc();
const lienzosCompartidos = doc.getMap("lienzos"); // id de diapositiva -> JSON del lienzo
const metaCompartida = doc.getMap("meta");        // "orden" -> lista de ids

conectarDocumento({
  tipo: "presentacion",
  idProyecto: idProyecto,
  doc: doc,
  alRecibirEstado: () => {
    if (!metaCompartida.get("orden")) {
      // Documento compartido vacío: se siembra con lo guardado en el servidor.
      doc.transact(() => {
        metaCompartida.set("orden", diapositivas.map((d) => d.id));
        diapositivas.forEach((d) => {
          if (d.contenido) lienzosCompartidos.set(String(d.id), d.contenido);
        });
      }, ORIGEN_LOCAL);
    }
  },
});

lienzosCompartidos.observe((evento) => {
  if (evento.transaction.origin === ORIGEN_LOCAL) return;
  evento.keysChanged.forEach((clave) => {
    const id = Number(clave);
    const diapositiva = diapositivas.find((d) => d.id === id);
    if (!diapositiva) return;
    diapositiva.contenido = lienzosCompartidos.get(clave) || null;
    generarMiniatura(diapositiva);
    if (id === diapositivas[indiceActual].id) {
      cargarDiapositiva(indiceActual); // un compañero cambió la diapositiva que estamos viendo
    }
  });
});

metaCompartida.observe((evento) => {
  if (evento.transaction.origin === ORIGEN_LOCAL) return;
  const orden = metaCompartida.get("orden");
  if (!orden) return;
  const idActual = diapositivas[indiceActual] ? diapositivas[indiceActual].id : null;
  diapositivas = orden.map((id) => {
    const existente = diapositivas.find((d) => d.id === id);
    return existente || { id: id, contenido: lienzosCompartidos.get(String(id)) || null };
  });
  diapositivas.forEach((d) => { if (!miniaturas.has(d.id)) generarMiniatura(d); });
  const nuevoIndice = diapositivas.findIndex((d) => d.id === idActual);
  cargarDiapositiva(nuevoIndice >= 0 ? nuevoIndice : 0);
});

function publicarDiapositiva(diapositiva) {
  doc.transact(() => {
    lienzosCompartidos.set(String(diapositiva.id), diapositiva.contenido);
  }, ORIGEN_LOCAL);
}

function publicarOrden() {
  doc.transact(() => {
    metaCompartida.set("orden", diapositivas.map((d) => d.id));
  }, ORIGEN_LOCAL);
  // También se guarda el orden en el servidor, para que la próxima carga salga igual.
  fetch(`/presentaciones/${idPresentacion}/orden`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orden: diapositivas.map((d) => d.id) }),
  });
}

// ---- Miniaturas ----
// Un lienzo estático oculto dibuja cada diapositiva en pequeño y la convierte en imagen.

const miniaturas = new Map(); // id de diapositiva -> imagen (data URL)
const lienzoMiniaturas = new fabric.StaticCanvas(document.createElement("canvas"), {
  width: 960, height: 540,
});
let colaMiniaturas = Promise.resolve(); // se generan de una en una, en orden

function generarMiniatura(diapositiva) {
  colaMiniaturas = colaMiniaturas.then(() => new Promise((listo) => {
    lienzoMiniaturas.clear();
    lienzoMiniaturas.backgroundColor = "#ffffff";
    const terminar = () => {
      miniaturas.set(diapositiva.id, lienzoMiniaturas.toDataURL({ format: "jpeg", quality: 0.7, multiplier: 0.18 }));
      dibujarPanel();
      listo();
    };
    if (diapositiva.contenido) {
      lienzoMiniaturas.loadFromJSON(diapositiva.contenido, () => {
        lienzoMiniaturas.renderAll();
        terminar();
      });
    } else {
      lienzoMiniaturas.renderAll();
      terminar();
    }
  }));
}

function dibujarPanel() {
  panelDiapositivas.innerHTML = "";
  diapositivas.forEach((diapositiva, indice) => {
    const boton = document.createElement("button");
    boton.type = "button";
    boton.className = "miniatura" + (indice === indiceActual ? " activa" : "");

    const imagen = document.createElement("img");
    imagen.alt = "Diapositiva " + (indice + 1);
    if (miniaturas.has(diapositiva.id)) imagen.src = miniaturas.get(diapositiva.id);
    const numero = document.createElement("span");
    numero.className = "numero";
    numero.textContent = indice + 1;

    boton.append(imagen, numero);
    boton.addEventListener("click", async () => {
      await guardarAhora();
      cargarDiapositiva(indice);
    });
    panelDiapositivas.appendChild(boton);
  });
}

// ---- Cargar y cambiar de diapositiva ----

function cargarDiapositiva(indice) {
  cargandoDiapositiva = true;
  indiceActual = indice;
  const contenido = diapositivas[indice].contenido;
  lienzo.clear();
  lienzo.backgroundColor = "#ffffff";
  if (contenido) {
    lienzo.loadFromJSON(contenido, () => {
      lienzo.renderAll();
      selectorFondo.value = lienzo.backgroundColor || "#ffffff";
      cargandoDiapositiva = false;
    });
  } else {
    lienzo.renderAll();
    selectorFondo.value = "#ffffff";
    cargandoDiapositiva = false;
  }
  dibujarPanel();
}

// ---- Guardado ----

function programarGuardado() {
  if (cargandoDiapositiva) return;
  hayCambiosSinGuardar = true;
  indicadorEstado.textContent = "Cambios sin guardar...";
  indicadorEstado.className = "text-warning small";
  clearTimeout(temporizadorGuardado);
  temporizadorGuardado = setTimeout(guardarAhora, 2000);
}

async function guardarAhora() {
  if (!hayCambiosSinGuardar) return;
  clearTimeout(temporizadorGuardado);
  const diapositiva = diapositivas[indiceActual];
  diapositiva.contenido = lienzo.toJSON();
  publicarDiapositiva(diapositiva);
  generarMiniatura(diapositiva);

  try {
    const respuesta = await fetch(`/diapositivas/${diapositiva.id}/guardar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contenido: diapositiva.contenido }),
    });
    if (!respuesta.ok) throw new Error("Error del servidor");
    const datos = await respuesta.json();
    hayCambiosSinGuardar = false;
    indicadorEstado.textContent = "Guardado a las " + datos.actualizado_en;
    indicadorEstado.className = "text-success small";
  } catch (error) {
    indicadorEstado.textContent = "No se pudo guardar. Reintentando...";
    indicadorEstado.className = "text-danger small";
    temporizadorGuardado = setTimeout(guardarAhora, 5000);
  }
}

lienzo.on("object:added", programarGuardado);
lienzo.on("object:modified", programarGuardado);
lienzo.on("object:removed", programarGuardado);

// ---- Barra de herramientas ----

document.getElementById("boton-texto").addEventListener("click", () => {
  const texto = new fabric.IText("Escribe aquí", {
    left: 100, top: 100, fontSize: Number(selectorTamano.value), fill: selectorColor.value, fontFamily: "Arial",
  });
  lienzo.add(texto);
  lienzo.setActiveObject(texto);
});

document.getElementById("boton-rectangulo").addEventListener("click", () => {
  lienzo.add(new fabric.Rect({ left: 120, top: 120, width: 200, height: 120, fill: selectorColor.value }));
});

document.getElementById("boton-circulo").addEventListener("click", () => {
  lienzo.add(new fabric.Circle({ left: 150, top: 150, radius: 70, fill: selectorColor.value }));
});

document.getElementById("boton-triangulo").addEventListener("click", () => {
  lienzo.add(new fabric.Triangle({ left: 180, top: 140, width: 160, height: 140, fill: selectorColor.value }));
});

document.getElementById("boton-linea").addEventListener("click", () => {
  lienzo.add(new fabric.Line([100, 200, 350, 200], { stroke: selectorColor.value, strokeWidth: 4 }));
});

document.getElementById("boton-imagen").addEventListener("click", () => {
  const url = prompt("Pega la URL de la imagen:");
  if (!url) return;
  fabric.Image.fromURL(url, (imagen) => {
    imagen.scaleToWidth(300);
    lienzo.add(imagen);
  }, { crossOrigin: "anonymous" });
});

selectorColor.addEventListener("input", () => {
  const objeto = lienzo.getActiveObject();
  if (objeto) {
    // Las líneas se pintan con "stroke"; el resto de figuras y textos con "fill".
    objeto.set(objeto.type === "line" ? "stroke" : "fill", selectorColor.value);
    lienzo.renderAll();
    programarGuardado();
  }
});

selectorFondo.addEventListener("input", () => {
  lienzo.backgroundColor = selectorFondo.value;
  lienzo.renderAll();
  programarGuardado();
});

selectorTamano.addEventListener("change", () => {
  const objeto = lienzo.getActiveObject();
  if (objeto && objeto.fontSize) {
    objeto.set("fontSize", Number(selectorTamano.value));
    lienzo.renderAll();
    programarGuardado();
  }
});

function eliminarSeleccion() {
  lienzo.getActiveObjects().forEach((objeto) => lienzo.remove(objeto));
  lienzo.discardActiveObject();
  lienzo.renderAll();
}

document.getElementById("boton-eliminar-objeto").addEventListener("click", eliminarSeleccion);

// Tecla Suprimir (o Backspace) borra el objeto seleccionado,
// salvo que se esté escribiendo dentro de un texto o un campo del formulario.
document.addEventListener("keydown", (evento) => {
  if (evento.key !== "Delete" && evento.key !== "Backspace") return;
  const objeto = lienzo.getActiveObject();
  const escribiendo = (objeto && objeto.isEditing) || ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName);
  if (objeto && !escribiendo) {
    evento.preventDefault();
    eliminarSeleccion();
  }
});

// ---- Agregar, duplicar, mover y borrar diapositivas ----

async function crearDiapositivaEnServidor() {
  const respuesta = await fetch(`/presentaciones/${idPresentacion}/diapositivas/crear`, { method: "POST" });
  if (!respuesta.ok) return null;
  return respuesta.json();
}

document.getElementById("boton-nueva-diapositiva").addEventListener("click", async () => {
  await guardarAhora();
  const nueva = await crearDiapositivaEnServidor();
  if (!nueva) return;
  diapositivas.push({ id: nueva.id, contenido: null });
  publicarOrden();
  generarMiniatura(diapositivas[diapositivas.length - 1]);
  cargarDiapositiva(diapositivas.length - 1);
});

document.getElementById("boton-duplicar-diapositiva").addEventListener("click", async () => {
  await guardarAhora();
  const nueva = await crearDiapositivaEnServidor();
  if (!nueva) return;
  const copia = { id: nueva.id, contenido: lienzo.toJSON() };
  diapositivas.splice(indiceActual + 1, 0, copia);
  publicarDiapositiva(copia);
  publicarOrden();
  generarMiniatura(copia);
  // El contenido copiado también se guarda en el servidor.
  fetch(`/diapositivas/${copia.id}/guardar`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contenido: copia.contenido }),
  });
  cargarDiapositiva(indiceActual + 1);
});

function moverDiapositiva(desplazamiento) {
  const destino = indiceActual + desplazamiento;
  if (destino < 0 || destino >= diapositivas.length) return;
  const [movida] = diapositivas.splice(indiceActual, 1);
  diapositivas.splice(destino, 0, movida);
  indiceActual = destino;
  publicarOrden();
  dibujarPanel();
}

document.getElementById("boton-mover-izquierda").addEventListener("click", () => moverDiapositiva(-1));
document.getElementById("boton-mover-derecha").addEventListener("click", () => moverDiapositiva(1));

document.getElementById("boton-borrar-diapositiva").addEventListener("click", async () => {
  if (diapositivas.length <= 1) {
    alert("La presentación debe tener al menos una diapositiva.");
    return;
  }
  if (!confirm(`¿Borrar la diapositiva ${indiceActual + 1}?`)) return;

  const diapositiva = diapositivas[indiceActual];
  const respuesta = await fetch(`/diapositivas/${diapositiva.id}/eliminar`, { method: "POST" });
  if (!respuesta.ok) return;
  diapositivas.splice(indiceActual, 1);
  miniaturas.delete(diapositiva.id);
  doc.transact(() => {
    lienzosCompartidos.delete(String(diapositiva.id));
  }, ORIGEN_LOCAL);
  publicarOrden();
  hayCambiosSinGuardar = false;
  cargarDiapositiva(Math.max(0, indiceActual - 1));
});

// ---- Modo presentación ----
// Una capa negra a pantalla completa con un lienzo de solo lectura;
// flechas para avanzar y retroceder, Escape para salir.

const capaPresentacion = document.getElementById("modo-presentacion");
const contadorPresentacion = document.getElementById("contador-presentacion");
const lienzoPresentacion = new fabric.StaticCanvas("lienzo-presentacion");
let indicePresentacion = 0;
let presentando = false;

function ajustarTamanoPresentacion() {
  const escala = Math.min(window.innerWidth / 960, window.innerHeight / 540);
  const elemento = lienzoPresentacion.getElement().parentElement || lienzoPresentacion.getElement();
  elemento.style.transform = `scale(${escala})`;
  elemento.style.transformOrigin = "center center";
}

function mostrarDiapositivaPresentacion(indice) {
  indicePresentacion = indice;
  const contenido = diapositivas[indice].contenido;
  lienzoPresentacion.clear();
  lienzoPresentacion.backgroundColor = "#ffffff";
  if (contenido) {
    lienzoPresentacion.loadFromJSON(contenido, () => lienzoPresentacion.renderAll());
  } else {
    lienzoPresentacion.renderAll();
  }
  contadorPresentacion.textContent = `${indice + 1} / ${diapositivas.length}`;
}

document.getElementById("boton-presentar").addEventListener("click", async () => {
  await guardarAhora();
  presentando = true;
  capaPresentacion.classList.add("activo");
  ajustarTamanoPresentacion();
  mostrarDiapositivaPresentacion(indiceActual);
  if (capaPresentacion.requestFullscreen) {
    capaPresentacion.requestFullscreen().catch(() => {});
  }
});

function salirDePresentacion() {
  presentando = false;
  capaPresentacion.classList.remove("activo");
  if (document.fullscreenElement) document.exitFullscreen();
}

document.addEventListener("keydown", (evento) => {
  if (!presentando) return;
  if (evento.key === "ArrowRight" || evento.key === " " || evento.key === "PageDown") {
    if (indicePresentacion < diapositivas.length - 1) mostrarDiapositivaPresentacion(indicePresentacion + 1);
  } else if (evento.key === "ArrowLeft" || evento.key === "PageUp") {
    if (indicePresentacion > 0) mostrarDiapositivaPresentacion(indicePresentacion - 1);
  } else if (evento.key === "Escape") {
    salirDePresentacion();
  }
});

// Si sale de pantalla completa (con Escape del navegador), también se cierra el modo.
document.addEventListener("fullscreenchange", () => {
  if (!document.fullscreenElement && presentando) salirDePresentacion();
});

capaPresentacion.addEventListener("click", () => {
  if (indicePresentacion < diapositivas.length - 1) {
    mostrarDiapositivaPresentacion(indicePresentacion + 1);
  } else {
    salirDePresentacion();
  }
});

window.addEventListener("resize", () => {
  if (presentando) ajustarTamanoPresentacion();
});

// Aviso al salir con cambios sin guardar.
window.addEventListener("beforeunload", (evento) => {
  if (hayCambiosSinGuardar) {
    evento.preventDefault();
  }
});

// ---- Arranque ----

diapositivas.forEach((d) => generarMiniatura(d));
cargarDiapositiva(0);
