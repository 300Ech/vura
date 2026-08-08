# este archivo gestiona la sala de chat en tiempo real, el envío de notas de voz/
# imágenes, la reacción con emojis y las videollamadas. su propósito es permitir
# que los integrantes del grupo se comuniquen al instante sin salir de la app.
# lo hace transmitiendo mensajes en vivo, guardando adjuntos en disco
# y conectando videollamadas de hasta 6 miembros. se construyó así para solucionar
# los problemas de comunicación en proyectos escolares.


# importamos herramientas para procesar datos, manejar carpetas y generar códigos
import json
import os
import time
import uuid as modulo_uuid

# importamos las funciones de flask para pantallas web, respuestas de datos y descargas
from flask import Blueprint, render_template, request, jsonify, abort, send_from_directory, current_app
# importamos la verificación de sesión del alumno
from flask_login import login_required, current_user
# importamos las utilidades de comunicación en vivo para chat y videollamadas
from flask_socketio import join_room, leave_room, rooms, emit
# importamos la limpieza de nombres de archivos subidos
from werkzeug.utils import secure_filename

# importamos la ruta donde se guardan los archivos
from config import RUTA_DATOS
# importamos la base de datos, las conexiones en vivo y la hora local
from extensiones import db, socketio, hora_local
# importamos las plantillas de equipos, proyectos y mensajes de chat
from equipos.models import Equipo, MiembroEquipo
from proyectos.models import Proyecto
from chat.models import Mensaje, AdjuntoMensaje, ReaccionMensaje

# agrupamos las pantallas y eventos del chat bajo la sección chat
chat = Blueprint("chat", __name__, template_folder="templates",
                 static_folder="static", static_url_path="/chat/static")

# carpeta donde se almacenan las fotos y audios enviados por el chat del equipo
CARPETA_MEDIOS_CHAT = os.path.join(RUTA_DATOS, "medios_chat")
# emojis autorizados para reaccionar rápidamente a mensajes de compañeros
EMOJIS_REACCION = {"👍", "❤️", "😂", "🎉", "👀"}
# formatos permitidos para enviar imágenes y audios de voz por el chat
EXTENSIONES_CHAT = {
    "imagen": {"png", "jpg", "jpeg", "gif", "webp"},
    "audio": {"webm", "ogg", "mp3", "m4a", "wav"},
}
# peso máximo permitido para fotos (10mb) y notas de voz (5mb) en el chat
TAMANOS_CHAT = {
    "imagen": 10 * 1024 * 1024,
    "audio": 5 * 1024 * 1024,
}


def obtener_equipo_de_miembro(id_equipo):
    """comprueba que el equipo exista y que el alumno conectado pertenezca al mismo."""
    equipo = db.session.get(Equipo, id_equipo)
    if equipo is None:
        abort(404)
    if not equipo.es_miembro(current_user):
        abort(403)
    return equipo


def resumen_reacciones(mensaje):
    """cuenta cuántas reacciones de cada emoji tiene un mensaje y marca si el alumno actual reaccionó."""
    resumen = {}
    mias = []
    for reaccion in mensaje.reacciones:
        resumen[reaccion.emoji] = resumen.get(reaccion.emoji, 0) + 1
        if reaccion.id_usuario == current_user.id:
            mias.append(reaccion.emoji)
    return {"totales": resumen, "mias": mias}


def serializar_mensaje(mensaje):
    """prepara la información del mensaje (texto, hora, foto/audio y reacciones) para transmitirlo al instante."""
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
    """transmite el mensaje en vivo a todos los compañeros del equipo conectados en la sala del chat."""
    equipo = db.session.get(Equipo, mensaje.id_equipo)
    datos = serializar_mensaje(mensaje)
    datos["nombre_equipo"] = equipo.nombre
    socketio.emit("nuevo_mensaje", datos, room=f"equipo_{mensaje.id_equipo}")


# pantalla principal del chat del equipo
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
            
    # carga los últimos 200 mensajes enviados en el equipo para mostrarlos en el historial
    mensajes = (Mensaje.query.filter_by(id_equipo=equipo.id)
                .order_by(Mensaje.enviado_en)
                .limit(200).all())
    datos_mensajes = json.dumps(
        [serializar_mensaje(m) for m in mensajes],
        ensure_ascii=False,
    ).replace("<", "\\u003c")
    return render_template("chat/sala.html", equipo=equipo, datos_mensajes=datos_mensajes, proyecto=proyecto)


# obtiene los mensajes más recientes en formato ligero para el panel flotante de la pizarra
@chat.route("/equipos/<int:id_equipo>/chat/mensajes")
@login_required
def mensajes_recientes(id_equipo):
    obtener_equipo_de_miembro(id_equipo)
    mensajes = (Mensaje.query.filter_by(id_equipo=id_equipo)
                .order_by(Mensaje.enviado_en.desc())
                .limit(50).all())
    return jsonify({"mensajes": [serializar_mensaje(m) for m in reversed(mensajes)]})


# opción para subir fotos o notas de voz grabadas al chat
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
    # comprueba que el audio o foto no supere el peso máximo permitido
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


# entrega la foto o nota de voz al navegador para que los compañeros puedan verla o escucharla
@chat.route("/equipos/<int:id_equipo>/chat/medios/<nombre_archivo>")
@login_required
def servir_medio_chat(id_equipo, nombre_archivo):
    obtener_equipo_de_miembro(id_equipo)
    if "/" in nombre_archivo or "\\" in nombre_archivo or ".." in nombre_archivo:
        abort(404)
    return send_from_directory(CARPETA_MEDIOS_CHAT, nombre_archivo)


