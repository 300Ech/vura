import json
import os
import time
import uuid as modulo_uuid

from flask import Blueprint, render_template, abort, request, jsonify, send_from_directory
from flask_login import login_required, current_user
from flask_socketio import join_room, leave_room, rooms, emit
from werkzeug.utils import secure_filename

from config import RUTA_DATOS
from extensiones import db, socketio, hora_local
from equipos.models import Equipo, MiembroEquipo
from proyectos.models import Proyecto
from chat.models import Mensaje, AdjuntoMensaje, ReaccionMensaje

chat = Blueprint("chat", __name__, template_folder="templates",
                 static_folder="static", static_url_path="/chat/static")

CARPETA_MEDIOS_CHAT = os.path.join(RUTA_DATOS, "medios_chat")
EMOJIS_REACCION = {"👍", "❤️", "😂", "🎉", "👀"}
EXTENSIONES_CHAT = {
    "imagen": {"png", "jpg", "jpeg", "gif", "webp"},
    "audio": {"webm", "ogg", "mp3", "m4a", "wav"},
}
TAMANOS_CHAT = {
    "imagen": 10 * 1024 * 1024,
    "audio": 5 * 1024 * 1024,
}


def obtener_equipo_de_miembro(id_equipo):
    equipo = db.session.get(Equipo, id_equipo)
    if equipo is None:
        abort(404)
    if not equipo.es_miembro(current_user):
        abort(403)
    return equipo


def resumen_reacciones(mensaje):
    resumen = {}
    mias = []
    for reaccion in mensaje.reacciones:
        resumen[reaccion.emoji] = resumen.get(reaccion.emoji, 0) + 1
        if reaccion.id_usuario == current_user.id:
            mias.append(reaccion.emoji)
    return {"totales": resumen, "mias": mias}


def serializar_mensaje(mensaje):
    adjunto = None
    if mensaje.adjunto:
        adjunto = {
            "tipo": mensaje.adjunto.tipo,
            "nombre": mensaje.adjunto.nombre_original,
            "url": f"/equipos/{mensaje.id_equipo}/chat/medios/{mensaje.adjunto.nombre_guardado}",
        }
    resumen = mensaje.texto
    if adjunto and not resumen:
        resumen = "📷 Imagen" if adjunto["tipo"] == "imagen" else "🎙️ Voz-it"
    return {
        "id": mensaje.id,
        "nombre": mensaje.usuario.nombre,
        "id_usuario": mensaje.id_usuario,
        "texto": mensaje.texto,
        "resumen": resumen,
        "hora": hora_local(mensaje.enviado_en, "%H:%M"),
        "id_equipo": mensaje.id_equipo,
        "adjunto": adjunto,
        "reacciones": resumen_reacciones(mensaje),
    }


def emitir_mensaje(mensaje):
    equipo = db.session.get(Equipo, mensaje.id_equipo)
    datos = serializar_mensaje(mensaje)
    datos["nombre_equipo"] = equipo.nombre
    socketio.emit("nuevo_mensaje", datos, room=f"equipo_{mensaje.id_equipo}")


@chat.route("/equipos/<int:id_equipo>/chat")
@login_required
def sala(id_equipo):
    equipo = obtener_equipo_de_miembro(id_equipo)
    
    proyecto = None
    id_proyecto = request.args.get("id_proyecto", type=int)
    if id_proyecto:
        proyecto_bd = db.session.get(Proyecto, id_proyecto)
        if proyecto_bd and proyecto_bd.id_equipo == equipo.id:
            proyecto = proyecto_bd
            
    mensajes = (Mensaje.query.filter_by(id_equipo=equipo.id)
                .order_by(Mensaje.enviado_en)
                .limit(200).all())
    datos_mensajes = json.dumps(
        [serializar_mensaje(m) for m in mensajes],
        ensure_ascii=False,
    ).replace("<", "\\u003c")
    return render_template("chat/sala.html", equipo=equipo, datos_mensajes=datos_mensajes, proyecto=proyecto)


@chat.route("/equipos/<int:id_equipo>/chat/mensajes")
@login_required
def mensajes_recientes(id_equipo):
    """Historial en JSON, para el panel de chat que se abre sobre la pizarra."""
    obtener_equipo_de_miembro(id_equipo)
    mensajes = (Mensaje.query.filter_by(id_equipo=id_equipo)
                .order_by(Mensaje.enviado_en.desc())
                .limit(50).all())
    return jsonify({"mensajes": [serializar_mensaje(m) for m in reversed(mensajes)]})


