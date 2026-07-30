// Editor de diapositivas colaborativo: Fabric.js + Yjs.
// Cada diapositiva vive en un mapa compartido de Yjs; si dos personas editan la misma,
// gana el último cambio de esa diapositiva (y Yjs deja a todos con la misma versión).
import * as Y from "https://cdn.jsdelivr.net/npm/yjs@13.6.14/+esm";
import { conectarDocumento } from "/colaboracion/static/colaboracion.js";
import { TEMAS, PLANTILLAS, ICONOS } from "/presentaciones/static/plantillas.js";

const contenedorEditor = document.getElementById("editor-presentacion");
const diapositivasIniciales = JSON.parse(document.getElementById("datos-diapositivas").textContent);
const idPresentacion = Number(contenedorEditor.dataset.idPresentacion);
const idProyecto = Number(contenedorEditor.dataset.idProyecto);

const indicadorEstado = document.getElementById("estado-guardado");
const panelDiapositivas = document.getElementById("panel-diapositivas");
const selectorColor = document.getElementById("selector-color");
const selectorFondo = document.getElementById("selector-fondo");
const selectorTamano = document.getElementById("selector-tamano");
const selectorFuente = document.getElementById("selector-fuente");

const ANCHO = 960;
const ALTO = 540;
const lienzo = new fabric.Canvas("lienzo", {
  backgroundColor: "#ffffff",
  preserveObjectStacking: true,
  selection: true,
});

// El lienzo siempre conserva sus 960×540 reales; sólo escalamos su vista.
const marcoLienzo = document.querySelector(".marco-lienzo");
const contenedorLienzoEscalado = document.getElementById("contenedor-lienzo-escalado");
const porcentajeZoom = document.getElementById("porcentaje-zoom");
let escalaEditor = 1;
let zoomAjustado = true;

function ajustarEscalaEditor() {
  if (!marcoLienzo || !contenedorLienzoEscalado) return;
  const areaScroll = document.querySelector('.lienzo-scroll-area') || contenedorLienzoEscalado.parentElement;
  if (zoomAjustado) escalaEditor = Math.min(1, (areaScroll.clientWidth - 32 - 160) / ANCHO);
  const escala = Math.max(0.25, Math.min(2, escalaEditor));
  marcoLienzo.style.transformOrigin = "top left";
  marcoLienzo.style.transform = `scale(${escala})`;
  contenedorLienzoEscalado.style.width = `${ANCHO * escala}px`;
  contenedorLienzoEscalado.style.height = `${ALTO * escala}px`;
  if (porcentajeZoom) porcentajeZoom.textContent = `${Math.round(escala * 100)}%`;
}
ajustarEscalaEditor();

// diapositivas = [{ id, contenido, notas }] en el orden actual.
let diapositivas = diapositivasIniciales.map((d) => ({
  id: d.id, contenido: d.contenido, notas: d.notas || "",
}));
let indiceActual = 0;
let cargandoDiapositiva = false;
let temporizadorGuardado = null;
let hayCambiosSinGuardar = false;
let colorAcento = "#8b5cf6";

// Propiedades propias que también deben viajar al servidor/Yjs.
const PROPS_EXTRA = [
  "vuraBloqueado", "lockMovementX", "lockMovementY",
  "lockScalingX", "lockScalingY", "lockRotation", "hasControls",
];

function serializarLienzo() {
  return lienzo.toJSON(PROPS_EXTRA);
}

// ---- Documento compartido ----

const ORIGEN_LOCAL = "local";
const doc = new Y.Doc();
const lienzosCompartidos = doc.getMap("lienzos");
const metaCompartida = doc.getMap("meta");

conectarDocumento({
  tipo: "presentacion",
  idProyecto: idProyecto,
  doc: doc,
  alRecibirEstado: () => {
    if (!metaCompartida.get("orden")) {
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
    if (id === diapositivas[indiceActual].id) cargarDiapositiva(indiceActual);
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
  fetch(`/presentaciones/${idPresentacion}/orden`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orden: diapositivas.map((d) => d.id) }),
  });
}

// ---- Miniaturas ----

const miniaturas = new Map();
const lienzoMiniaturas = new fabric.StaticCanvas(document.createElement("canvas"), {
  width: ANCHO, height: ALTO,
});
let colaMiniaturas = Promise.resolve();
let idDiapositivaArrastrada = null;

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
    boton.draggable = true;
    boton.dataset.idDiapositiva = diapositiva.id;
    boton.title = "Arrastrá para reordenar";

    const imagen = document.createElement("img");
    imagen.alt = "Diapositiva " + (indice + 1);
    if (miniaturas.has(diapositiva.id)) imagen.src = miniaturas.get(diapositiva.id);
    const numero = document.createElement("span");
    numero.className = "numero";
    numero.textContent = "⠿ Diapositiva " + (indice + 1);
    configurarArrastreTactilDiapositiva(numero, boton, diapositiva.id);

    boton.append(imagen, numero);
    boton.addEventListener("click", async () => {
      if (boton.classList.contains("fue-arrastrada")) return;
      await guardarAhora();
      cargarDiapositiva(indice);
    });
    boton.addEventListener("dragstart", (evento) => {
      guardarAhora();
      idDiapositivaArrastrada = diapositiva.id;
      evento.dataTransfer.effectAllowed = "move";
      evento.dataTransfer.setData("text/plain", String(diapositiva.id));
      requestAnimationFrame(() => boton.classList.add("arrastrando"));
    });
    boton.addEventListener("dragover", (evento) => {
      evento.preventDefault();
      evento.dataTransfer.dropEffect = "move";
      const caja = boton.getBoundingClientRect();
      const horizontal = panelDiapositivas.scrollWidth > panelDiapositivas.clientWidth;
      const despues = horizontal
        ? evento.clientX > caja.left + caja.width / 2
        : evento.clientY > caja.top + caja.height / 2;
      boton.classList.toggle("soltar-despues", despues);
      boton.classList.toggle("soltar-antes", !despues);
    });
    boton.addEventListener("dragleave", () => {
      boton.classList.remove("soltar-antes", "soltar-despues");
    });
    boton.addEventListener("drop", (evento) => {
      evento.preventDefault();
      const caja = boton.getBoundingClientRect();
      const horizontal = panelDiapositivas.scrollWidth > panelDiapositivas.clientWidth;
      const despues = horizontal
        ? evento.clientX > caja.left + caja.width / 2
        : evento.clientY > caja.top + caja.height / 2;
      reordenarDiapositivaArrastrada(diapositiva.id, despues);
    });
    boton.addEventListener("dragend", () => {
      boton.classList.remove("arrastrando", "soltar-antes", "soltar-despues");
      boton.classList.add("fue-arrastrada");
      setTimeout(() => boton.classList.remove("fue-arrastrada"), 0);
      idDiapositivaArrastrada = null;
    });
    panelDiapositivas.appendChild(boton);
  });
}

