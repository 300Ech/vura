// Tablero de tareas colaborativo y offline: el documento Yjs es la única fuente de verdad.
// La página llega renderizada por Flask; este archivo la mejora: redibuja las columnas
// desde el Y.Map, y crear/editar/mover/asignar escriben en el mapa (con o sin conexión).
import * as Y from "https://cdn.jsdelivr.net/npm/yjs@13.6.14/+esm";
import { conectarDocumento } from "/colaboracion/static/colaboracion.js";

const datosIniciales = JSON.parse(document.getElementById("datos-tablero").textContent);
const idProyecto = datosIniciales.id_proyecto;
const nombresMiembros = new Map(datosIniciales.miembros.map((m) => [m.id, m.nombre]));
const contadores = datosIniciales.contadores; // comentarios y archivos por tarea

const indicadorEstado = document.getElementById("estado-guardado");
const modal = new bootstrap.Modal(document.getElementById("modal-tarea"));
const formularioTarea = document.getElementById("formulario-tarea");

const ORIGEN_LOCAL = "local";
const ESTADOS = ["pendiente", "en_progreso", "terminada"];
const doc = new Y.Doc();
const mapaTareas = doc.getMap("tareas");

// ---- Documento compartido ----

await conectarDocumento({ tipo: "tablero_tareas", idProyecto: idProyecto, doc: doc });

// Primera vez (mapa vacío): se siembra con la copia que renderizó el servidor.
if (mapaTareas.size === 0 && datosIniciales.tareas.length > 0) {
  doc.transact(() => {
    datosIniciales.tareas.forEach((tarea) => mapaTareas.set(tarea.uuid, tarea));
  }, ORIGEN_LOCAL);
}

mapaTareas.observe(() => {
  dibujarTablero();
  programarCopia();
});
dibujarTablero();

// ---- Dibujo del tablero ----

function dibujarTablero() {
  const porEstado = { pendiente: [], en_progreso: [], terminada: [] };
  [...mapaTareas.values()]
    .sort((a, b) => (a.orden ?? a.creado_en ?? 0) - (b.orden ?? b.creado_en ?? 0))
    .forEach((tarea) => porEstado[tarea.estado]?.push(tarea));

  ESTADOS.forEach((estado) => {
    const columna = document.getElementById("columna-" + estado);
    const contador = document.getElementById("contador-" + estado);
    columna.dataset.estado = estado;
    contador.textContent = porEstado[estado].length;
    columna.innerHTML = "";
    if (porEstado[estado].length === 0) {
      const vacio = document.createElement("p");
      vacio.className = "text-muted small text-center my-3";
      vacio.textContent = "Sin tareas";
      columna.appendChild(vacio);
      return;
    }
    porEstado[estado].forEach((tarea) => columna.appendChild(crearTarjeta(tarea)));
  });

  // Actualizar barra de progreso
  const total = mapaTareas.size;
  const terminadas = porEstado["terminada"] ? porEstado["terminada"].length : 0;
  const progreso = total > 0 ? Math.round((terminadas / total) * 100) : 0;
  const barra = document.getElementById("barra-progreso-tablero");
  const texto = document.getElementById("texto-progreso-tablero");
  if (barra && texto) {
    barra.style.width = progreso + "%";
    barra.setAttribute("aria-valuenow", progreso);
    texto.textContent = progreso + "%";
  }
}