@chat.route("/equipos/<int:id_equipo>/chat/adjuntos", methods=["POST"])
@login_required
def subir_adjunto_chat(id_equipo):
    obtener_equipo_de_miembro(id_equipo)
    archivo = request.files.get("archivo")
    tipo = (request.form.get("tipo") or "").strip()
    if not archivo or not archivo.filename or tipo not in EXTENSIONES_CHAT:
        abort(400)

    nombre_original = secure_filename(archivo.filename) or f"adjunto.{tipo}"
    extension = nombre_original.rsplit(".", 1)[-1].lower() if "." in nombre_original else ""
    if extension not in EXTENSIONES_CHAT[tipo]:
        return jsonify({"error": f"Tipo de archivo no permitido para {tipo}."}), 400

    contenido = archivo.read()
    if len(contenido) > TAMANOS_CHAT[tipo]:
        limite_mb = TAMANOS_CHAT[tipo] // (1024 * 1024)
        return jsonify({"error": f"El archivo pesa más de {limite_mb} MB."}), 400

    nombre_guardado = f"{modulo_uuid.uuid4().hex}.{extension}"
    os.makedirs(CARPETA_MEDIOS_CHAT, exist_ok=True)
    with open(os.path.join(CARPETA_MEDIOS_CHAT, nombre_guardado), "wb") as destino:
        destino.write(contenido)

    mensaje = Mensaje(
        id_equipo=id_equipo,
        id_usuario=current_user.id,
        texto="",
    )
    mensaje.adjunto = AdjuntoMensaje(
        tipo=tipo,
        nombre_original=nombre_original[:120],
        nombre_guardado=nombre_guardado,
    )
    db.session.add(mensaje)
    db.session.commit()
    emitir_mensaje(mensaje)
    return jsonify(serializar_mensaje(mensaje))


@chat.route("/equipos/<int:id_equipo>/chat/medios/<nombre_archivo>")
@login_required
def servir_medio_chat(id_equipo, nombre_archivo):
    obtener_equipo_de_miembro(id_equipo)
    if "/" in nombre_archivo or "\\" in nombre_archivo or ".." in nombre_archivo:
        abort(404)
    return send_from_directory(CARPETA_MEDIOS_CHAT, nombre_archivo)


@chat.route("/equipos/<int:id_equipo>/llamada")
@login_required
def llamada(id_equipo):
    equipo = obtener_equipo_de_miembro(id_equipo)
    
    proyecto = None
    id_proyecto = request.args.get("id_proyecto", type=int)
    if id_proyecto:
        proyecto_bd = db.session.get(Proyecto, id_proyecto)
        if proyecto_bd and proyecto_bd.id_equipo == equipo.id:
            proyecto = proyecto_bd
            
    return render_template("chat/llamada.html", equipo=equipo, proyecto=proyecto)


# ---- Eventos de Socket.IO ----

def es_miembro_del_equipo(id_equipo):
    equipo = db.session.get(Equipo, id_equipo)
    return (equipo is not None
            and current_user.is_authenticated
            and equipo.es_miembro(current_user))


@socketio.on("unirse_sala")
def unirse_sala(datos):
    id_equipo = datos.get("id_equipo")
    if not es_miembro_del_equipo(id_equipo):
        return
    join_room(f"equipo_{id_equipo}")


# Último aviso enviado por cada clave, para no repetir avisos seguidos (ej. alguien escribiendo notas).
_ultimo_aviso = {}


def notificar_equipo(id_equipo, titulo, texto, enlace, clave_repeticion=None, minutos_espera=0):
    """Envía una notificación a todos los miembros del equipo conectados.

    Si se da una clave de repetición, el mismo aviso no se repite hasta
    que pasen los minutos de espera (evita el spam de los guardados automáticos).
    """
    if clave_repeticion:
        ahora = time.time()
        if ahora - _ultimo_aviso.get(clave_repeticion, 0) < minutos_espera * 60:
            return
        _ultimo_aviso[clave_repeticion] = ahora

    socketio.emit("notificacion", {
        "titulo": titulo,
        "texto": texto,
        "enlace": enlace,
        "id_usuario": current_user.id,
    }, room=f"equipo_{id_equipo}")


@socketio.on("unirse_notificaciones")
def unirse_notificaciones():
    """Une al usuario a las salas de todos sus equipos, desde cualquier página.

    Así le llegan los mensajes nuevos y puede ver avisos aunque no esté en el chat.
    """
    if not current_user.is_authenticated:
        return
    membresias = MiembroEquipo.query.filter_by(id_usuario=current_user.id).all()
    for membresia in membresias:
        join_room(f"equipo_{membresia.id_equipo}")


@socketio.on("escribiendo")
def escribiendo(datos):
    id_equipo = datos.get("id_equipo")
    if not es_miembro_del_equipo(id_equipo):
        return
    emit("usuario_escribiendo", {"nombre": current_user.nombre},
         room=f"equipo_{id_equipo}", include_self=False)


