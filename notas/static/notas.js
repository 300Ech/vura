// Notas colaborativas: Quill + Yjs. Varios compañeros pueden escribir a la vez;
// Yjs fusiona los cambios. El servidor guarda además una copia de lectura (Delta).
import * as Y from "https://cdn.jsdelivr.net/npm/yjs@13.6.14/+esm";
import { QuillBinding } from "https://cdn.jsdelivr.net/npm/y-quill@1.0.0/+esm";
import { conectarDocumento } from "/colaboracion/static/colaboracion.js";

const contenedorNotas = document.getElementById("notas");
const idProyecto = Number(contenedorNotas.dataset.idProyecto);
const contenidoInicial = JSON.parse(document.getElementById("contenido-inicial").textContent);

const indicadorEstado = document.getElementById("estado-guardado");
const botonGuardar = document.getElementById("boton-guardar");

const quill = new Quill("#editor", {
  theme: "snow",
  placeholder: "Escribe aquí las notas del proyecto...",
  modules: {
    toolbar: [
      [{ header: [1, 2, 3, false] }],
      ["bold", "italic", "underline", "strike"],
      [{ list: "ordered" }, { list: "bullet" }],
      [{ color: [] }, { background: [] }],
      ["link", "clean"],
    ],
  },
});

// Documento compartido: Quill queda enlazado al texto de Yjs.
const doc = new Y.Doc();
const textoCompartido = doc.getText("quill");
new QuillBinding(textoCompartido, quill);

conectarDocumento({
  tipo: "notas",
  idProyecto: idProyecto,
  doc: doc,
  alRecibirEstado: () => {
    // Si el documento compartido sigue vacío, se siembra con la copia guardada en el servidor.
    if (textoCompartido.length === 0 && contenidoInicial) {
      quill.setContents(contenidoInicial, "user");
    }
  },
});

// ---- Copia de lectura en el servidor (para vistas y exportación) ----

let temporizadorCopia = null;
let hayCambiosSinGuardar = false;

doc.on("update", () => {
  hayCambiosSinGuardar = true;
  indicadorEstado.textContent = "Cambios sin guardar...";
  indicadorEstado.className = "text-warning small";
  clearTimeout(temporizadorCopia);
  temporizadorCopia = setTimeout(guardarCopia, 2000);
});

botonGuardar.addEventListener("click", guardarCopia);

async function guardarCopia() {
  if (!hayCambiosSinGuardar) return;
  clearTimeout(temporizadorCopia);

  try {
    const respuesta = await fetch(`/proyectos/${idProyecto}/notas/guardar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contenido: quill.getContents() }),
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