function crearTarjeta(tarea) {
  const tarjeta = document.createElement("div");
  tarjeta.className = "card mb-2 tarjeta-tarea";
  tarjeta.draggable = true;
  tarjeta.dataset.uuid = tarea.uuid;
  tarjeta.title = "Arrastrá para mover o reordenar";
  tarjeta.addEventListener("dragstart", alEmpezarArrastre);
  tarjeta.addEventListener("dragend", alTerminarArrastre);
  const cuerpo = document.createElement("div");
  cuerpo.className = "card-body p-2";

  const encabezado = document.createElement("div");
  encabezado.className = "d-flex align-items-start gap-2";
  const asa = document.createElement("span");
  asa.className = "asa-tarea";
  asa.textContent = "⠿";
  asa.title = "Arrastrar tarea";
  configurarAsaTactil(asa, tarjeta);
  const titulo = document.createElement("strong");
  titulo.className = "small flex-grow-1";
  titulo.textContent = tarea.titulo;
  const botonEditar = document.createElement("button");
  botonEditar.type = "button";
  botonEditar.className = "btn btn-link btn-sm p-0 small";
  botonEditar.textContent = "Editar";
  botonEditar.addEventListener("click", () => abrirModal(tarea));
  encabezado.append(asa, titulo, botonEditar);
  cuerpo.appendChild(encabezado);

  if (tarea.descripcion) {
    const descripcion = document.createElement("div");
    descripcion.className = "text-muted small";
    descripcion.textContent = tarea.descripcion;
    cuerpo.appendChild(descripcion);
  }

  const pie = document.createElement("div");
  pie.className = "d-flex justify-content-between align-items-center mt-1";
  const asignado = document.createElement("span");
  asignado.className = "text-muted small";
  asignado.textContent = tarea.id_asignado ? "👤 " + (nombresMiembros.get(tarea.id_asignado) || "?") : "Sin asignar";
  pie.appendChild(asignado);
  if (tarea.fecha_limite) {
    const fecha = document.createElement("span");
    fecha.className = "badge bg-warning text-dark";
    const [, mes, dia] = tarea.fecha_limite.split("-");
    fecha.textContent = `${dia}/${mes}`;
    pie.appendChild(fecha);
  }
  cuerpo.appendChild(pie);

  const contador = contadores[tarea.uuid];
  if (contador && (contador.comentarios > 0 || contador.archivos > 0)) {
    const resumen = document.createElement("div");
    resumen.className = "text-muted small mt-1";
    resumen.textContent = `💬 ${contador.comentarios} · 📎 ${contador.archivos}`;
    cuerpo.appendChild(resumen);
  }

  const botones = document.createElement("div");
  botones.className = "mt-2 d-flex gap-1";
  const posicion = ESTADOS.indexOf(tarea.estado);
  if (posicion > 0) {
    botones.appendChild(crearBotonMover("←", "btn-outline-secondary", tarea, ESTADOS[posicion - 1]));
  }
  if (posicion < ESTADOS.length - 1) {
    botones.appendChild(crearBotonMover("→", "btn-outline-success", tarea, ESTADOS[posicion + 1]));
  }
  cuerpo.appendChild(botones);

  tarjeta.appendChild(cuerpo);
  return tarjeta;
}

// ---- Arrastrar y soltar ----
// Usa la API nativa del navegador: no agrega librerías y los botones de flecha
// siguen disponibles como alternativa en pantallas táctiles.

let uuidArrastrada = null;

function alEmpezarArrastre(evento) {
  uuidArrastrada = evento.currentTarget.dataset.uuid;
  evento.currentTarget.classList.add("arrastrando");
  evento.dataTransfer.effectAllowed = "move";
  evento.dataTransfer.setData("text/plain", uuidArrastrada);
}

function alTerminarArrastre(evento) {
  evento.currentTarget.classList.remove("arrastrando");
  document.querySelectorAll(".columna-tareas").forEach((columna) => {
    columna.classList.remove("destino-arrastre");
  });
  uuidArrastrada = null;
  dibujarTablero(); // restaura el orden visual si el arrastre se canceló
}

function tarjetaDespuesDelPuntero(columna, y) {
  const tarjetas = [...columna.querySelectorAll(".tarjeta-tarea:not(.arrastrando)")];
  return tarjetas.reduce((mejor, tarjeta) => {
    const caja = tarjeta.getBoundingClientRect();
    const distancia = y - caja.top - caja.height / 2;
    if (distancia < 0 && distancia > mejor.distancia) {
      return { distancia, tarjeta };
    }
    return mejor;
  }, { distancia: Number.NEGATIVE_INFINITY, tarjeta: null }).tarjeta;
}

function moverTareaArrastrada(columna, y) {
  const uuid = uuidArrastrada;
  const tarea = mapaTareas.get(uuid);
  if (!tarea) return;

  const siguiente = tarjetaDespuesDelPuntero(columna, y);
  const uuidsDestino = [...columna.querySelectorAll(".tarjeta-tarea:not(.arrastrando)")]
    .map((tarjeta) => tarjeta.dataset.uuid);
  const posicion = siguiente ? uuidsDestino.indexOf(siguiente.dataset.uuid) : uuidsDestino.length;
  uuidsDestino.splice(posicion, 0, uuid);

  doc.transact(() => {
    // Renumerar deja espacios y evita depender de la fecha de creación.
    uuidsDestino.forEach((id, indice) => {
      const actual = mapaTareas.get(id);
      mapaTareas.set(id, {
        ...actual,
        estado: columna.dataset.estado,
        orden: (indice + 1) * 100,
      });
    });
  }, ORIGEN_LOCAL);
}

