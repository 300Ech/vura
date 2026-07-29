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
      detectarTemaAplicado();
      cargandoDiapositiva = false;
    });
  } else {
    lienzo.renderAll();
    selectorFondo.value = "#ffffff";
    temaAplicado = TEMAS[0];
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