# pantalla de la videollamada de voz y video en vivo
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
            
    return render_template(
        "chat/llamada.html", equipo=equipo, proyecto=proyecto,
        compartir_pantalla_habilitado=current_app.config["COMPARTIR_PANTALLA_HABILITADO"],
        desenfoque_fondo_habilitado=current_app.config["DESENFOQUE_FONDO_HABILITADO"],
    )


# verifica que el usuario conectado sea un miembro oficial del equipo
def es_miembro_del_equipo(id_equipo):
    equipo = db.session.get(Equipo, id_equipo)
    return (equipo is not None
            and current_user.is_authenticated
            and equipo.es_miembro(current_user))


# conecta la pestaña del alumno a la sala del chat de su equipo
@socketio.on("unirse_sala")
def unirse_sala(datos):
    id_equipo = datos.get("id_equipo")
    if not es_miembro_del_equipo(id_equipo):
        return
    join_room(f"equipo_{id_equipo}")


_ultimo_aviso = {}


def notificar_equipo(id_equipo, titulo, texto, enlace, clave_repeticion=None, minutos_espera=0):
    """envía una alerta flotante en vivo a los compañeros del equipo cuando hay cambios en las tareas o proyectos."""
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


# conecta al alumno a las notificaciones de todos sus equipos para recibir avisos aunque esté navegando en otra parte
@socketio.on("unirse_notificaciones")
def unirse_notificaciones():
    if not current_user.is_authenticated:
        return
    membresias = MiembroEquipo.query.filter_by(id_usuario=current_user.id).all()
    for membresia in membresias:
        join_room(f"equipo_{membresia.id_equipo}")


# transmite el aviso de "alguien está escribiendo..." a los demás miembros del equipo
@socketio.on("escribiendo")
def escribiendo(datos):
    id_equipo = datos.get("id_equipo")
    if not es_miembro_del_equipo(id_equipo):
        return
    emit("usuario_escribiendo", {"nombre": current_user.nombre},
         room=f"equipo_{id_equipo}", include_self=False)


# transmite la posición del mouse del alumno a los compañeros en la pizarra colaborativa
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


# limitamos las videollamadas a máximo 6 personas a la vez para evitar que el video se congele o consuma todo el internet del colegio
MAXIMO_PARTICIPANTES = 6

participantes_llamada = {}


# maneja la entrada de un alumno a la videollamada grupal
@socketio.on("llamada_unirse")
def llamada_unirse(datos):
    id_equipo = datos.get("id_equipo")
    if not es_miembro_del_equipo(id_equipo):
        return
    sala = f"llamada_{id_equipo}"
    presentes = participantes_llamada.setdefault(sala, {})

    # si ya hay 6 alumnos en la llamada, avisa que la sala está llena
    if len(presentes) >= MAXIMO_PARTICIPANTES:
        emit("llamada_llena", {"maximo": MAXIMO_PARTICIPANTES})
        return

    emit("llamada_participantes", {
        "participantes": [{"id": id_conexion, "nombre": nombre}
                          for id_conexion, nombre in presentes.items()],
    })

    # si es la primera persona en entrar, avisa a todo el grupo que inició una videollamada
    if len(presentes) == 0:
        equipo = db.session.get(Equipo, id_equipo)
        emit("llamada_iniciada", {
            "nombre": current_user.nombre,
            "id_equipo": equipo.id,
            "nombre_equipo": equipo.nombre,
        }, room=f"equipo_{id_equipo}", include_self=False)

    presentes[request.sid] = current_user.nombre
    join_room(sala)


# transmite las señales de cámara y micrófono entre los alumnos en la videollamada
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
    """retira al alumno de la sala de videollamada y avisa a sus compañeros."""
    presentes = participantes_llamada.get(sala, {})
    if request.sid in presentes:
        nombre = presentes.pop(request.sid)
        leave_room(sala)
        emit("llamada_se_fue", {"id": request.sid, "nombre": nombre}, room=sala)


# acción al colgar el botón rojo de la videollamada
@socketio.on("llamada_colgar")
def llamada_colgar(datos):
    id_equipo = datos.get("id_equipo")
    if not es_miembro_del_equipo(id_equipo):
        return
    salir_de_llamada(f"llamada_{id_equipo}")


# desconecta automáticamente al alumno si cierra la pestaña del navegador durante la llamada
@socketio.on("disconnect")
def al_desconectar():
    for sala in list(rooms()):
        if sala.startswith("llamada_"):
            salir_de_llamada(sala)


# recibe y transmite un nuevo mensaje de texto enviado por el alumno en el chat
@socketio.on("enviar_mensaje")
def enviar_mensaje(datos):
    id_equipo = datos.get("id_equipo")
    texto = (datos.get("texto") or "").strip()
    if not texto or len(texto) > 1000 or not es_miembro_del_equipo(id_equipo):
        return {"ok": False}

    mensaje = Mensaje(id_equipo=id_equipo, id_usuario=current_user.id, texto=texto)
    db.session.add(mensaje)
    db.session.commit()
    emitir_mensaje(mensaje)
    return {"ok": True, "id": mensaje.id}


# guarda o retira una reacción de emoji (👍, ❤️, 😂, 🎉, 👀) colocada en un mensaje
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