document.querySelectorAll(".columna-tareas").forEach((columna) => {
  columna.addEventListener("dragover", (evento) => {
    evento.preventDefault();
    evento.dataTransfer.dropEffect = "move";
    columna.classList.add("destino-arrastre");
    const tarjeta = document.querySelector(".tarjeta-tarea.arrastrando");
    const siguiente = tarjetaDespuesDelPuntero(columna, evento.clientY);
    if (tarjeta) columna.insertBefore(tarjeta, siguiente);
  });
  columna.addEventListener("dragleave", (evento) => {
    if (!columna.contains(evento.relatedTarget)) columna.classList.remove("destino-arrastre");
  });
  columna.addEventListener("drop", (evento) => {
    evento.preventDefault();
    columna.classList.remove("destino-arrastre");
    uuidArrastrada = uuidArrastrada || evento.dataTransfer.getData("text/plain");
    moverTareaArrastrada(columna, evento.clientY);
  });
});

function configurarAsaTactil(asa, tarjeta) {
  let columnaDestino = null;
  asa.addEventListener("pointerdown", (evento) => {
    if (evento.pointerType === "mouse") return;
    evento.preventDefault();
    uuidArrastrada = tarjeta.dataset.uuid;
    tarjeta.classList.add("arrastrando");
    asa.setPointerCapture(evento.pointerId);
  });
  asa.addEventListener("pointermove", (evento) => {
    if (!uuidArrastrada || evento.pointerType === "mouse") return;
    document.querySelectorAll(".columna-tareas").forEach((c) => c.classList.remove("destino-arrastre"));
    columnaDestino = document.elementFromPoint(evento.clientX, evento.clientY)?.closest(".columna-tareas") || null;
    if (columnaDestino) columnaDestino.classList.add("destino-arrastre");
  });
  asa.addEventListener("pointerup", (evento) => {
    if (!uuidArrastrada || evento.pointerType === "mouse") return;
    if (columnaDestino) moverTareaArrastrada(columnaDestino, evento.clientY);
    tarjeta.classList.remove("arrastrando");
    document.querySelectorAll(".columna-tareas").forEach((c) => c.classList.remove("destino-arrastre"));
    uuidArrastrada = null;
    columnaDestino = null;
  });
}

function crearBotonMover(etiqueta, estilo, tarea, nuevoEstado) {
  const boton = document.createElement("button");
  boton.type = "button";
  boton.className = "btn btn-sm " + estilo;
  boton.textContent = etiqueta;
  boton.addEventListener("click", () => {
    const ordenFinal = Math.max(
      0,
      ...[...mapaTareas.values()]
        .filter((otra) => otra.estado === nuevoEstado)
        .map((otra) => otra.orden ?? otra.creado_en ?? 0),
    ) + 100;
    doc.transact(() => {
      mapaTareas.set(tarea.uuid, { ...tarea, estado: nuevoEstado, orden: ordenFinal });
    }, ORIGEN_LOCAL);
  });
  return boton;
}

// ---- Crear y editar (modal) ----

document.getElementById("boton-nueva-tarea").addEventListener("click", () => abrirModal(null));

function abrirModal(tarea) {
  formularioTarea.elements.uuid.value = tarea ? tarea.uuid : "";
  formularioTarea.elements.titulo.value = tarea ? tarea.titulo : "";
  formularioTarea.elements.descripcion.value = tarea && tarea.descripcion ? tarea.descripcion : "";
  formularioTarea.elements.id_asignado.value = tarea && tarea.id_asignado ? tarea.id_asignado : "";
  formularioTarea.elements.fecha_limite.value = tarea && tarea.fecha_limite ? tarea.fecha_limite : "";
  document.getElementById("titulo-modal").textContent = tarea ? "Editar tarea" : "Nueva tarea";
  seccionDetalles.classList.toggle("d-none", !tarea);
  if (tarea) cargarDetalles(tarea.uuid);
  modal.show();
}

formularioTarea.addEventListener("submit", (evento) => {
  evento.preventDefault();
  const titulo = formularioTarea.elements.titulo.value.trim();
  if (!titulo) return;

  const uuid = formularioTarea.elements.uuid.value || crypto.randomUUID();
  const existente = mapaTareas.get(uuid);
  const tarea = {
    uuid: uuid,
    titulo: titulo,
    descripcion: formularioTarea.elements.descripcion.value.trim() || null,
    estado: existente ? existente.estado : "pendiente",
    id_asignado: Number(formularioTarea.elements.id_asignado.value) || null,
    fecha_limite: formularioTarea.elements.fecha_limite.value || null,
    creado_en: existente ? existente.creado_en : Date.now(),
    orden: existente ? (existente.orden ?? existente.creado_en) : Date.now(),
  };
  doc.transact(() => {
    mapaTareas.set(uuid, tarea);
  }, ORIGEN_LOCAL);
  modal.hide();
});

// ---- Comentarios y archivos de la tarea abierta en el modal ----
// No pasan por Yjs: son "agregar y leer", así que basta con fetch al servidor.

