// este archivo controla la transmisión de videollamada y audio en grupo entre
// los integrantes del equipo. su propósito es permitir que los estudiantes
// realicen
// reuniones virtuales para hablar y verse mientras trabajan en su
// proyecto. lo hace
// solicitando acceso a la cámara y micrófono del usuario y transmitiendo
// el video
// y voz directamente entre los navegadores de los compañeros. elegimos la
// transmisión directa de video porque garantiza baja latencia y alta calidad de
// imagen sin saturar la red escolar. se creó para facilitar las reuniones
// a distancia.


const contenedorLlamada = document.getElementById("llamada");
const idEquipo = Number(contenedorLlamada.dataset.idEquipo);


const cuadricula = document.getElementById("cuadricula-videos");
const videoLocal = document.getElementById("video-local");
const estadoLlamada = document.getElementById("estado-llamada");

const socket = io();
const conexiones = new Map(); // id del compañero -> RTCPeerConnection
let transmisionLocal = null;
let pistaVideoCamara = null; // pista original de la cámara, para volver a ella
let pistaVideoActual = null; // pista de video que se está enviando ahora mismo (cámara, pantalla o desenfocada)

// 1. Encender cámara y micrófono, y unirse a la llamada del equipo.
navigator.mediaDevices.getUserMedia({ video: true, audio: true })
  .then((transmision) => {
    transmisionLocal = transmision;
    pistaVideoCamara = transmision.getVideoTracks()[0];
    pistaVideoActual = pistaVideoCamara;
    videoLocal.srcObject = transmision;
    socket.emit("llamada_unirse", { id_equipo: idEquipo });
  })
  .catch(() => {
    estadoLlamada.textContent = "No se pudo acceder a la cámara o al micrófono.";
  });

// 2. Al entrar, se recibe la lista de presentes: quien llega inicia la
// conexión con cada uno.
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

// 3. Intercambio de señales (oferta, respuesta y candidatos), dirigidas a
// cada compañero.
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

// 4. Una conexión transmisión directa por compañero (eso es la "malla").
function conectarCon(idCompanero, nombre, iniciarOferta) {
  const conexion = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  });
  conexiones.set(idCompanero, conexion);

  // el audio siempre sale de la cámara; el video sale de lo que esté activo ahora
  // (cámara, pantalla compartida o video con fondo difuminado)
  conexion.addTrack(transmisionLocal.getAudioTracks()[0], transmisionLocal);
  conexion.addTrack(pistaVideoActual, transmisionLocal);

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
// Apagar una pista (enabled = false) hace que a los demás les llegue
// silencio o imagen negra.
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

// Cambia la pista de video que reciben todos los compañeros (reemplazo en caliente,
// sin renegociar la conexión) y actualiza también la vista propia.
function aplicarPistaVideo(nuevaPista) {
  conexiones.forEach((conexion) => {
    const emisor = conexion.getSenders().find((s) => s.track && s.track.kind === "video");
    if (emisor) emisor.replaceTrack(nuevaPista);
  });
  pistaVideoActual = nuevaPista;
  videoLocal.srcObject = new MediaStream([nuevaPista]);
}

// 5.5. Compartir pantalla: solo visible si el alumno lo activó en su perfil.
// Los botones ni siquiera existen en la página si la opción está apagada.
const botonPantalla = document.getElementById("boton-pantalla");
let compartiendoPantalla = false;
let transmisionPantalla = null;

if (botonPantalla) {
  botonPantalla.addEventListener("click", () => {
    if (compartiendoPantalla) {
      volverACamara();
      return;
    }
    navigator.mediaDevices.getDisplayMedia({ video: true })
      .then((transmision) => {
        transmisionPantalla = transmision;
        const pistaPantalla = transmision.getVideoTracks()[0];
        if (desenfoqueActivo) desactivarDesenfoque();
        aplicarPistaVideo(pistaPantalla);
        compartiendoPantalla = true;
        botonPantalla.classList.add("apagado");
        botonPantalla.title = "Dejar de compartir pantalla";
        // si el alumno detiene la captura desde el propio panel del navegador
        pistaPantalla.addEventListener("ended", volverACamara);
      })
      .catch(() => {}); // el alumno cerró el selector de pantalla sin elegir nada
  });
}

function volverACamara() {
  if (!compartiendoPantalla) return;
  compartiendoPantalla = false;
  botonPantalla.classList.remove("apagado");
  botonPantalla.title = "Compartir pantalla";
  if (transmisionPantalla) {
    transmisionPantalla.getTracks().forEach((pista) => pista.stop());
    transmisionPantalla = null;
  }
  aplicarPistaVideo(pistaVideoCamara);
}