function reordenarDiapositivaArrastrada(idDestino, despues) {
  const idMovida = idDiapositivaArrastrada;
  if (!idMovida || idMovida === idDestino) return;

  const idActual = diapositivas[indiceActual]?.id;
  const origen = diapositivas.findIndex((d) => d.id === idMovida);
  const destino = diapositivas.findIndex((d) => d.id === idDestino);
  if (origen < 0 || destino < 0) return;

  let posicionInsercion = destino + (despues ? 1 : 0);
  const [movida] = diapositivas.splice(origen, 1);
  if (origen < posicionInsercion) posicionInsercion -= 1;
  diapositivas.splice(posicionInsercion, 0, movida);
  indiceActual = diapositivas.findIndex((d) => d.id === idActual);
  publicarOrden();
  dibujarPanel();
}

function posicionRelativaMiniatura(boton, x, y) {
  const caja = boton.getBoundingClientRect();
  const horizontal = panelDiapositivas.scrollWidth > panelDiapositivas.clientWidth;
  return horizontal ? x > caja.left + caja.width / 2 : y > caja.top + caja.height / 2;
}

function configurarArrastreTactilDiapositiva(asa, boton, idDiapositiva) {
  let destino = null;
  let despues = false;
  asa.addEventListener("pointerdown", (evento) => {
    if (evento.pointerType === "mouse") return;
    evento.preventDefault();
    idDiapositivaArrastrada = idDiapositiva;
    boton.classList.add("arrastrando");
    asa.setPointerCapture(evento.pointerId);
  });
  asa.addEventListener("pointermove", (evento) => {
    if (!idDiapositivaArrastrada || evento.pointerType === "mouse") return;
    panelDiapositivas.querySelectorAll(".miniatura").forEach((miniatura) => {
      miniatura.classList.remove("soltar-antes", "soltar-despues");
    });
    destino = document.elementFromPoint(evento.clientX, evento.clientY)?.closest(".miniatura") || null;
    if (!destino) return;
    despues = posicionRelativaMiniatura(destino, evento.clientX, evento.clientY);
    destino.classList.toggle("soltar-despues", despues);
    destino.classList.toggle("soltar-antes", !despues);
  });
  asa.addEventListener("pointerup", (evento) => {
    if (!idDiapositivaArrastrada || evento.pointerType === "mouse") return;
    if (destino) reordenarDiapositivaArrastrada(Number(destino.dataset.idDiapositiva), despues);
    boton.classList.remove("arrastrando");
    idDiapositivaArrastrada = null;
    dibujarPanel();
  });
}

// ---- Cargar y guardar ----

const campoNotas = document.getElementById("campo-notas");

function cargarDiapositiva(indice) {
  cargandoDiapositiva = true;
  indiceActual = indice;
  if (campoNotas) campoNotas.value = diapositivas[indice].notas || "";
  const contenido = diapositivas[indice].contenido;
  lienzo.clear();
  lienzo.backgroundColor = "#ffffff";
  if (contenido) {
    lienzo.loadFromJSON(contenido, () => {
      lienzo.renderAll();
      selectorFondo.value = rgbAHex(lienzo.backgroundColor) || "#ffffff";
      detectarTemaAplicado();
      cargandoDiapositiva = false;
      sincronizarHistorialAlCargar();
      actualizarEstadoVacio();
    });
  } else {
    lienzo.renderAll();
    selectorFondo.value = "#ffffff";
    temaAplicado = TEMAS[0];
    cargandoDiapositiva = false;
    sincronizarHistorialAlCargar();
    actualizarEstadoVacio();
  }
  dibujarPanel();
}