const seccionDetalles = document.getElementById("seccion-detalles");
const listaComentarios = document.getElementById("lista-comentarios");
const listaArchivos = document.getElementById("lista-archivos");
const textoComentario = document.getElementById("texto-comentario");
const entradaArchivo = document.getElementById("entrada-archivo");
const avisoArchivo = document.getElementById("aviso-archivo");
let uuidAbierta = null;

async function cargarDetalles(uuid) {
  uuidAbierta = uuid;
  textoComentario.value = "";
  entradaArchivo.value = "";
  avisoArchivo.textContent = "";
  const respuesta = await fetch(`/proyectos/${idProyecto}/tareas/${uuid}/detalles`);
  const datos = await respuesta.json();
  listaComentarios.innerHTML = "";
  datos.comentarios.forEach(agregarComentario);
  if (datos.comentarios.length === 0) {
    listaComentarios.textContent = "Todavía no hay comentarios.";
  }
  listaArchivos.innerHTML = "";
  datos.archivos.forEach(agregarArchivo);
  if (datos.archivos.length === 0) {
    listaArchivos.textContent = "Todavía no hay archivos.";
  }
  contadores[uuid] = { comentarios: datos.comentarios.length, archivos: datos.archivos.length };
}

function agregarComentario(comentario) {
  if (!listaComentarios.firstElementChild) listaComentarios.innerHTML = "";
  const linea = document.createElement("div");
  linea.className = "mb-1";
  const autor = document.createElement("strong");
  autor.textContent = comentario.autor;
  const fecha = document.createElement("span");
  fecha.className = "text-muted";
  fecha.textContent = ` (${comentario.fecha}): `;
  linea.append(autor, fecha, document.createTextNode(comentario.texto));
  listaComentarios.appendChild(linea);
}

function agregarArchivo(archivo) {
  if (!listaArchivos.firstElementChild) listaArchivos.innerHTML = "";
  const linea = document.createElement("div");
  const enlace = document.createElement("a");
  enlace.href = `/proyectos/${idProyecto}/archivos/${archivo.id}`;
  enlace.textContent = "📎 " + archivo.nombre;
  const autor = document.createElement("span");
  autor.className = "text-muted";
  autor.textContent = ` — subido por ${archivo.autor}`;
  linea.append(enlace, autor);
  listaArchivos.appendChild(linea);
}

document.getElementById("boton-comentar").addEventListener("click", async () => {
  const texto = textoComentario.value.trim();
  if (!texto || !uuidAbierta) return;
  const respuesta = await fetch(`/proyectos/${idProyecto}/tareas/${uuidAbierta}/comentarios`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ texto: texto }),
  });
  if (respuesta.ok) {
    agregarComentario(await respuesta.json());
    textoComentario.value = "";
    contadores[uuidAbierta].comentarios += 1;
    dibujarTablero();
  }
});

entradaArchivo.addEventListener("change", async () => {
  const archivo = entradaArchivo.files[0];
  if (!archivo || !uuidAbierta) return;
  avisoArchivo.textContent = "";
  const formulario = new FormData();
  formulario.append("archivo", archivo);
  const respuesta = await fetch(`/proyectos/${idProyecto}/tareas/${uuidAbierta}/archivos`, {
    method: "POST",
    body: formulario,
  });
  const datos = await respuesta.json();
  if (respuesta.ok) {
    agregarArchivo(datos);
    entradaArchivo.value = "";
    contadores[uuidAbierta].archivos += 1;
    dibujarTablero();
  } else {
    avisoArchivo.textContent = datos.error || "No se pudo subir el archivo.";
  }
});

// ---- Copia de lectura en el servidor (para vistas y exportación) ----

let temporizadorCopia = null;

function programarCopia() {
  indicadorEstado.textContent = navigator.onLine ? "Cambios sin guardar..." : "Guardado en este dispositivo (sin conexión)";
  indicadorEstado.className = navigator.onLine ? "text-warning small" : "text-primary small";
  clearTimeout(temporizadorCopia);
  temporizadorCopia = setTimeout(guardarCopia, 2000);
}

async function guardarCopia() {
  if (!navigator.onLine) return; // al volver la conexión se reintenta solo
  try {
    const respuesta = await fetch(`/proyectos/${idProyecto}/tareas/copia`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tareas: [...mapaTareas.values()] }),
    });
    if (!respuesta.ok) throw new Error("Error del servidor");
    indicadorEstado.textContent = "Guardado";
    indicadorEstado.className = "text-success small";
  } catch (error) {
    temporizadorCopia = setTimeout(guardarCopia, 5000);
  }
}

window.addEventListener("online", programarCopia);
