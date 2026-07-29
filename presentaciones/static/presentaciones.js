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
const selectorFuente = document.getElementById("selector-fuente");

const ANCHO = 960;
const ALTO = 540;
const lienzo = new fabric.Canvas("lienzo", {
  backgroundColor: "#ffffff",
  preserveObjectStacking: true,
  selection: true,
});

// En pantallas chicas el lienzo se ve a escala, sin cambiar sus 960×540 reales.
const marcoLienzo = document.querySelector(".marco-lienzo");
function ajustarEscalaEditor() {
  if (!marcoLienzo) return;
  const padre = marcoLienzo.parentElement;
  const escala = Math.min(1, (padre.clientWidth - 8) / ANCHO);
  marcoLienzo.style.transformOrigin = "top left";
  marcoLienzo.style.transform = `scale(${escala})`;
  padre.style.height = `${ALTO * escala + 8}px`;
}
ajustarEscalaEditor();

// diapositivas = [{ id, contenido }] en el orden actual.
let diapositivas = diapositivasIniciales.map((d) => ({ id: d.id, contenido: d.contenido }));
let indiceActual = 0;
let cargandoDiapositiva = false;
let temporizadorGuardado = null;
let hayCambiosSinGuardar = false;
let colorAcento = "#8b5cf6";

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
    numero.textContent = "Diapositiva " + (indice + 1);

    boton.append(imagen, numero);
    boton.addEventListener("click", async () => {
      await guardarAhora();
      cargarDiapositiva(indice);
    });
    panelDiapositivas.appendChild(boton);
  });
}

// ---- Cargar y guardar ----

function cargarDiapositiva(indice) {
  cargandoDiapositiva = true;
  indiceActual = indice;
  const contenido = diapositivas[indice].contenido;
  lienzo.clear();
  lienzo.backgroundColor = "#ffffff";
  if (contenido) {
    lienzo.loadFromJSON(contenido, () => {
      lienzo.renderAll();
      selectorFondo.value = rgbAHex(lienzo.backgroundColor) || "#ffffff";
      cargandoDiapositiva = false;
    });
  } else {
    lienzo.renderAll();
    selectorFondo.value = "#ffffff";
    cargandoDiapositiva = false;
  }
  dibujarPanel();
}

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

// ---- Plantillas ----
// Cada plantilla limpia la diapositiva y deja un diseño listo para editar.
// Son composiciones simples de objetos de Fabric (fácil de explicar en la feria).

function limpiarYFondo(fondo) {
  lienzo.clear();
  lienzo.backgroundColor = fondo || selectorFondo.value || "#ffffff";
  selectorFondo.value = rgbAHex(lienzo.backgroundColor) || "#ffffff";
}

function aplicarPlantillaPortada() {
  limpiarYFondo(selectorFondo.value);
  const banda = new fabric.Rect({
    left: 0, top: 360, width: ANCHO, height: 180,
    fill: colorAcento, selectable: true,
  });
  const titulo = textoBase("Título de la presentación", {
    left: 60, top: 400, width: 840, fontSize: 56, fontWeight: "bold", fill: "#ffffff",
  });
  const subtitulo = textoBase("Subtítulo · nombres del equipo", {
    left: 60, top: 475, width: 840, fontSize: 28, fill: "#ffffff",
  });
  const decoracion = new fabric.Circle({
    left: 720, top: 40, radius: 90, fill: colorAcento, opacity: 0.25,
  });
  lienzo.add(decoracion, banda, titulo, subtitulo);
  lienzo.setActiveObject(titulo);
  lienzo.renderAll();
  programarGuardado();
}

function aplicarPlantillaLista() {
  limpiarYFondo(selectorFondo.value);
  const barra = new fabric.Rect({
    left: 0, top: 0, width: 18, height: ALTO, fill: colorAcento,
  });
  const titulo = textoBase("Tema de la diapositiva", {
    left: 60, top: 40, width: 840, fontSize: 42, fontWeight: "bold",
  });
  const items = [
    "• Primer punto importante",
    "• Segundo punto importante",
    "• Tercer punto importante",
    "• Cuarto punto (opcional)",
  ];
  lienzo.add(barra, titulo);
  items.forEach((item, i) => {
    lienzo.add(textoBase(item, {
      left: 70, top: 130 + i * 70, width: 820, fontSize: 30,
    }));
  });
  lienzo.setActiveObject(titulo);
  lienzo.renderAll();
  programarGuardado();
}

