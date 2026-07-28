import time

from flask import Blueprint, render_template, abort, request
from flask_login import login_required, current_user
from flask_socketio import join_room, leave_room, rooms, emit

from extensiones import db, socketio, hora_local
from equipos.models import Equipo, MiembroEquipo
from chat.models import Mensaje

chat = Blueprint("chat", __name__, template_folder="templates",
                 static_folder="static", static_url_path="/chat/static")


def obtener_equipo_de_miembro(id_equipo):
    equipo = db.session.get(Equipo, id_equipo)
    if equipo is None:
        abort(404)
    if not equipo.es_miembro(current_user):
        abort(403)
    return equipo


@chat.route("/equipos/<int:id_equipo>/chat")
@login_required
def sala(id_equipo):
    equipo = obtener_equipo_de_miembro(id_equipo)
    mensajes = (Mensaje.query.filter_by(id_equipo=equipo.id)
                .order_by(Mensaje.enviado_en)
                .limit(200).all())
    return render_template("chat/sala.html", equipo=equipo, mensajes=mensajes)


@chat.route("/equipos/<int:id_equipo>/llamada")
@login_required
def llamada(id_equipo):
    equipo = obtener_equipo_de_miembro(id_equipo)
    return render_template("chat/llamada.html", equipo=equipo)


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

    equipo = db.session.get(Equipo, id_equipo)
    emit("nuevo_mensaje", {
        "nombre": current_user.nombre,
        "id_usuario": current_user.id,
        "texto": mensaje.texto,
        "hora": hora_local(mensaje.enviado_en, "%H:%M"),
        "id_equipo": equipo.id,
        "nombre_equipo": equipo.nombre,
    }, room=f"equipo_{id_equipo}")