function programarGuardado() {
  if (cargandoDiapositiva) return;
  programarHistorial();
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
  diapositiva.contenido = serializarLienzo();
  publicarDiapositiva(diapositiva);
  generarMiniatura(diapositiva);

  try {
    const respuesta = await fetch(`/diapositivas/${diapositiva.id}/guardar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contenido: diapositiva.contenido, notas: diapositiva.notas || "" }),
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

// ---- Estado vacío (onboarding de diapositiva en blanco) ----

const estadoVacio = document.getElementById("estado-vacio");

function actualizarEstadoVacio() {
  if (!estadoVacio) return;
  estadoVacio.classList.toggle("d-none", lienzo.getObjects().length > 0);
}

lienzo.on("object:added", actualizarEstadoVacio);
lienzo.on("object:removed", actualizarEstadoVacio);

const botonVacioPlantillas = document.getElementById("boton-vacio-plantillas");
if (botonVacioPlantillas) {
  botonVacioPlantillas.addEventListener("click", () => document.getElementById("boton-plantillas").click());
}

lienzo.on("object:added", programarGuardado);
lienzo.on("object:modified", programarGuardado);
lienzo.on("object:removed", programarGuardado);

// Notas del presentador: se guardan igual que el resto (sin tocar el historial de deshacer).
if (campoNotas) {
  campoNotas.addEventListener("input", () => {
    if (cargandoDiapositiva) return;
    diapositivas[indiceActual].notas = campoNotas.value;
    hayCambiosSinGuardar = true;
    indicadorEstado.textContent = "Cambios sin guardar...";
    indicadorEstado.className = "text-warning small";
    clearTimeout(temporizadorGuardado);
    temporizadorGuardado = setTimeout(guardarAhora, 2000);
  });
}

// ---- Deshacer / rehacer ----
// Cada diapositiva guarda su propia lista corta de estados. Registramos los
// cambios con una pausa para que insertar una plantilla cuente como UN paso.

const historiales = new Map(); // id diapositiva -> { estados: [JSON], indice }
let temporizadorHistorial = null;
let aplicandoHistorial = false;

function claveEstadoActual() {
  return JSON.stringify(serializarLienzo());
}

function historialActual() {
  const diapositiva = diapositivas[indiceActual];
  if (!diapositiva) return null;
  if (!historiales.has(diapositiva.id)) {
    historiales.set(diapositiva.id, { estados: [claveEstadoActual()], indice: 0 });
  }
  return historiales.get(diapositiva.id);
}

function actualizarBotonesHistorial() {
  const h = historialActual();
  document.getElementById("boton-deshacer").disabled = !h || h.indice <= 0;
  document.getElementById("boton-rehacer").disabled = !h || h.indice >= h.estados.length - 1;
}

function registrarEstadoAhora() {
  if (cargandoDiapositiva || aplicandoHistorial) return;
  const h = historialActual();
  if (!h) return;
  const estado = claveEstadoActual();
  if (h.estados[h.indice] === estado) return;
  h.estados = h.estados.slice(0, h.indice + 1);
  h.estados.push(estado);
  // 40 pasos son suficientes y evitan guardar megas durante una sesión larga.
  if (h.estados.length > 40) h.estados.shift();
  h.indice = h.estados.length - 1;
  actualizarBotonesHistorial();
}

function programarHistorial() {
  if (cargandoDiapositiva || aplicandoHistorial) return;
  clearTimeout(temporizadorHistorial);
  temporizadorHistorial = setTimeout(registrarEstadoAhora, 120);
}

function sincronizarHistorialAlCargar() {
  const diapositiva = diapositivas[indiceActual];
  if (!diapositiva || aplicandoHistorial) return;
  const estado = claveEstadoActual();
  const h = historiales.get(diapositiva.id);
  if (!h) {
    historiales.set(diapositiva.id, { estados: [estado], indice: 0 });
  } else if (h.estados[h.indice] !== estado) {
    h.estados = h.estados.slice(0, h.indice + 1);
    h.estados.push(estado);
    h.indice = h.estados.length - 1;
  }
  actualizarBotonesHistorial();
}

function aplicarEstadoHistorial(estado) {
  aplicandoHistorial = true;
  cargandoDiapositiva = true;
  lienzo.loadFromJSON(JSON.parse(estado), () => {
    lienzo.renderAll();
    detectarTemaAplicado();
    selectorFondo.value = rgbAHex(lienzo.backgroundColor) || "#ffffff";
    cargandoDiapositiva = false;
    aplicandoHistorial = false;
    hayCambiosSinGuardar = true;
    programarGuardado();
    actualizarBotonesHistorial();
  });
}

function deshacer() {
  clearTimeout(temporizadorHistorial);
  registrarEstadoAhora();
  const h = historialActual();
  if (!h || h.indice <= 0) return;
  h.indice -= 1;
  aplicarEstadoHistorial(h.estados[h.indice]);
}

function rehacer() {
  clearTimeout(temporizadorHistorial);
  const h = historialActual();
  if (!h || h.indice >= h.estados.length - 1) return;
  h.indice += 1;
  aplicarEstadoHistorial(h.estados[h.indice]);
}

document.getElementById("boton-deshacer").addEventListener("click", deshacer);
document.getElementById("boton-rehacer").addEventListener("click", rehacer);

// ---- Guías de alineación con "imán" (snap) ----
// Al mover un objeto, si un borde o su centro se acerca al centro del lienzo,
// a un borde del lienzo o a otro objeto, se pega y aparece una línea rosa.
// Es lo que hace que el editor se sienta profesional al usarlo.

const UMBRAL_SNAP = 6; // qué tan cerca (px) hay que estar para que se pegue
let guiasVisibles = [];

function bordesDe(objeto) {
  const r = objeto.getBoundingRect();
  return {
    izq: r.left, centroX: r.left + r.width / 2, der: r.left + r.width,
    arr: r.top, centroY: r.top + r.height / 2, aba: r.top + r.height,
  };
}

lienzo.on("object:moving", (evento) => {
  const objeto = evento.target;
  guiasVisibles = [];
  const b = bordesDe(objeto);

  // Puntos de referencia: bordes y centro del lienzo + los de los demás objetos.
  const activos = lienzo.getActiveObjects();
  const objetivosX = [0, ANCHO / 2, ANCHO];
  const objetivosY = [0, ALTO / 2, ALTO];
  lienzo.getObjects().forEach((otro) => {
    if (activos.includes(otro)) return;
    const o = bordesDe(otro);
    objetivosX.push(o.izq, o.centroX, o.der);
    objetivosY.push(o.arr, o.centroY, o.aba);
  });

  // Elegir el mejor "imán" para X (probando borde izq, centro y der del objeto).
  let mejorX = null;
  objetivosX.forEach((meta) => {
    [b.izq, b.centroX, b.der].forEach((valor) => {
      const distancia = Math.abs(valor - meta);
      if (distancia <= UMBRAL_SNAP && (!mejorX || distancia < mejorX.distancia)) {
        mejorX = { distancia, delta: meta - valor, linea: meta };
      }
    });
  });
  if (mejorX) {
    objeto.left += mejorX.delta;
    guiasVisibles.push({ tipo: "v", pos: mejorX.linea });
  }

  let mejorY = null;
  objetivosY.forEach((meta) => {
    [b.arr, b.centroY, b.aba].forEach((valor) => {
      const distancia = Math.abs(valor - meta);
      if (distancia <= UMBRAL_SNAP && (!mejorY || distancia < mejorY.distancia)) {
        mejorY = { distancia, delta: meta - valor, linea: meta };
      }
    });
  });
  if (mejorY) {
    objeto.top += mejorY.delta;
    guiasVisibles.push({ tipo: "h", pos: mejorY.linea });
  }

  objeto.setCoords();
});

lienzo.on("after:render", () => {
  if (!guiasVisibles.length) return;
  const ctx = lienzo.getSelectionContext();
  const retina = lienzo.getRetinaScaling();
  ctx.save();
  ctx.setTransform(retina, 0, 0, retina, 0, 0);
  ctx.strokeStyle = "#ec4899";
  ctx.lineWidth = 1;
  ctx.setLineDash([5, 5]);
  guiasVisibles.forEach((guia) => {
    ctx.beginPath();
    if (guia.tipo === "v") {
      ctx.moveTo(guia.pos, 0);
      ctx.lineTo(guia.pos, ALTO);
    } else {
      ctx.moveTo(0, guia.pos);
      ctx.lineTo(ANCHO, guia.pos);
    }
    ctx.stroke();
  });
  ctx.restore();
});

lienzo.on("mouse:up", () => {
  if (guiasVisibles.length) {
    guiasVisibles = [];
    lienzo.requestRenderAll();
  }
});

// ---- Utilidades de estilo ----

function rgbAHex(valor) {
  if (!valor || typeof valor !== "string") return null;
  if (valor.startsWith("#")) return valor;
  const m = valor.match(/(\d+),\s*(\d+),\s*(\d+)/);
  if (!m) return null;
  return "#" + [m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, "0")).join("");
}

function esTexto(objeto) {
  return objeto && ["i-text", "textbox", "text"].includes(objeto.type);
}

function aplicarAlSeleccionado(cambios) {
  const objeto = lienzo.getActiveObject();
  if (!objeto) return;
  objeto.set(cambios);
  lienzo.renderAll();
  programarGuardado();
}

function textoBase(texto, opciones) {
  return new fabric.Textbox(texto, {
    fontFamily: selectorFuente.value,
    fill: selectorColor.value,
    fontSize: Number(selectorTamano.value),
    ...opciones,
  });
}

// ---- Temas y plantillas ----
// Las plantillas viven en plantillas.js como listas de "piezas" (datos).
// Aquí sólo traducimos cada pieza a un objeto de Fabric usando los colores
// del tema activo, para que cualquier plantilla combine con cualquier tema.

let temaActivo = TEMAS[0];   // tema elegido en el modal (para vistas previas)
let temaAplicado = TEMAS[0]; // tema que realmente tiene la diapositiva actual

function colorDelTema(nombre, tema) {
  if (!nombre) return tema.texto;
  if (nombre.startsWith("#")) return nombre;
  return tema[nombre] || nombre;
}

function crearPieza(pieza, tema) {
  const relleno = colorDelTema(pieza.color, tema);
  if (pieza.tipo === "rect") {
    return new fabric.Rect({
      left: pieza.x, top: pieza.y, width: pieza.w, height: pieza.h,
      fill: relleno, opacity: pieza.opacidad ?? 1,
      rx: pieza.radio || 0, ry: pieza.radio || 0,
    });
  }
  if (pieza.tipo === "circulo") {
    return new fabric.Circle({
      left: pieza.x, top: pieza.y, radius: pieza.r,
      fill: relleno, opacity: pieza.opacidad ?? 1,
    });
  }
  if (pieza.tipo === "linea") {
    return new fabric.Rect({
      left: pieza.x, top: pieza.y, width: pieza.w, height: pieza.grosor,
      fill: relleno, rx: pieza.grosor / 2, ry: pieza.grosor / 2,
    });
  }
  return new fabric.Textbox(pieza.texto, {
    left: pieza.x, top: pieza.y, width: pieza.w,
    fontSize: pieza.tam,
    fontWeight: pieza.peso || "normal",
    fontStyle: pieza.cursiva ? "italic" : "normal",
    textAlign: pieza.alinear || "left",
    fill: colorDelTema(pieza.color || "texto", tema),
    opacity: pieza.opacidad ?? 1,
    fontFamily: pieza.fuente === "titulo" ? tema.fuenteTitulo : tema.fuenteCuerpo,
    lineHeight: 1.2,
  });
}

function aplicarPlantilla(plantilla, tema) {
  lienzo.clear();
  lienzo.backgroundColor = tema.fondo;
  plantilla.piezas.forEach((pieza) => lienzo.add(crearPieza(pieza, tema)));

  selectorFondo.value = tema.fondo;
  selectorColor.value = tema.texto;
  colorAcento = tema.acento;
  temaAplicado = tema;

  const primerTexto = lienzo.getObjects().find((objeto) => esTexto(objeto));
  if (primerTexto) lienzo.setActiveObject(primerTexto);
  lienzo.renderAll();
  programarGuardado();
}

// Cambia los colores de un objeto de un tema a otro, según su "papel".
// Ej.: lo que era del color de acento pasa al acento del tema nuevo.
function recolorearObjeto(objeto, viejo, nuevo) {
  const mapa = {
    [viejo.texto.toLowerCase()]: nuevo.texto,
    [viejo.acento.toLowerCase()]: nuevo.acento,
    [viejo.suave.toLowerCase()]: nuevo.suave,
    [viejo.claro.toLowerCase()]: nuevo.claro,
  };
  const traducir = (valor) => {
    const hex = (rgbAHex(valor) || "").toLowerCase();
    return mapa[hex] || valor;
  };
  if (objeto.type === "group") {
    objeto.getObjects().forEach((parte) => recolorearObjeto(parte, viejo, nuevo));
    return;
  }
  if (objeto.type === "line" && objeto.stroke) objeto.set("stroke", traducir(objeto.stroke));
  if (objeto.fill) objeto.set("fill", traducir(objeto.fill));
  if (esTexto(objeto)) {
    if (objeto.fontFamily === viejo.fuenteTitulo) objeto.set("fontFamily", nuevo.fuenteTitulo);
    else if (objeto.fontFamily === viejo.fuenteCuerpo) objeto.set("fontFamily", nuevo.fuenteCuerpo);
  }
}

// Al cargar una diapositiva no sabemos su tema; lo adivinamos por el fondo.
function detectarTemaAplicado() {
  const fondo = (rgbAHex(lienzo.backgroundColor) || "#ffffff").toLowerCase();
  temaAplicado = TEMAS.find((t) => t.fondo.toLowerCase() === fondo) || TEMAS[0];
}

function reaplicarTema(nuevo) {
  const viejo = temaAplicado;
  lienzo.getObjects().forEach((objeto) => recolorearObjeto(objeto, viejo, nuevo));
  lienzo.backgroundColor = nuevo.fondo;
  colorAcento = nuevo.acento;
  selectorFondo.value = nuevo.fondo;
  selectorColor.value = nuevo.texto;
  temaAplicado = nuevo;
  lienzo.renderAll();
  programarGuardado();
}

// ---- Galería visual de plantillas ----
// Cada tarjeta muestra la plantilla dibujada de verdad, con el tema elegido.

const galeria = document.getElementById("galeria-plantillas");
const listaTemas = document.getElementById("lista-temas");
const lienzoVistaPrevia = new fabric.StaticCanvas(document.createElement("canvas"), {
  width: ANCHO, height: ALTO,
});

function vistaPreviaPlantilla(plantilla, tema) {
  lienzoVistaPrevia.clear();
  lienzoVistaPrevia.backgroundColor = tema.fondo;
  plantilla.piezas.forEach((pieza) => lienzoVistaPrevia.add(crearPieza(pieza, tema)));
  lienzoVistaPrevia.renderAll();
  return lienzoVistaPrevia.toDataURL({ format: "jpeg", quality: 0.8, multiplier: 0.28 });
}

function dibujarGaleria() {
  galeria.innerHTML = "";
  PLANTILLAS.forEach((plantilla) => {
    const tarjeta = document.createElement("button");
    tarjeta.type = "button";
    tarjeta.className = "tarjeta-plantilla";

    const imagen = document.createElement("img");
    imagen.src = vistaPreviaPlantilla(plantilla, temaActivo);
    imagen.alt = plantilla.nombre;

    const nombre = document.createElement("span");
    nombre.className = "nombre-plantilla";
    nombre.textContent = plantilla.nombre;

    tarjeta.append(imagen, nombre);
    tarjeta.addEventListener("click", () => {
      const hayContenido = lienzo.getObjects().length > 0;
      if (hayContenido && !confirm(`¿Reemplazar esta diapositiva por la plantilla «${plantilla.nombre}»?`)) return;
      aplicarPlantilla(plantilla, temaActivo);
      modalPlantillas.hide();
    });
    galeria.appendChild(tarjeta);
  });
}

function dibujarTemas() {
  listaTemas.innerHTML = "";
  TEMAS.forEach((tema) => {
    const boton = document.createElement("button");
    boton.type = "button";
    boton.className = "chip-tema" + (tema.id === temaActivo.id ? " activo" : "");
    boton.style.background = tema.fondo;
    boton.style.color = tema.texto;

    const punto = document.createElement("span");
    punto.className = "punto-acento";
    punto.style.background = tema.acento;

    boton.append(punto, document.createTextNode(tema.nombre));
    boton.addEventListener("click", () => {
      temaActivo = tema;
      dibujarTemas();
      dibujarGaleria();
    });
    listaTemas.appendChild(boton);
  });
}

const modalPlantillas = new bootstrap.Modal(document.getElementById("modal-plantillas"));
document.getElementById("boton-plantillas").addEventListener("click", async () => {
  // Sin esperar las tipografías, Fabric mide el texto con la fuente de repuesto.
  await document.fonts.ready;
  dibujarTemas();
  dibujarGaleria();
  modalPlantillas.show();
});

// Cambiar sólo el tema de la diapositiva actual: recolorea lo que ya está.
document.getElementById("boton-aplicar-tema").addEventListener("click", () => {
  reaplicarTema(temaActivo);
  modalPlantillas.hide();
});

// ---- Galería de iconos (Bootstrap Icons, licencia MIT) ----

const galeriaIconos = document.getElementById("galeria-iconos");
const modalIconos = new bootstrap.Modal(document.getElementById("modal-iconos"));

async function insertarIcono(nombre) {
  const respuesta = await fetch(`https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/icons/${nombre}.svg`);
  const svg = await respuesta.text();
  fabric.loadSVGFromString(svg, (objetos, opciones) => {
    const icono = fabric.util.groupSVGElements(objetos, opciones);
    icono.set({ left: 380, top: 200, fill: selectorColor.value });
    icono.scaleToWidth(120);
    lienzo.add(icono);
    lienzo.setActiveObject(icono);
    lienzo.renderAll();
    programarGuardado();
  });
}

document.getElementById("boton-iconos").addEventListener("click", () => {
  if (!galeriaIconos.childElementCount) {
    ICONOS.forEach((nombre) => {
      const boton = document.createElement("button");
      boton.type = "button";
      boton.className = "boton-icono";
      boton.title = nombre.replace(/-/g, " ");
      boton.innerHTML = `<i class="bi bi-${nombre}"></i>`;
      boton.addEventListener("click", () => {
        insertarIcono(nombre);
        modalIconos.hide();
      });
      galeriaIconos.appendChild(boton);
    });
  }
  modalIconos.show();
});

// ---- Barra por categorías ----
// Cada pestaña muestra su panel de opciones y esconde los demás.

document.querySelectorAll(".cat-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".cat-tab").forEach((t) => t.classList.remove("activa"));
    tab.classList.add("activa");
    document.querySelectorAll(".panel-categoria").forEach((panel) => {
      panel.classList.toggle("d-none", panel.dataset.panel !== tab.dataset.cat);
    });
  });
});

// ---- Insertar texto ----
// Cada objeto nuevo se coloca en el centro con un pequeño desplazamiento
// para que no queden todos apilados exactamente en el mismo punto.

let desfaseNuevo = 0;
function posicionNueva(ancho, alto) {
  const paso = (desfaseNuevo % 5) * 18;
  desfaseNuevo += 1;
  return { left: (ANCHO - ancho) / 2 + paso, top: (ALTO - alto) / 2 + paso };
}

function agregarObjeto(objeto) {
  lienzo.add(objeto);
  lienzo.setActiveObject(objeto);
  lienzo.renderAll();
}

document.getElementById("boton-titulo").addEventListener("click", () => {
  const pos = posicionNueva(600, 60);
  agregarObjeto(textoBase("Título grande", {
    ...pos, width: 600, fontSize: 54, fontWeight: "bold", fontFamily: "Poppins",
  }));
});

document.getElementById("boton-subtitulo").addEventListener("click", () => {
  const pos = posicionNueva(560, 40);
  agregarObjeto(textoBase("Subtítulo o idea secundaria", {
    ...pos, width: 560, fontSize: 34, fontFamily: "Poppins", fill: "#475569",
  }));
});

document.getElementById("boton-texto").addEventListener("click", () => {
  const pos = posicionNueva(400, 40);
  agregarObjeto(textoBase("Escribe aquí", {
    ...pos, width: 400, fontSize: Number(selectorTamano.value),
  }));
});

document.getElementById("boton-rectangulo").addEventListener("click", () => {
  lienzo.add(new fabric.Rect({
    left: 120, top: 120, width: 240, height: 140,
    fill: selectorColor.value, rx: 8, ry: 8,
  }));
});

document.getElementById("boton-circulo").addEventListener("click", () => {
  lienzo.add(new fabric.Circle({ left: 150, top: 150, radius: 70, fill: selectorColor.value }));
});

document.getElementById("boton-triangulo").addEventListener("click", () => {
  lienzo.add(new fabric.Triangle({ left: 180, top: 140, width: 160, height: 140, fill: selectorColor.value }));
});

document.getElementById("boton-linea").addEventListener("click", () => {
  lienzo.add(new fabric.Line([100, 220, 400, 220], {
    stroke: selectorColor.value, strokeWidth: 5,
  }));
});

document.getElementById("boton-flecha").addEventListener("click", () => {
  // Flecha = línea + triángulo agrupados (sigue siendo Fabric puro).
  const linea = new fabric.Line([0, 20, 180, 20], {
    stroke: selectorColor.value, strokeWidth: 6,
  });
  const punta = new fabric.Triangle({
    left: 170, top: 5, width: 30, height: 30, angle: 90, fill: selectorColor.value,
  });
  const flecha = new fabric.Group([linea, punta], { left: 140, top: 200 });
  lienzo.add(flecha);
  lienzo.setActiveObject(flecha);
});

document.getElementById("boton-imagen").addEventListener("click", () => {
  const url = prompt("Pega la URL de la imagen:");
  if (!url) return;
  fabric.Image.fromURL(url, (imagen) => {
    imagen.scaleToWidth(320);
    imagen.set({ left: 120, top: 100 });
    lienzo.add(imagen);
    lienzo.setActiveObject(imagen);
  }, { crossOrigin: "anonymous" });
});

document.getElementById("entrada-imagen-archivo").addEventListener("change", (evento) => {
  const archivo = evento.target.files[0];
  if (!archivo) return;
  const lector = new FileReader();
  lector.onload = () => {
    fabric.Image.fromURL(lector.result, (imagen) => {
      imagen.scaleToWidth(320);
      imagen.set({ left: 120, top: 100 });
      lienzo.add(imagen);
      lienzo.setActiveObject(imagen);
    });
  };
  lector.readAsDataURL(archivo);
  evento.target.value = "";
});

// ---- Componentes ----
// Bloques listos (tarjeta, estadística, etc.) definidos como piezas, igual que
// las plantillas, pero SIN borrar la diapositiva: se agregan donde haya lugar.
// Los textos quedan sueltos a propósito, para poder editarlos al instante.

const COMPONENTES = {
  tarjeta: [
    { tipo: "rect", x: 0, y: 0, w: 300, h: 200, color: "suave", radio: 16 },
    { tipo: "texto", texto: "Título", x: 24, y: 26, w: 252, tam: 28, peso: "bold" },
    { tipo: "texto", texto: "Escribe aquí una descripción corta.", x: 24, y: 78, w: 252, tam: 18 },
  ],
  destacado: [
    { tipo: "rect", x: 0, y: 0, w: 420, h: 120, color: "acento", radio: 14 },
    { tipo: "texto", texto: "💡 Idea importante que quieras resaltar", x: 24, y: 34, w: 372, tam: 24, peso: "bold", color: "claro" },
  ],
  estadistica: [
    { tipo: "texto", texto: "100%", x: 0, y: 0, w: 240, tam: 72, peso: "bold", color: "acento", alinear: "center", fuente: "titulo" },
    { tipo: "texto", texto: "explica el dato aquí", x: 0, y: 96, w: 240, tam: 20, alinear: "center" },
  ],
  "viñeta": [
    { tipo: "circulo", x: 0, y: 8, r: 9, color: "acento" },
    { tipo: "texto", texto: "Punto de la lista", x: 34, y: 0, w: 360, tam: 26 },
  ],
  paso: [
    { tipo: "circulo", x: 0, y: 0, r: 26, color: "acento" },
    { tipo: "texto", texto: "1", x: 0, y: 12, w: 52, tam: 26, peso: "bold", color: "claro", alinear: "center" },
    { tipo: "texto", texto: "Describe este paso", x: 70, y: 8, w: 320, tam: 24, peso: "bold" },
  ],
  boton: [
    { tipo: "rect", x: 0, y: 0, w: 200, h: 60, color: "acento", radio: 30 },
    { tipo: "texto", texto: "Botón", x: 0, y: 16, w: 200, tam: 24, peso: "bold", color: "claro", alinear: "center" },
  ],
};

function insertarComponente(nombre) {
  const piezas = COMPONENTES[nombre];
  if (!piezas) return;
  const anchoAprox = Math.max(...piezas.map((p) => p.x + (p.w || p.r * 2 || 0)));
  const altoAprox = Math.max(...piezas.map((p) => p.y + (p.h || p.r * 2 || p.tam || 0)));
  const base = posicionNueva(anchoAprox, altoAprox);

  const creados = piezas.map((pieza) => crearPieza(
    { ...pieza, x: pieza.x + base.left, y: pieza.y + base.top },
    temaActivo,
  ));
  creados.forEach((objeto) => lienzo.add(objeto));

  // Dejar los objetos del componente seleccionados juntos.
  const seleccion = new fabric.ActiveSelection(creados, { canvas: lienzo });
  lienzo.setActiveObject(seleccion);
  lienzo.renderAll();
  programarGuardado();
}

document.querySelectorAll(".comp").forEach((boton) => {
  boton.addEventListener("click", () => insertarComponente(boton.dataset.comp));
});

// ---- Estilo del objeto seleccionado ----

selectorColor.addEventListener("input", () => {
  const objeto = lienzo.getActiveObject();
  if (!objeto) return;
  if (objeto.type === "line") objeto.set("stroke", selectorColor.value);
  else if (objeto.type === "group") {
    objeto.getObjects().forEach((parte) => {
      if (parte.type === "line") parte.set("stroke", selectorColor.value);
      else parte.set("fill", selectorColor.value);
    });
  } else {
    objeto.set("fill", selectorColor.value);
  }
  lienzo.renderAll();
  programarGuardado();
});

selectorFondo.addEventListener("input", () => {
  lienzo.backgroundColor = selectorFondo.value;
  lienzo.renderAll();
  programarGuardado();
});

selectorTamano.addEventListener("change", () => {
  const objeto = lienzo.getActiveObject();
  if (esTexto(objeto)) aplicarAlSeleccionado({ fontSize: Number(selectorTamano.value) });
});

selectorFuente.addEventListener("change", () => {
  const objeto = lienzo.getActiveObject();
  if (esTexto(objeto)) aplicarAlSeleccionado({ fontFamily: selectorFuente.value });
});

document.getElementById("boton-negrita").addEventListener("click", () => {
  const objeto = lienzo.getActiveObject();
  if (!esTexto(objeto)) return;
  aplicarAlSeleccionado({ fontWeight: objeto.fontWeight === "bold" ? "normal" : "bold" });
});

document.getElementById("boton-cursiva").addEventListener("click", () => {
  const objeto = lienzo.getActiveObject();
  if (!esTexto(objeto)) return;
  aplicarAlSeleccionado({ fontStyle: objeto.fontStyle === "italic" ? "normal" : "italic" });
});

document.getElementById("boton-alinear-izq").addEventListener("click", () => {
  if (esTexto(lienzo.getActiveObject())) aplicarAlSeleccionado({ textAlign: "left" });
});
document.getElementById("boton-alinear-centro").addEventListener("click", () => {
  if (esTexto(lienzo.getActiveObject())) aplicarAlSeleccionado({ textAlign: "center" });
});
document.getElementById("boton-alinear-der").addEventListener("click", () => {
  if (esTexto(lienzo.getActiveObject())) aplicarAlSeleccionado({ textAlign: "right" });
});

document.getElementById("boton-adelante").addEventListener("click", () => {
  const objeto = lienzo.getActiveObject();
  if (!objeto) return;
  lienzo.bringToFront(objeto);
  lienzo.renderAll();
  programarGuardado();
});

document.getElementById("boton-atras").addEventListener("click", () => {
  const objeto = lienzo.getActiveObject();
  if (!objeto) return;
  lienzo.sendToBack(objeto);
  lienzo.renderAll();
  programarGuardado();
});

function eliminarSeleccion() {
  lienzo.getActiveObjects().forEach((objeto) => lienzo.remove(objeto));
  lienzo.discardActiveObject();
  lienzo.renderAll();
}

document.getElementById("boton-eliminar-objeto").addEventListener("click", eliminarSeleccion);

// ---- Duplicar, copiar, pegar y bloquear ----

let portapapelesObjetos = null;

function clonarSeleccion(alClonar) {
  const seleccionado = lienzo.getActiveObject();
  if (!seleccionado) return;
  seleccionado.clone(alClonar, PROPS_EXTRA);
}

function pegarClon(clon) {
  clon.clone((pegado) => {
    lienzo.discardActiveObject();
    pegado.set({
      left: (pegado.left || 0) + 18,
      top: (pegado.top || 0) + 18,
      evented: true,
    });
    if (pegado.type === "activeSelection") {
      pegado.canvas = lienzo;
      pegado.forEachObject((objeto) => lienzo.add(objeto));
      pegado.setCoords();
    } else {
      lienzo.add(pegado);
    }
    lienzo.setActiveObject(pegado);
    lienzo.requestRenderAll();
    programarHistorial();
  }, PROPS_EXTRA);
}

function copiarSeleccion() {
  clonarSeleccion((clon) => {
    portapapelesObjetos = clon;
  });
}

function pegarSeleccion() {
  if (portapapelesObjetos) pegarClon(portapapelesObjetos);
}

function duplicarSeleccion() {
  clonarSeleccion((clon) => pegarClon(clon));
}

function bloquearSeleccion() {
  const objetos = lienzo.getActiveObjects();
  if (!objetos.length) return;
  const bloquear = !objetos.every((objeto) => objeto.vuraBloqueado);
  objetos.forEach((objeto) => {
    objeto.set({
      vuraBloqueado: bloquear,
      lockMovementX: bloquear,
      lockMovementY: bloquear,
      lockScalingX: bloquear,
      lockScalingY: bloquear,
      lockRotation: bloquear,
      hasControls: !bloquear,
    });
  });
  lienzo.requestRenderAll();
  programarGuardado();
  programarHistorial();
  actualizarBotonBloqueo();
}

function actualizarBotonBloqueo() {
  const boton = document.getElementById("boton-bloquear");
  const objetos = lienzo.getActiveObjects();
  const bloqueados = objetos.length && objetos.every((objeto) => objeto.vuraBloqueado);
  boton.textContent = bloqueados ? "🔒 Desbloquear" : "🔓 Bloquear";
  boton.disabled = !objetos.length;
}

document.getElementById("boton-duplicar-objeto").addEventListener("click", duplicarSeleccion);
document.getElementById("boton-bloquear").addEventListener("click", bloquearSeleccion);

// ---- Panel de estilo contextual ----
// Muestra sólo los controles que sirven para lo que está seleccionado.

const pistaSeleccion = document.getElementById("pista-seleccion");
const controlesTexto = document.querySelector(".estilo-texto");
const controlesObjeto = document.querySelector(".estilo-objeto");
const botonNegrita = document.getElementById("boton-negrita");
const botonCursiva = document.getElementById("boton-cursiva");

function actualizarEstiloContextual() {
  const objeto = lienzo.getActiveObject();
  const hayObjeto = !!objeto;
  const esTextoSel = esTexto(objeto);

  pistaSeleccion.classList.toggle("d-none", hayObjeto);
  controlesObjeto.classList.toggle("d-none", !hayObjeto);
  controlesTexto.classList.toggle("d-none", !esTextoSel);

  if (esTextoSel) {
    // Sincroniza los controles con el texto elegido.
    if (objeto.fontFamily) selectorFuente.value = objeto.fontFamily;
    if (objeto.fontSize) selectorTamano.value = String(Math.round(objeto.fontSize));
    botonNegrita.classList.toggle("active", objeto.fontWeight === "bold");
    botonCursiva.classList.toggle("active", objeto.fontStyle === "italic");
  }
  if (hayObjeto) {
    const color = objeto.fill || objeto.stroke;
    if (typeof color === "string" && /^#[0-9a-fA-F]{6}$/.test(color)) {
      document.getElementById("selector-color").value = color;
    }
  }
}

function alCambiarSeleccion() {
  actualizarBotonBloqueo();
  actualizarEstiloContextual();
}

lienzo.on("selection:created", alCambiarSeleccion);
lienzo.on("selection:updated", alCambiarSeleccion);
lienzo.on("selection:cleared", alCambiarSeleccion);
alCambiarSeleccion();

// ---- Atajos de teclado ----

document.addEventListener("keydown", (evento) => {
  if (presentando) return;
  const objeto = lienzo.getActiveObject();
  const escribiendo = (objeto && objeto.isEditing)
    || ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName);
  if (escribiendo) return;

  const modificador = evento.ctrlKey || evento.metaKey;
  const tecla = evento.key.toLowerCase();

  if (modificador && tecla === "z") {
    evento.preventDefault();
    if (evento.shiftKey) rehacer();
    else deshacer();
    return;
  }
  if (modificador && tecla === "y") {
    evento.preventDefault();
    rehacer();
    return;
  }
  if (modificador && tecla === "c" && objeto) {
    evento.preventDefault();
    copiarSeleccion();
    return;
  }
  if (modificador && tecla === "v" && portapapelesObjetos) {
    evento.preventDefault();
    pegarSeleccion();
    return;
  }
  if (modificador && tecla === "d" && objeto) {
    evento.preventDefault();
    duplicarSeleccion();
    return;
  }
  if ((evento.key === "Delete" || evento.key === "Backspace") && objeto) {
    evento.preventDefault();
    eliminarSeleccion();
    return;
  }
  if (evento.key === "Escape" && objeto) {
    lienzo.discardActiveObject();
    lienzo.requestRenderAll();
    return;
  }

  // Las flechas mueven 1 px; con Shift, 10 px.
  if (objeto && !lienzo.getActiveObjects().some((item) => item.vuraBloqueado)
      && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(evento.key)) {
    evento.preventDefault();
    const paso = evento.shiftKey ? 10 : 1;
    if (evento.key === "ArrowLeft") objeto.left -= paso;
    if (evento.key === "ArrowRight") objeto.left += paso;
    if (evento.key === "ArrowUp") objeto.top -= paso;
    if (evento.key === "ArrowDown") objeto.top += paso;
    objeto.setCoords();
    lienzo.requestRenderAll();
    programarGuardado();
    programarHistorial();
  }
});

// ---- Menú de clic derecho ----

const menuContextual = document.getElementById("menu-contextual");

function traerAlFrente() {
  const objeto = lienzo.getActiveObject();
  if (!objeto) return;
  lienzo.bringToFront(objeto);
  lienzo.renderAll();
  programarGuardado();
}

function enviarAtras() {
  const objeto = lienzo.getActiveObject();
  if (!objeto) return;
  lienzo.sendToBack(objeto);
  lienzo.renderAll();
  programarGuardado();
}

function cerrarMenuContextual() {
  menuContextual.classList.remove("abierto");
}

// El lienzo de Fabric dispara su propio evento de clic derecho.
lienzo.on("mouse:down", (evento) => {
  if (evento.e.button !== 2) return; // sólo botón derecho
  evento.e.preventDefault();
  const objeto = evento.target;
  if (!objeto) {
    cerrarMenuContextual();
    return;
  }
  if (lienzo.getActiveObject() !== objeto) lienzo.setActiveObject(objeto);
  lienzo.renderAll();
  menuContextual.style.left = evento.e.clientX + "px";
  menuContextual.style.top = evento.e.clientY + "px";
  menuContextual.classList.add("abierto");
  actualizarBotonBloqueo();
});

// Evita el menú del navegador sobre el área del lienzo.
document.querySelector(".marco-lienzo").addEventListener("contextmenu", (e) => e.preventDefault());

menuContextual.addEventListener("click", (evento) => {
  const accion = evento.target.dataset.accion;
  if (!accion) return;
  if (accion === "duplicar") duplicarSeleccion();
  else if (accion === "copiar") copiarSeleccion();
  else if (accion === "bloquear") bloquearSeleccion();
  else if (accion === "frente") traerAlFrente();
  else if (accion === "atras") enviarAtras();
  else if (accion === "borrar") eliminarSeleccion();
  cerrarMenuContextual();
});

document.addEventListener("mousedown", (evento) => {
  // El clic derecho es el que ABRE el menú; sólo cerramos con otros clics.
  if (evento.button === 2) return;
  if (!menuContextual.contains(evento.target)) cerrarMenuContextual();
});
window.addEventListener("scroll", cerrarMenuContextual, true);

// ---- Gestión de diapositivas ----

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
  const copia = { id: nueva.id, contenido: serializarLienzo() };
  diapositivas.splice(indiceActual + 1, 0, copia);
  publicarDiapositiva(copia);
  publicarOrden();
  generarMiniatura(copia);
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

// ---- Zoom de la vista del editor ----
// Sólo cambia cómo se ve el lienzo; las posiciones reales y la exportación
// siguen siendo 960×540.

function cambiarZoom(delta) {
  zoomAjustado = false;
  escalaEditor = Math.max(0.25, Math.min(2, escalaEditor + delta));
  ajustarEscalaEditor();
}

document.getElementById("boton-zoom-menos").addEventListener("click", () => cambiarZoom(-0.1));
document.getElementById("boton-zoom-mas").addEventListener("click", () => cambiarZoom(0.1));
document.getElementById("boton-zoom-ajustar").addEventListener("click", () => {
  zoomAjustado = true;
  ajustarEscalaEditor();
});

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

const capaPresentacion = document.getElementById("modo-presentacion");
const contadorPresentacion = document.getElementById("contador-presentacion");
const barraProgreso = document.getElementById("barra-progreso-presentacion");
const canvasPresentacion = document.getElementById("lienzo-presentacion");
const lienzoPresentacion = new fabric.StaticCanvas("lienzo-presentacion");
let indicePresentacion = 0;
let presentando = false;

function ajustarTamanoPresentacion() {
  const escala = Math.min(window.innerWidth / ANCHO, window.innerHeight / ALTO) * 0.96;
  // El canvas de Fabric vive dentro de .canvas-container.
  const contenedor = canvasPresentacion.closest(".canvas-container") || canvasPresentacion;
  contenedor.style.transform = `scale(${escala})`;
  contenedor.style.transformOrigin = "center center";
}

function actualizarProgreso() {
  contadorPresentacion.textContent = `${indicePresentacion + 1} / ${diapositivas.length}`;
  const porcentaje = ((indicePresentacion + 1) / diapositivas.length) * 100;
  barraProgreso.style.width = porcentaje + "%";
}

const notasPresentacion = document.getElementById("notas-presentacion");
const relojPresentacion = document.getElementById("reloj-presentacion");
let notasVisibles = false;
let saltoTecleado = ""; // número que se va escribiendo para saltar de diapositiva
let temporizadorReloj = null;
let segundosPresentando = 0;

function actualizarReloj() {
  const minutos = String(Math.floor(segundosPresentando / 60)).padStart(2, "0");
  const segundos = String(segundosPresentando % 60).padStart(2, "0");
  relojPresentacion.textContent = `⏱ ${minutos}:${segundos}`;
}

function mostrarNotasActuales() {
  notasPresentacion.textContent = diapositivas[indicePresentacion].notas || "";
}

function mostrarDiapositivaPresentacion(indice) {
  // Fade corto: oculta, carga, muestra.
  canvasPresentacion.classList.add("ocultando");
  setTimeout(() => {
    indicePresentacion = indice;
    const contenido = diapositivas[indice].contenido;
    lienzoPresentacion.clear();
    lienzoPresentacion.backgroundColor = "#ffffff";
    const terminar = () => {
      lienzoPresentacion.renderAll();
      actualizarProgreso();
      mostrarNotasActuales();
      canvasPresentacion.classList.remove("ocultando");
    };
    if (contenido) {
      lienzoPresentacion.loadFromJSON(contenido, terminar);
    } else {
      terminar();
    }
  }, 140);
}

document.getElementById("boton-presentar").addEventListener("click", async () => {
  await guardarAhora();
  presentando = true;
  capaPresentacion.classList.add("activo");
  ajustarTamanoPresentacion();
  mostrarDiapositivaPresentacion(indiceActual);
  segundosPresentando = 0;
  actualizarReloj();
  clearInterval(temporizadorReloj);
  temporizadorReloj = setInterval(() => { segundosPresentando += 1; actualizarReloj(); }, 1000);
  if (capaPresentacion.requestFullscreen) {
    capaPresentacion.requestFullscreen().catch(() => {});
  }
});

function salirDePresentacion() {
  presentando = false;
  capaPresentacion.classList.remove("activo");
  canvasPresentacion.classList.remove("ocultando");
  clearInterval(temporizadorReloj);
  if (document.fullscreenElement) document.exitFullscreen();
}

function alternarNotasPresentacion() {
  notasVisibles = !notasVisibles;
  notasPresentacion.classList.toggle("oculto", !notasVisibles);
}

function intentarSalto() {
  const numero = Number(saltoTecleado);
  saltoTecleado = "";
  if (numero >= 1 && numero <= diapositivas.length) {
    mostrarDiapositivaPresentacion(numero - 1);
  }
}

document.addEventListener("keydown", (evento) => {
  if (!presentando) return;
  if (evento.key >= "0" && evento.key <= "9") {
    // Se van juntando los dígitos; Enter confirma el salto.
    saltoTecleado = (saltoTecleado + evento.key).slice(-3);
    return;
  }
  if (evento.key === "Enter") {
    evento.preventDefault();
    intentarSalto();
    return;
  }
  saltoTecleado = "";
  if (evento.key === "ArrowRight" || evento.key === " " || evento.key === "PageDown") {
    evento.preventDefault();
    if (indicePresentacion < diapositivas.length - 1) mostrarDiapositivaPresentacion(indicePresentacion + 1);
  } else if (evento.key === "ArrowLeft" || evento.key === "PageUp") {
    evento.preventDefault();
    if (indicePresentacion > 0) mostrarDiapositivaPresentacion(indicePresentacion - 1);
  } else if (evento.key === "Home") {
    mostrarDiapositivaPresentacion(0);
  } else if (evento.key === "End") {
    mostrarDiapositivaPresentacion(diapositivas.length - 1);
  } else if (evento.key === "n" || evento.key === "N") {
    alternarNotasPresentacion();
  } else if (evento.key === "Escape") {
    salirDePresentacion();
  }
});

document.addEventListener("fullscreenchange", () => {
  if (!document.fullscreenElement && presentando) salirDePresentacion();
});

capaPresentacion.addEventListener("click", (evento) => {
  // Clic derecho no avanza; clic en la ayuda tampoco.
  if (evento.target.closest("#ayuda-presentacion")) return;
  if (indicePresentacion < diapositivas.length - 1) {
    mostrarDiapositivaPresentacion(indicePresentacion + 1);
  } else {
    salirDePresentacion();
  }
});

window.addEventListener("resize", () => {
  ajustarEscalaEditor();
  if (presentando) ajustarTamanoPresentacion();
});

window.addEventListener("beforeunload", (evento) => {
  if (hayCambiosSinGuardar) evento.preventDefault();
});

// ---- Arranque ----

diapositivas.forEach((d) => generarMiniatura(d));
cargarDiapositiva(0);
