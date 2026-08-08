// este archivo administra el almacén de memoria local dentro del navegador.
// su propósito es guardar un respaldo de los borradores de la pizarra y
// del chat
// en la memoria del dispositivo para que el alumno no pierda su
// información si se
// corta el internet. lo hace guardando los datos temporalmente y
// entregándolos de
// vuelta cuando se restablece la señal. se creó así para proteger el
// avance escolar.


import Dexie from "https://cdn.jsdelivr.net/npm/dexie@4.0.8/+esm";

const bd = new Dexie("vura");
bd.version(1).stores({
  documentos: "clave",
});
bd.version(2).stores({
  documentos: "clave",
  mensajes_pendientes: "++id, id_equipo",
});


// función que recupera los borradores guardados localmente en el dispositivo.
// sirve para restaurar los dibujos de la pizarra si se cerró el navegador
// por error.
export async function cargarDocumentoLocal(clave) {
  const registro = await bd.documentos.get(clave);
  return registro ? registro.estado : null;
}


// función que guarda una copia rápida del borrador de la pizarra en el
// dispositivo.
// sirve para respaldar cada trazo en tiempo real dentro del equipo del alumno.
export async function guardarDocumentoLocal(clave, estado) {
  await bd.documentos.put({ clave: clave, estado: estado });
}


// función que guarda temporalmente un mensaje de chat si no hay señal de red.
// sirve para encolar los mensajes escritos y enviarlos en cuanto regrese
// la conexión.
export async function guardarMensajePendiente(datos) {
  return await bd.mensajes_pendientes.add(datos);
}


// función que consulta la lista de mensajes de chat guardados pendientes
// de envío.
export async function listarMensajesPendientes(idEquipo) {
  return await bd.mensajes_pendientes.where("id_equipo").equals(idEquipo).toArray();
}


// función que borra un mensaje pendiente de la memoria local una vez
// enviado con éxito.
export async function borrarMensajePendiente(id) {
  await bd.mensajes_pendientes.delete(id);
}

