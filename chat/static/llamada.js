// Videollamada grupal en malla con WebRTC.
// Socket.IO solo sirve de mensajero para "presentar" a los navegadores;
// después, cada participante envía su video directo a todos los demás.
const contenedorLlamada = document.getElementById("llamada");
const idEquipo = Number(contenedorLlamada.dataset.idEquipo);

const cuadricula = document.getElementById("cuadricula-videos");
const videoLocal = document.getElementById("video-local");
const estadoLlamada = document.getElementById("estado-llamada");

const socket = io();
const conexiones = new Map(); // id del compañero -> RTCPeerConnection
let transmisionLocal = null;

// 1. Encender cámara y micrófono, y unirse a la llamada del equipo.
navigator.mediaDevices.getUserMedia({ video: true, audio: true })
  .then((transmision) => {
    transmisionLocal = transmision;
    videoLocal.srcObject = transmision;
    socket.emit("llamada_unirse", { id_equipo: idEquipo });
  })
  .catch(() => {
    estadoLlamada.textContent = "No se pudo acceder a la cámara o al micrófono.";
  });

// 2. Al entrar, se recibe la lista de presentes: quien llega inicia la conexión con cada uno.
socket.on("llamada_participantes", (datos) => {
  if (datos.participantes.length === 0) {
    estadoLlamada.textContent = "Esperando a tus compañeros...";
    return;
  }
  datos.participantes.forEach((participante) => {
    conectarCon(participante.id, participante.nombre, true);
  });
});

socket.on("llamada_llena", (datos) => {
  estadoLlamada.textContent = `La llamada está llena (máximo ${datos.maximo} participantes).`;
});

// 3. Intercambio de señales (oferta, respuesta y candidatos), dirigidas a cada compañero.
socket.on("llamada_senal", async (datos) => {
  const conexion = conexiones.get(datos.de) || conectarCon(datos.de, datos.nombre, false);
  const senal = datos.senal;
  if (senal.descripcion) {
    await conexion.setRemoteDescription(senal.descripcion);
    if (senal.descripcion.type === "offer") {
      const respuesta = await conexion.createAnswer();
      await conexion.setLocalDescription(respuesta);
      socket.emit("llamada_senal", { id_equipo: idEquipo, para: datos.de, senal: { descripcion: respuesta } });
    }
  } else if (senal.candidato) {
    await conexion.addIceCandidate(senal.candidato);
  }
});

socket.on("llamada_se_fue", (datos) => {
  const conexion = conexiones.get(datos.id);
  if (conexion) conexion.close();
  conexiones.delete(datos.id);
  const celda = document.getElementById("video-de-" + datos.id);
  if (celda) celda.remove();
  ajustarCuadricula();
  estadoLlamada.textContent = datos.nombre + " salió de la llamada.";
});

// 4. Una conexión WebRTC por compañero (eso es la "malla").
function conectarCon(idCompanero, nombre, iniciarOferta) {
  const conexion = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  });
  conexiones.set(idCompanero, conexion);

  transmisionLocal.getTracks().forEach((pista) => conexion.addTrack(pista, transmisionLocal));

  conexion.addEventListener("track", (evento) => {
    mostrarVideo(idCompanero, nombre, evento.streams[0]);
    estadoLlamada.textContent = "En llamada";
  });

  conexion.addEventListener("icecandidate", (evento) => {
    if (evento.candidate) {
      socket.emit("llamada_senal", { id_equipo: idEquipo, para: idCompanero, senal: { candidato: evento.candidate } });
    }
  });

  if (iniciarOferta) {
    conexion.createOffer()
      .then((oferta) => conexion.setLocalDescription(oferta))
      .then(() => {
        socket.emit("llamada_senal", {
          id_equipo: idEquipo, para: idCompanero,
          senal: { descripcion: conexion.localDescription },
        });
      });
  }
  return conexion;
}

function mostrarVideo(idCompanero, nombre, transmision) {
  let celda = document.getElementById("video-de-" + idCompanero);
  if (!celda) {
    celda = document.createElement("div");
    celda.id = "video-de-" + idCompanero;
    celda.className = "celda-video";

    const video = document.createElement("video");
    video.autoplay = true;
    video.playsInline = true;
    const etiqueta = document.createElement("span");
    etiqueta.className = "nombre-video";
    etiqueta.textContent = nombre || "Compañero";

    celda.append(video, etiqueta);
    cuadricula.appendChild(celda);
    ajustarCuadricula();
  }
  celda.querySelector("video").srcObject = transmision;
}

// El grid es dinámico: se calculan las columnas según cuántos videos hay,
// y CSS Grid reparte el espacio solo (como hacen Meet o Zoom).
function ajustarCuadricula() {
  const cuantos = cuadricula.children.length;
  let columnas = 1;
  if (cuantos >= 2) columnas = 2;
  if (cuantos >= 5) columnas = 3;
  cuadricula.style.gridTemplateColumns = `repeat(${columnas}, 1fr)`;
}
ajustarCuadricula();

// 5. Controles: silenciar micrófono y apagar cámara.
// Apagar una pista (enabled = false) hace que a los demás les llegue silencio o imagen negra.
const botonMicrofono = document.getElementById("boton-microfono");
const botonCamara = document.getElementById("boton-camara");

botonMicrofono.addEventListener("click", () => {
  if (!transmisionLocal) return;
  const pista = transmisionLocal.getAudioTracks()[0];
  pista.enabled = !pista.enabled;
  botonMicrofono.querySelector("i").className = pista.enabled ? "bi bi-mic-fill" : "bi bi-mic-mute-fill";
  botonMicrofono.classList.toggle("apagado", !pista.enabled);
  botonMicrofono.title = pista.enabled ? "Silenciar micrófono" : "Activar micrófono";
});

botonCamara.addEventListener("click", () => {
  if (!transmisionLocal) return;
  const pista = transmisionLocal.getVideoTracks()[0];
  pista.enabled = !pista.enabled;
  botonCamara.querySelector("i").className = pista.enabled ? "bi bi-camera-video-fill" : "bi bi-camera-video-off-fill";
  botonCamara.classList.toggle("apagado", !pista.enabled);
  botonCamara.title = pista.enabled ? "Apagar cámara" : "Encender cámara";
});

// 6. Colgar: se avisa, se cierran todas las conexiones y se vuelve al chat.
document.getElementById("boton-colgar").addEventListener("click", () => {
  socket.emit("llamada_colgar", { id_equipo: idEquipo });
  conexiones.forEach((conexion) => conexion.close());
  if (transmisionLocal) {
    transmisionLocal.getTracks().forEach((pista) => pista.stop());
  }
  window.location.href = contenedorLlamada.dataset.urlChat;
});
