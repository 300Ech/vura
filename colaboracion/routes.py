import base64

from flask import Blueprint
from flask_login import current_user
from flask_socketio import join_room, emit

from extensiones import db, socketio
from proyectos.models import Proyecto
from colaboracion.models import DocumentoYjs

colaboracion = Blueprint("colaboracion", __name__, static_folder="static",
                         static_url_path="/colaboracion/static")

TIPOS_DOCUMENTO = {"notas", "presentacion", "tablero_tareas"}
LIMITE_ESTADO = 2_000_000  # bytes por documento


def datos_validos(datos):
    """Verifica tipo de documento, proyecto y membresía del usuario conectado."""
    tipo = datos.get("tipo")
    id_proyecto = datos.get("id_proyecto")
    if tipo not in TIPOS_DOCUMENTO or not current_user.is_authenticated:
        return None
    proyecto = db.session.get(Proyecto, id_proyecto)
    if proyecto is None or not proyecto.equipo.es_miembro(current_user):
        return None
    return tipo, proyecto.id


def nombre_sala(tipo, id_proyecto):
    return f"documento_{tipo}_{id_proyecto}"


@socketio.on("doc_unirse")
def doc_unirse(datos):
    valido = datos_validos(datos)
    if not valido:
        return
    tipo, id_proyecto = valido
    sala = nombre_sala(tipo, id_proyecto)

    # Los clientes que ya están editando comparten su estado con el que llega.
    emit("doc_solicitar_estado", {"tipo": tipo, "id_proyecto": id_proyecto},
         room=sala, include_self=False)

    join_room(sala)

    documento = DocumentoYjs.query.filter_by(tipo=tipo, id_proyecto=id_proyecto).first()
    estado = base64.b64encode(documento.estado).decode() if documento and documento.estado else None
    emit("doc_estado", {"tipo": tipo, "id_proyecto": id_proyecto, "estado": estado})


@socketio.on("doc_actualizacion")
def doc_actualizacion(datos):
    valido = datos_validos(datos)
    if not valido or not datos.get("datos"):
        return
    tipo, id_proyecto = valido
    emit("doc_actualizacion", {"tipo": tipo, "id_proyecto": id_proyecto, "datos": datos["datos"]},
         room=nombre_sala(tipo, id_proyecto), include_self=False)


@socketio.on("doc_guardar")
def doc_guardar(datos):
    valido = datos_validos(datos)
    if not valido or not datos.get("estado"):
        return
    tipo, id_proyecto = valido

    try:
        estado = base64.b64decode(datos["estado"])
    except Exception:
        return
    if len(estado) > LIMITE_ESTADO:
        return

    documento = DocumentoYjs.query.filter_by(tipo=tipo, id_proyecto=id_proyecto).first()
    if documento is None:
        documento = DocumentoYjs(tipo=tipo, id_proyecto=id_proyecto)
        db.session.add(documento)
    documento.estado = estado
    db.session.commit()
