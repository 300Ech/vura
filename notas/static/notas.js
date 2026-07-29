// Pizarra colaborativa (estilo FigJam): Fabric.js + Yjs.
// Cada post-it, texto o trazo es una entrada en el mapa compartido de Yjs
// (igual que las tareas del tablero): así dos personas pueden mover
// objetos distintos a la vez sin pisarse.
import * as Y from "https://cdn.jsdelivr.net/npm/yjs@13.6.14/+esm";
import { conectarDocumento } from "/colaboracion/static/colaboracion.js";

const contenedorNotas = document.getElementById("notas");
const idProyecto = Number(contenedorNotas.dataset.idProyecto);
const contenidoInicial = JSON.parse(document.getElementById("contenido-inicial").textContent);
const idUsuarioPizarra = Number(document.body.dataset.idUsuario);

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

  _render: function (ctx) {
    this.callSuper("_render", ctx);
    const resumen = Object.entries(this.reacciones || {})
      .filter(([, usuarios]) => usuarios.length > 0)
      .map(([emoji, usuarios]) => `${emoji} ${usuarios.length}`)
      .join("  ");
    if (!resumen) return;

    // Pie pequeño dentro del papel; forma parte del objeto y viaja con él.
    ctx.save();
    ctx.font = "bold 15px Nunito";
    ctx.fillStyle = "#475569";
    ctx.textBaseline = "bottom";
    ctx.fillText(resumen, -this.width / 2 + 10, this.height / 2 - 8);
    ctx.restore();
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
    reacciones: {},
    ...opciones,
  });
}

const ORIGEN_LOCAL = "local";
const doc = new Y.Doc();
const objetosCompartidos = doc.getMap("objetos"); // uuid -> objeto de Fabric en JSON

let aplicandoRemoto = false; // evita re-publicar lo que llega de un compañero

// ---- Publicar y aplicar cambios ----

const PROPS_EXTRA = [
  "uuid", "vuraTipo", "mediaUrl", "mediaNombre", "mediaDuracion", "reacciones",
];

function publicarObjeto(objeto) {
  if (!objeto.uuid) objeto.uuid = crypto.randomUUID();
  doc.transact(() => {
    objetosCompartidos.set(objeto.uuid, objeto.toObject(PROPS_EXTRA));
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

function hidratarObjeto(objeto, datos, uuid) {
  // Fabric no siempre restaura propiedades propias; las volvemos a poner a mano.
  objeto.uuid = uuid;
  if (datos.vuraTipo) objeto.vuraTipo = datos.vuraTipo;
  if (datos.mediaUrl) objeto.mediaUrl = datos.mediaUrl;
  if (datos.mediaNombre) objeto.mediaNombre = datos.mediaNombre;
  if (datos.mediaDuracion) objeto.mediaDuracion = datos.mediaDuracion;
  if (datos.reacciones) objeto.reacciones = datos.reacciones;
  return objeto;
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
          lienzo.add(hidratarObjeto(objeto, datos, uuid));
        });
        ordenarCapas();
        lienzo.renderAll();
      });
    }
  });
  aplicandoRemoto = false;
  ordenarCapas();
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
          objetosCompartidos.set(crypto.randomUUID(), postIt.toObject(PROPS_EXTRA));
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
        lienzo.add(hidratarObjeto(objeto, datos, uuid));
      });
      ordenarCapas();
      lienzo.renderAll();
    });
  });
  aplicandoRemoto = false;
  ordenarCapas();
  lienzo.renderAll();
}

function ordenarCapas() {
  // Post-its, textos y tarjetas de media quedan por encima de los trazos del lápiz.
  lienzo.getObjects().forEach((obj) => {
    if (obj.type === "post-it" || obj.type === "textbox" || obj.type === "i-text"
        || obj.vuraTipo === "polaroid" || obj.vuraTipo === "voz-it" || obj.vuraTipo === "video") {
      lienzo.bringToFront(obj);
    }
  });
}

cargarDesdeCompartido();

// ---- Eventos locales del lienzo ----

lienzo.on("object:modified", (evento) => {
  if (!aplicandoRemoto) publicarObjeto(evento.target);
});

// Un trazo del lápiz recién terminado también se comparte.
lienzo.on("path:created", (evento) => {
  if (!aplicandoRemoto) publicarObjeto(evento.path);
  ordenarCapas();
});

// Al escribir dentro de un texto, se comparte con una pequeña espera.
let temporizadorTexto = null;
lienzo.on("text:changed", (evento) => {
  clearTimeout(temporizadorTexto);
  temporizadorTexto = setTimeout(() => publicarObjeto(evento.target), 500);
});

