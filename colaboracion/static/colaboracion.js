// Conecta un documento Yjs con el servidor a través de Socket.IO.
// El servidor solo reparte y guarda los cambios; la fusión la hace Yjs aquí, en el navegador.
//
// Modo sin conexión: cada cambio se guarda primero en IndexedDB (vía Dexie).
// Al recuperar la conexión, Socket.IO se reconecta solo y los cambios locales
// se envían al servidor, donde Yjs los fusiona con los de los compañeros.
import * as Y from "https://cdn.jsdelivr.net/npm/yjs@13.6.14/+esm";
import { cargarDocumentoLocal, guardarDocumentoLocal } from "./almacen_local.js";

const ORIGEN_REMOTO = "remoto";
const ORIGEN_LOCAL_BD = "almacen-local";

function aBase64(bytes) {
  let binario = "";
  for (let i = 0; i < bytes.length; i += 8192) {
    binario += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return btoa(binario);
}

function desdeBase64(texto) {
  return Uint8Array.from(atob(texto), (caracter) => caracter.charCodeAt(0));
}

export async function conectarDocumento({ tipo, idProyecto, doc, alRecibirEstado }) {
  const identidad = { tipo: tipo, id_proyecto: idProyecto };
  const claveLocal = `${tipo}:${idProyecto}`;
  let temporizadorGuardado = null;
  let temporizadorLocal = null;

  // 1. Restaurar lo que haya guardado en este navegador (funciona sin internet).
  const estadoLocal = await cargarDocumentoLocal(claveLocal);
  if (estadoLocal) {
    Y.applyUpdate(doc, estadoLocal, ORIGEN_LOCAL_BD);
  }

  const socket = io();

  socket.on("connect", () => {
    socket.emit("doc_unirse", identidad);
  });

  // 2. Estado guardado en el servidor (al entrar o al reconectar tras estar sin conexión).
  socket.on("doc_estado", (datos) => {
    if (datos.tipo !== tipo || datos.id_proyecto !== idProyecto) return;
    if (datos.estado) {
      Y.applyUpdate(doc, desdeBase64(datos.estado), ORIGEN_REMOTO);
    }
    // Se envía nuestro documento completo: así los cambios hechos sin conexión
    // llegan al servidor y a los compañeros. Yjs fusiona; aplicar dos veces no daña.
    const estadoPropio = aBase64(Y.encodeStateAsUpdate(doc));
    socket.emit("doc_actualizacion", { ...identidad, datos: estadoPropio });
    socket.emit("doc_guardar", { ...identidad, estado: estadoPropio });

    if (alRecibirEstado) {
      alRecibirEstado(Boolean(datos.estado));
    }
  });

  // 3. Cambio en vivo de otro compañero.
  socket.on("doc_actualizacion", (datos) => {
    if (datos.tipo !== tipo || datos.id_proyecto !== idProyecto) return;
    Y.applyUpdate(doc, desdeBase64(datos.datos), ORIGEN_REMOTO);
  });

  // 4. Alguien acaba de entrar: le compartimos el documento completo.
  socket.on("doc_solicitar_estado", (datos) => {
    if (datos.tipo !== tipo || datos.id_proyecto !== idProyecto) return;
    socket.emit("doc_actualizacion", { ...identidad, datos: aBase64(Y.encodeStateAsUpdate(doc)) });
  });

  // 5. Cada cambio: primero a IndexedDB, luego al servidor (si hay conexión).
  doc.on("update", (actualizacion, origen) => {
    clearTimeout(temporizadorLocal);
    temporizadorLocal = setTimeout(() => {
      guardarDocumentoLocal(claveLocal, Y.encodeStateAsUpdate(doc));
    }, 300);

    if (origen !== ORIGEN_REMOTO && origen !== ORIGEN_LOCAL_BD && socket.connected) {
      socket.emit("doc_actualizacion", { ...identidad, datos: aBase64(actualizacion) });
    }
    clearTimeout(temporizadorGuardado);
    temporizadorGuardado = setTimeout(() => {
      if (socket.connected) {
        socket.emit("doc_guardar", { ...identidad, estado: aBase64(Y.encodeStateAsUpdate(doc)) });
      }
    }, 2000);
  });

  return socket;
}
