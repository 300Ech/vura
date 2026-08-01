// Acceso a IndexedDB mediante Dexie. Aquí se guardan los documentos Yjs
// para poder seguir trabajando sin conexión. Nunca se usa IndexedDB directamente.
import Dexie from "https://cdn.jsdelivr.net/npm/dexie@4.0.8/+esm";

const bd = new Dexie("vura");
bd.version(1).stores({
  documentos: "clave", // clave = "tipo:idProyecto", estado = bytes del documento Yjs
});
// v2: cola simple de mensajes de chat pendientes de enviar.
bd.version(2).stores({
  documentos: "clave",
  mensajes_pendientes: "++id, id_equipo",
});

export async function cargarDocumentoLocal(clave) {
  const registro = await bd.documentos.get(clave);
  return registro ? registro.estado : null;
}

export async function guardarDocumentoLocal(clave, estado) {
  await bd.documentos.put({ clave: clave, estado: estado });
}

export async function guardarMensajePendiente(datos) {
  return await bd.mensajes_pendientes.add(datos);
}

export async function listarMensajesPendientes(idEquipo) {
  return await bd.mensajes_pendientes.where("id_equipo").equals(idEquipo).toArray();
}

export async function borrarMensajePendiente(id) {
  await bd.mensajes_pendientes.delete(id);
}