@socketio.on("mover_cursor")
def mover_cursor(datos):
    id_equipo = datos.get("id_equipo")
    if not es_miembro_del_equipo(id_equipo):
        return
    emit("cursor_movido", {
        "id_usuario": current_user.id,
        "nombre": current_user.nombre,
        "x": datos.get("x"),
        "y": datos.get("y"),
    }, room=f"equipo_{id_equipo}", include_self=False)


# ---- Videollamada grupal en malla (WebRTC) ----
# Socket.IO solo "presenta" a los navegadores (señalización); el audio y el video
# viajan directo entre ellos. Cada participante se conecta con todos los demás,
# por eso hay un límite: con demasiadas conexiones directas el video se congela.

MAXIMO_PARTICIPANTES = 6

# Quién está en cada llamada: sala -> {id de conexión: nombre}
participantes_llamada = {}


@socketio.on("llamada_unirse")
def llamada_unirse(datos):
    id_equipo = datos.get("id_equipo")
    if not es_miembro_del_equipo(id_equipo):
        return
    sala = f"llamada_{id_equipo}"
    presentes = participantes_llamada.setdefault(sala, {})

    if len(presentes) >= MAXIMO_PARTICIPANTES:
        emit("llamada_llena", {"maximo": MAXIMO_PARTICIPANTES})
        return

    # Quien llega recibe la lista de los presentes, para conectarse con cada uno.
    emit("llamada_participantes", {
        "participantes": [{"id": id_conexion, "nombre": nombre}
                          for id_conexion, nombre in presentes.items()],
    })

    # Si es el primero en entrar, se avisa al resto del equipo que empezó una llamada.
    if len(presentes) == 0:
        equipo = db.session.get(Equipo, id_equipo)
        emit("llamada_iniciada", {
            "nombre": current_user.nombre,
            "id_equipo": equipo.id,
            "nombre_equipo": equipo.nombre,
        }, room=f"equipo_{id_equipo}", include_self=False)

    presentes[request.sid] = current_user.nombre
    join_room(sala)


@socketio.on("llamada_senal")
def llamada_senal(datos):
    id_equipo = datos.get("id_equipo")
    destinatario = datos.get("para")
    if not es_miembro_del_equipo(id_equipo) or "senal" not in datos or not destinatario:
        return
    sala = f"llamada_{id_equipo}"
    if destinatario not in participantes_llamada.get(sala, {}):
        return
    emit("llamada_senal", {
        "de": request.sid,
        "nombre": current_user.nombre,
        "senal": datos["senal"],
    }, room=destinatario)


def salir_de_llamada(sala):
    presentes = participantes_llamada.get(sala, {})
    if request.sid in presentes:
        nombre = presentes.pop(request.sid)
        leave_room(sala)
        emit("llamada_se_fue", {"id": request.sid, "nombre": nombre}, room=sala)


@socketio.on("llamada_colgar")
def llamada_colgar(datos):
    id_equipo = datos.get("id_equipo")
    if not es_miembro_del_equipo(id_equipo):
        return
    salir_de_llamada(f"llamada_{id_equipo}")


@socketio.on("disconnect")
def al_desconectar():
    # Si cerró la pestaña en plena llamada, se le saca y se avisa a los demás.
    for sala in list(rooms()):
        if sala.startswith("llamada_"):
            salir_de_llamada(sala)


@socketio.on("enviar_mensaje")
def enviar_mensaje(datos):
    id_equipo = datos.get("id_equipo")
    texto = (datos.get("texto") or "").strip()
    if not texto or len(texto) > 1000 or not es_miembro_del_equipo(id_equipo):
        return

    mensaje = Mensaje(id_equipo=id_equipo, id_usuario=current_user.id, texto=texto)
    db.session.add(mensaje)
    db.session.commit()
    emitir_mensaje(mensaje)


@socketio.on("reaccionar_mensaje")
def reaccionar_mensaje(datos):
    id_equipo = datos.get("id_equipo")
    id_mensaje = datos.get("id_mensaje")
    emoji = datos.get("emoji")
    if not es_miembro_del_equipo(id_equipo) or emoji not in EMOJIS_REACCION:
        return

    mensaje = db.session.get(Mensaje, id_mensaje)
    if mensaje is None or mensaje.id_equipo != id_equipo:
        return

    reaccion = ReaccionMensaje.query.filter_by(
        id_mensaje=mensaje.id,
        id_usuario=current_user.id,
        emoji=emoji,
    ).first()
    activo = reaccion is None
    if reaccion:
        db.session.delete(reaccion)
    else:
        db.session.add(ReaccionMensaje(
            id_mensaje=mensaje.id,
            id_usuario=current_user.id,
            emoji=emoji,
        ))
    db.session.commit()

    resumen = resumen_reacciones(mensaje)
    emit("reacciones_mensaje", {
        "id_mensaje": mensaje.id,
        "emoji": emoji,
        "id_usuario": current_user.id,
        "activo": activo,
        "totales": resumen["totales"],
    }, room=f"equipo_{id_equipo}")