// 5.6. Difuminar fondo: solo visible si el alumno lo activó en su perfil.
// Usa MediaPipe Selfie Segmentation para recortar a la persona y dibuja el
// fondo con desenfoque en un <canvas>; ese canvas se envía como video en vez
// de la cámara directa.
const botonDesenfoque = document.getElementById("boton-desenfoque");
let desenfoqueActivo = false;
let segmentador = null;
let animacionDesenfoque = null;
let videoProceso = null;
let canvasDesenfoque = null;
let ctxDesenfoque = null;

function dibujarCuadroDesenfocado(resultados) {
  ctxDesenfoque.save();
  ctxDesenfoque.clearRect(0, 0, canvasDesenfoque.width, canvasDesenfoque.height);
  // recorta a la persona usando la máscara de segmentación
  ctxDesenfoque.drawImage(resultados.segmentationMask, 0, 0, canvasDesenfoque.width, canvasDesenfoque.height);
  ctxDesenfoque.globalCompositeOperation = "source-in";
  ctxDesenfoque.drawImage(resultados.image, 0, 0, canvasDesenfoque.width, canvasDesenfoque.height);
  // dibuja el fondo difuminado detrás de la persona ya recortada
  ctxDesenfoque.globalCompositeOperation = "destination-over";
  ctxDesenfoque.filter = "blur(12px)";
  ctxDesenfoque.drawImage(resultados.image, 0, 0, canvasDesenfoque.width, canvasDesenfoque.height);
  ctxDesenfoque.filter = "none";
  ctxDesenfoque.restore();
}

async function activarDesenfoque() {
  if (typeof SelfieSegmentation === "undefined" || !pistaVideoCamara) return;

  if (!segmentador) {
    segmentador = new SelfieSegmentation({
      locateFile: (archivo) => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${archivo}`,
    });
    segmentador.setOptions({ modelSelection: 1 });
    segmentador.onResults(dibujarCuadroDesenfocado);
  }

  videoProceso = document.createElement("video");
  videoProceso.muted = true;
  videoProceso.playsInline = true;
  videoProceso.srcObject = new MediaStream([pistaVideoCamara]);
  await videoProceso.play();

  const ajustes = pistaVideoCamara.getSettings();
  canvasDesenfoque = document.createElement("canvas");
  canvasDesenfoque.width = ajustes.width || 640;
  canvasDesenfoque.height = ajustes.height || 480;
  ctxDesenfoque = canvasDesenfoque.getContext("2d");

  desenfoqueActivo = true;
  const procesarCuadro = async () => {
    if (!desenfoqueActivo) return;
    await segmentador.send({ image: videoProceso });
    animacionDesenfoque = requestAnimationFrame(procesarCuadro);
  };
  procesarCuadro();

  aplicarPistaVideo(canvasDesenfoque.captureStream(25).getVideoTracks()[0]);
}

function desactivarDesenfoque() {
  if (!desenfoqueActivo) return;
  desenfoqueActivo = false;
  if (animacionDesenfoque) cancelAnimationFrame(animacionDesenfoque);
  if (videoProceso) {
    videoProceso.pause();
    videoProceso.srcObject = null;
    videoProceso = null;
  }
  if (!compartiendoPantalla) aplicarPistaVideo(pistaVideoCamara);
}

if (botonDesenfoque) {
  botonDesenfoque.addEventListener("click", () => {
    if (compartiendoPantalla) return; // no tiene sentido difuminar mientras se comparte pantalla
    if (desenfoqueActivo) {
      desactivarDesenfoque();
      botonDesenfoque.classList.remove("apagado");
      botonDesenfoque.title = "Difuminar fondo";
    } else {
      activarDesenfoque();
      botonDesenfoque.classList.add("apagado");
      botonDesenfoque.title = "Quitar desenfoque de fondo";
    }
  });
}

// 6. Colgar: se avisa, se cierran todas las conexiones y se vuelve al chat.
document.getElementById("boton-colgar").addEventListener("click", () => {
  socket.emit("llamada_colgar", { id_equipo: idEquipo });
  conexiones.forEach((conexion) => conexion.close());
  if (transmisionPantalla) transmisionPantalla.getTracks().forEach((pista) => pista.stop());
  if (desenfoqueActivo) desactivarDesenfoque();
  if (transmisionLocal) {
    transmisionLocal.getTracks().forEach((pista) => pista.stop());
  }
  window.location.href = contenedorLlamada.dataset.urlChat;
});