function aplicarPlantillaColumnas() {
  limpiarYFondo(selectorFondo.value);
  const titulo = textoBase("Comparación / ideas", {
    left: 50, top: 30, width: 860, fontSize: 40, fontWeight: "bold", textAlign: "center",
  });
  const cajaIzq = new fabric.Rect({
    left: 50, top: 110, width: 400, height: 360,
    fill: colorAcento, opacity: 0.12, rx: 12, ry: 12,
  });
  const cajaDer = new fabric.Rect({
    left: 510, top: 110, width: 400, height: 360,
    fill: colorAcento, opacity: 0.12, rx: 12, ry: 12,
  });
  const colIzq = textoBase("Columna A\n\n• Idea 1\n• Idea 2\n• Idea 3", {
    left: 70, top: 130, width: 360, fontSize: 26,
  });
  const colDer = textoBase("Columna B\n\n• Idea 1\n• Idea 2\n• Idea 3", {
    left: 530, top: 130, width: 360, fontSize: 26,
  });
  lienzo.add(titulo, cajaIzq, cajaDer, colIzq, colDer);
  lienzo.setActiveObject(titulo);
  lienzo.renderAll();
  programarGuardado();
}

function aplicarPlantillaCita() {
  limpiarYFondo(selectorFondo.value);
  const comillas = textoBase("“", {
    left: 60, top: 80, width: 120, fontSize: 140, fill: colorAcento, fontFamily: "Georgia",
  });
  const cita = textoBase("Escribe aquí una idea clave\no una conclusión del equipo.", {
    left: 120, top: 180, width: 720, fontSize: 40, fontStyle: "italic", textAlign: "center",
  });
  const autor = textoBase("— Nombre o fuente", {
    left: 120, top: 420, width: 720, fontSize: 24, textAlign: "right", fill: "#64748b",
  });
  lienzo.add(comillas, cita, autor);
  lienzo.setActiveObject(cita);
  lienzo.renderAll();
  programarGuardado();
}

document.getElementById("plantilla-portada").addEventListener("click", () => {
  if (lienzo.getObjects().length && !confirm("¿Reemplazar el contenido de esta diapositiva por la plantilla Portada?")) return;
  aplicarPlantillaPortada();
});
document.getElementById("plantilla-lista").addEventListener("click", () => {
  if (lienzo.getObjects().length && !confirm("¿Reemplazar el contenido por la plantilla Lista?")) return;
  aplicarPlantillaLista();
});
document.getElementById("plantilla-columnas").addEventListener("click", () => {
  if (lienzo.getObjects().length && !confirm("¿Reemplazar el contenido por la plantilla 2 columnas?")) return;
  aplicarPlantillaColumnas();
});
document.getElementById("plantilla-cita").addEventListener("click", () => {
  if (lienzo.getObjects().length && !confirm("¿Reemplazar el contenido por la plantilla Cita?")) return;
  aplicarPlantillaCita();
});

// Temas rápidos de fondo + color de acento para las plantillas.
document.querySelectorAll(".tema-fondo").forEach((boton) => {
  boton.addEventListener("click", () => {
    document.querySelectorAll(".tema-fondo").forEach((b) => b.classList.remove("activo"));
    boton.classList.add("activo");
    colorAcento = boton.dataset.acento;
    selectorFondo.value = boton.dataset.fondo;
    selectorColor.value = boton.dataset.fondo === "#0f172a" ? "#ffffff" : "#1e293b";
    lienzo.backgroundColor = boton.dataset.fondo;
    lienzo.renderAll();
    programarGuardado();
  });
});

// ---- Insertar objetos ----

document.getElementById("boton-texto").addEventListener("click", () => {
  const texto = textoBase("Escribe aquí", {
    left: 100, top: 100, width: 400, fontSize: Number(selectorTamano.value),
  });
  lienzo.add(texto);
  lienzo.setActiveObject(texto);
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

document.addEventListener("keydown", (evento) => {
  if (presentando) return;
  if (evento.key !== "Delete" && evento.key !== "Backspace") return;
  const objeto = lienzo.getActiveObject();
  const escribiendo = (objeto && objeto.isEditing)
    || ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName);
  if (objeto && !escribiendo) {
    evento.preventDefault();
    eliminarSeleccion();
  }
});

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
  const copia = { id: nueva.id, contenido: lienzo.toJSON() };
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
  if (capaPresentacion.requestFullscreen) {
    capaPresentacion.requestFullscreen().catch(() => {});
  }
});

function salirDePresentacion() {
  presentando = false;
  capaPresentacion.classList.remove("activo");
  canvasPresentacion.classList.remove("ocultando");
  if (document.fullscreenElement) document.exitFullscreen();
}

document.addEventListener("keydown", (evento) => {
  if (!presentando) return;
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