// ---- Menú inferior ----

function desactivarLapiz() {
  lienzo.isDrawingMode = false;
  document.getElementById("boton-lapiz").classList.remove("active");
}

function agregarPostIt() {
  desactivarLapiz();
  const postIt = crearPostIt("Escribe aquí", {
    left: 80 + Math.random() * 200,
    top: 80 + Math.random() * 150,
  });
  lienzo.add(postIt);
  lienzo.setActiveObject(postIt);
  publicarObjeto(postIt);
}

document.getElementById("boton-postit").addEventListener("click", agregarPostIt);

document.getElementById("boton-texto-suelto").addEventListener("click", () => {
  desactivarLapiz();
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

// Cada post-it guarda qué usuarios eligieron cada reacción.
// Al publicar el objeto, Yjs actualiza inmediatamente el papel en los demás navegadores.
const paletaReaccionesPostIt = document.getElementById("reacciones-postit");
document.getElementById("boton-reaccion-postit").addEventListener("click", () => {
  const objeto = lienzo.getActiveObject();
  if (!objeto || objeto.type !== "post-it") {
    alert("Selecciona un post-it para reaccionar.");
    return;
  }
  paletaReaccionesPostIt.classList.toggle("abierto");
});

document.querySelectorAll("#reacciones-postit [data-reaccion]").forEach((boton) => {
  boton.addEventListener("click", () => {
    const postIt = lienzo.getActiveObject();
    if (!postIt || postIt.type !== "post-it") return;
    const emoji = boton.dataset.reaccion;
    postIt.reacciones ||= {};
    const usuarios = new Set(postIt.reacciones[emoji] || []);
    if (usuarios.has(idUsuarioPizarra)) usuarios.delete(idUsuarioPizarra);
    else usuarios.add(idUsuarioPizarra);
    postIt.reacciones[emoji] = [...usuarios];
    postIt.dirty = true;
    lienzo.renderAll();
    publicarObjeto(postIt);
    paletaReaccionesPostIt.classList.remove("abierto");
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

// ---- Medios de la pizarra: Voz-it, foto Polaroid y video ----
// El archivo se sube una sola vez al servidor; Yjs solo sincroniza la URL y la posición.

async function subirMedio(archivo, tipo) {
  const formulario = new FormData();
  formulario.append("archivo", archivo);
  formulario.append("tipo", tipo);
  const respuesta = await fetch(`/proyectos/${idProyecto}/pizarra/medios`, {
    method: "POST",
    body: formulario,
  });
  const datos = await respuesta.json();
  if (!respuesta.ok) throw new Error(datos.error || "No se pudo subir el archivo.");
  return datos;
}

function posicionAleatoria() {
  return { left: 80 + Math.random() * 280, top: 80 + Math.random() * 180 };
}

function sombraPolaroid() {
  return { color: "rgba(0,0,0,0.22)", blur: 6, offsetX: 4, offsetY: 5 };
}

function crearPolaroid(url, nombre) {
  fabric.Image.fromURL(url, (imagen) => {
    const anchoFoto = 200;
    imagen.scaleToWidth(anchoFoto);
    const altoFoto = imagen.getScaledHeight();
    const margen = 14;
    const franja = 42;
    const ancho = anchoFoto + margen * 2;
    const alto = altoFoto + margen + franja;

    imagen.set({ left: margen, top: margen });
    const marco = new fabric.Rect({
      left: 0, top: 0, width: ancho, height: alto,
      fill: "#fffef8", stroke: "#cbd5e1", strokeWidth: 1,
    });
    const leyenda = new fabric.Textbox(nombre || "Foto", {
      left: margen, top: altoFoto + margen + 6, width: anchoFoto,
      fontSize: 18, fontFamily: "Caveat", fill: "#334155", textAlign: "center",
    });
    const grupo = new fabric.Group([marco, imagen, leyenda], {
      ...posicionAleatoria(),
      angle: Math.random() * 8 - 4,
      shadow: sombraPolaroid(),
    });
    grupo.vuraTipo = "polaroid";
    grupo.mediaUrl = url;
    grupo.mediaNombre = nombre || "Foto";
    lienzo.add(grupo);
    lienzo.setActiveObject(grupo);
    ordenarCapas();
    publicarObjeto(grupo);
  }, { crossOrigin: "anonymous" });
}

function crearTarjetaVozIt(url, duracionSegundos) {
  const minutos = Math.floor(duracionSegundos / 60);
  const segundos = String(Math.floor(duracionSegundos % 60)).padStart(2, "0");
  const duracion = `${minutos}:${segundos}`;
  const marco = new fabric.Rect({
    left: 0, top: 0, width: 180, height: 150,
    fill: "#fde047", rx: 4, ry: 4,
  });
  const icono = new fabric.Text("🎙️", {
    left: 20, top: 18, fontSize: 36,
  });
  const titulo = new fabric.Text("Voz-it", {
    left: 70, top: 28, fontSize: 26, fontFamily: "Caveat", fill: "#1e293b", fontWeight: "bold",
  });
  const tiempo = new fabric.Text(duracion, {
    left: 20, top: 75, fontSize: 22, fontFamily: "Nunito", fill: "#334155",
  });
  const pista = new fabric.Text("Doble clic ▶", {
    left: 20, top: 110, fontSize: 16, fontFamily: "Nunito", fill: "#64748b",
  });
  const grupo = new fabric.Group([marco, icono, titulo, tiempo, pista], {
    ...posicionAleatoria(),
    angle: Math.random() * 6 - 3,
    shadow: sombraPolaroid(),
  });
  grupo.vuraTipo = "voz-it";
  grupo.mediaUrl = url;
  grupo.mediaDuracion = duracion;
  lienzo.add(grupo);
  lienzo.setActiveObject(grupo);
  ordenarCapas();
  publicarObjeto(grupo);
}

// Saca un fotograma del video para usarlo como miniatura (como hace YouTube).
function capturarFotogramaVideo(archivo) {
  return new Promise((listo) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.src = URL.createObjectURL(archivo);

    const rendirse = () => {
      URL.revokeObjectURL(video.src);
      listo(null);
    };
    video.addEventListener("error", rendirse);
    video.addEventListener("loadeddata", () => {
      // Un segundo adentro: el primer fotograma suele estar en negro.
      video.currentTime = Math.min(1, (video.duration || 2) / 2);
    });
    video.addEventListener("seeked", () => {
      const proporcion = video.videoHeight / video.videoWidth || 0.5625;
      const lienzoFoto = document.createElement("canvas");
      lienzoFoto.width = 320;
      lienzoFoto.height = Math.round(320 * proporcion);
      lienzoFoto.getContext("2d").drawImage(video, 0, 0, lienzoFoto.width, lienzoFoto.height);
      lienzoFoto.toBlob((blob) => {
        URL.revokeObjectURL(video.src);
        listo(blob);
      }, "image/jpeg", 0.72);
    });
  });
}

function armarTarjetaVideo(url, nombre, partes, ancho, alto) {
  // Botón de play centrado sobre la miniatura.
  const radio = 34;
  const play = new fabric.Circle({
    left: ancho / 2 - radio, top: alto / 2 - radio - 10, radius: radio,
    fill: "rgba(255,255,255,0.92)", stroke: "#0f172a", strokeWidth: 2,
  });
  const triangulo = new fabric.Triangle({
    left: ancho / 2 + 13, top: alto / 2 - 24, width: 26, height: 24,
    angle: 90, fill: "#0f172a",
  });
  const etiqueta = new fabric.Textbox(nombre || "Video", {
    left: 10, top: alto - 30, width: ancho - 20, fontSize: 15,
    fontFamily: "Nunito", fill: "#e2e8f0", textAlign: "center",
  });
  const grupo = new fabric.Group([...partes, play, triangulo, etiqueta], {
    ...posicionAleatoria(),
    angle: Math.random() * 4 - 2,
    shadow: sombraPolaroid(),
  });
  grupo.vuraTipo = "video";
  grupo.mediaUrl = url;
  grupo.mediaNombre = nombre || "Video";
  lienzo.add(grupo);
  lienzo.setActiveObject(grupo);
  ordenarCapas();
  publicarObjeto(grupo);
}

function crearTarjetaVideo(url, nombre, urlMiniatura) {
  if (!urlMiniatura) {
    const ancho = 240;
    const alto = 170;
    const marco = new fabric.Rect({
      left: 0, top: 0, width: ancho, height: alto, fill: "#0f172a", rx: 8, ry: 8,
    });
    armarTarjetaVideo(url, nombre, [marco], ancho, alto);
    return;
  }

  fabric.Image.fromURL(urlMiniatura, (miniatura) => {
    const ancho = 260;
    miniatura.scaleToWidth(ancho);
    const alto = miniatura.getScaledHeight() + 34; // espacio para el nombre
    const marco = new fabric.Rect({
      left: 0, top: 0, width: ancho, height: alto, fill: "#0f172a", rx: 8, ry: 8,
    });
    miniatura.set({ left: 0, top: 0 });
    // Velo oscuro para que el botón de play resalte sobre cualquier imagen.
    const velo = new fabric.Rect({
      left: 0, top: 0, width: ancho, height: miniatura.getScaledHeight(),
      fill: "rgba(15,23,42,0.28)",
    });
    armarTarjetaVideo(url, nombre, [marco, miniatura, velo], ancho, alto);
  }, { crossOrigin: "anonymous" });
}

document.getElementById("boton-foto").addEventListener("click", () => {
  desactivarLapiz();
  document.getElementById("entrada-foto").click();
});

document.getElementById("entrada-foto").addEventListener("change", async (evento) => {
  const archivo = evento.target.files[0];
  evento.target.value = "";
  if (!archivo) return;
  try {
    indicadorEstado.textContent = "Subiendo foto...";
    const subida = await subirMedio(archivo, "imagen");
    crearPolaroid(subida.url, subida.nombre.replace(/\.[^.]+$/, "").slice(0, 24));
  } catch (error) {
    alert(error.message);
    indicadorEstado.textContent = "";
  }
});

document.getElementById("boton-video").addEventListener("click", () => {
  desactivarLapiz();
  document.getElementById("entrada-video").click();
});

document.getElementById("entrada-video").addEventListener("change", async (evento) => {
  const archivo = evento.target.files[0];
  evento.target.value = "";
  if (!archivo) return;
  try {
    indicadorEstado.textContent = "Subiendo video...";
    const subida = await subirMedio(archivo, "video");

    // La miniatura se sube como una imagen normal, así los compañeros la ven igual.
    let urlMiniatura = null;
    const fotograma = await capturarFotogramaVideo(archivo);
    if (fotograma) {
      const archivoMiniatura = new File([fotograma], `miniatura-${Date.now()}.jpg`, { type: "image/jpeg" });
      urlMiniatura = (await subirMedio(archivoMiniatura, "imagen")).url;
    }

    crearTarjetaVideo(subida.url, subida.nombre.replace(/\.[^.]+$/, "").slice(0, 28), urlMiniatura);
  } catch (error) {
    alert(error.message);
    indicadorEstado.textContent = "";
  }
});

// Voz-it: un clic empieza a grabar, otro clic detiene y pega la tarjeta.
const botonVozIt = document.getElementById("boton-voz-it");
let grabadora = null;
let grabadoraMime = "";
let trozosAudio = [];
let inicioGrabacion = 0;
let limiteGrabacion = null;
const audioActivo = new Audio();

botonVozIt.addEventListener("click", async () => {
  desactivarLapiz();
  if (grabadora) {
    grabadora.stop();
    return;
  }
  try {
    const flujo = await navigator.mediaDevices.getUserMedia({ audio: true });
    trozosAudio = [];
    grabadoraMime = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm"
      : (MediaRecorder.isTypeSupported("audio/mp4") ? "audio/mp4" : "");
    grabadora = grabadoraMime ? new MediaRecorder(flujo, { mimeType: grabadoraMime }) : new MediaRecorder(flujo);
    grabadoraMime = grabadora.mimeType || grabadoraMime || "audio/webm";
    inicioGrabacion = Date.now();
    grabadora.addEventListener("dataavailable", (evento) => {
      if (evento.data.size > 0) trozosAudio.push(evento.data);
    });
    grabadora.addEventListener("stop", async () => {
      flujo.getTracks().forEach((pista) => pista.stop());
      clearTimeout(limiteGrabacion);
      botonVozIt.classList.remove("grabando");
      botonVozIt.querySelector(".etiqueta").textContent = "Voz-it";
      const duracion = (Date.now() - inicioGrabacion) / 1000;
      grabadora = null;
      if (trozosAudio.length === 0) return;
      const blob = new Blob(trozosAudio, { type: grabadoraMime || "audio/webm" });
      const extension = (grabadoraMime || "").includes("mp4") ? "m4a" : "webm";
      const archivo = new File([blob], `voz-it-${Date.now()}.${extension}`, { type: blob.type });
      try {
        indicadorEstado.textContent = "Subiendo Voz-it...";
        const subida = await subirMedio(archivo, "audio");
        crearTarjetaVozIt(subida.url, duracion);
      } catch (error) {
        alert(error.message);
        indicadorEstado.textContent = "";
      }
    });
    grabadora.start();
    botonVozIt.classList.add("grabando");
    botonVozIt.querySelector(".etiqueta").textContent = "Detener";
    // Máximo 2 minutos, como en un mensaje corto de voz.
    limiteGrabacion = setTimeout(() => {
      if (grabadora) grabadora.stop();
    }, 120000);
  } catch (error) {
    alert("No se pudo usar el micrófono. Revisa el permiso del navegador.");
  }
});

const reproductorMedio = document.getElementById("reproductor-medio");
const videoReproductor = document.getElementById("video-reproductor");

document.getElementById("cerrar-reproductor").addEventListener("click", () => {
  videoReproductor.pause();
  videoReproductor.removeAttribute("src");
  reproductorMedio.classList.remove("abierto");
});

reproductorMedio.addEventListener("click", (evento) => {
  if (evento.target === reproductorMedio) {
    document.getElementById("cerrar-reproductor").click();
  }
});

lienzo.on("mouse:dblclick", (evento) => {
  const objeto = evento.target;
  if (!objeto) {
    agregarPostIt();
    return;
  }
  if (objeto.vuraTipo === "voz-it" && objeto.mediaUrl) {
    audioActivo.src = objeto.mediaUrl;
    audioActivo.play().catch(() => alert("No se pudo reproducir el Voz-it."));
  } else if (objeto.vuraTipo === "video" && objeto.mediaUrl) {
    document.getElementById("titulo-reproductor").textContent = objeto.mediaNombre || "Video";
    videoReproductor.src = objeto.mediaUrl;
    reproductorMedio.classList.add("abierto");
    videoReproductor.play().catch(() => {});
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
// Tiene las mismas funciones del chat completo, sin abandonar la pizarra.

const panelChat = document.getElementById("panel-chat");
const idEquipo = Number(panelChat.dataset.idEquipo);
const idUsuarioActual = Number(panelChat.dataset.idUsuario);
const mensajesPanel = document.getElementById("mensajes-panel");
const avisoEscribiendoPanel = document.getElementById("aviso-escribiendo-panel");
const textoChatPanel = document.getElementById("texto-chat-panel");
const datosMensajesPanel = new Map();
const emojisReaccionPanel = ["👍", "❤️", "😂", "🎉", "👀"];

const socketChat = io();
let historialCargado = false;

socketChat.on("connect", () => {
  socketChat.emit("unirse_sala", { id_equipo: idEquipo });
});

document.getElementById("boton-panel-chat").addEventListener("click", async () => {
  panelChat.classList.toggle("abierto");
  if (!panelChat.classList.contains("abierto")) return;
  if (!historialCargado) {
    historialCargado = true;
    const respuesta = await fetch(`/equipos/${idEquipo}/chat/mensajes`);
    const datos = await respuesta.json();
    datos.mensajes.forEach(agregarMensajePanel);
  }
  textoChatPanel.focus();
});

document.getElementById("boton-cerrar-chat").addEventListener("click", () => {
  panelChat.classList.remove("abierto");
});

socketChat.on("nuevo_mensaje", (mensaje) => {
  avisoEscribiendoPanel.textContent = "";
  if (historialCargado && !datosMensajesPanel.has(mensaje.id)) agregarMensajePanel(mensaje);
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

// Emojis del panel.
const emojisPanel = document.getElementById("emojis-chat-panel");
document.getElementById("boton-emojis-panel").addEventListener("click", () => {
  emojisPanel.classList.toggle("abierto");
});
document.querySelectorAll(".emoji-panel").forEach((boton) => {
  boton.addEventListener("click", () => {
    textoChatPanel.value += boton.textContent;
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
  burbuja.className = "p-2 rounded mb-2 small " + (esMio ? "bg-primary text-white ms-auto" : "bg-white border");
  burbuja.style.maxWidth = "85%";

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

  const reacciones = document.createElement("div");
  reacciones.id = "reacciones-panel-" + mensaje.id;
  reacciones.className = "reacciones-panel";
  burbuja.appendChild(reacciones);

  const menu = document.createElement("div");
  menu.className = "mt-1";
  emojisReaccionPanel.forEach((emoji) => {
    const boton = document.createElement("button");
    boton.type = "button";
    boton.className = "btn btn-sm p-0 me-1";
    boton.textContent = emoji;
    boton.addEventListener("click", () => {
      socketChat.emit("reaccionar_mensaje", {
        id_equipo: idEquipo, id_mensaje: mensaje.id, emoji: emoji,
      });
    });
    menu.appendChild(boton);
  });
  burbuja.appendChild(menu);

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
