# este archivo gestiona la transmisión en vivo para sincronizar la pizarra de
# dibujo, las diapositivas y las tareas entre las pantallas de los alumnos. su
# propósito es lograr que cuando un integrante dibuje, agregue una nota o mueva
# un objeto en la pizarra, sus compañeros lo vean al instante en sus pantallas.
# lo hace organizando salas de comunicación donde se envían y reciben los trazos
# en tiempo real. elegimos la herramienta de transmisión en vivo socketio para
# evitar que los estudiantes tengan que recargar la página para ver lo que dibujan
# sus amigos. se construyó así para brindar una experiencia colaborativa fluida.


# importamos la herramienta para codificar y decodificar datos en texto seguro
import base64

# importamos la herramienta para crear la sección
from flask import Blueprint

# importamos la función para conocer al usuario conectado
from flask_login import current_user
# importamos la transmisión de mensajes y salas en tiempo real
from flask_socketio import join_room, emit

# importamos la base de datos y la transmisión en vivo
from extensiones import db, socketio

# importamos los modelos de proyectos y del documento colaborativo
from proyectos.models import Proyecto
from colaboracion.models import DocumentoYjs

# agrupamos las rutas de sincronización en tiempo real
colaboracion = Blueprint("colaboracion", __name__, static_folder="static",
                         static_url_path="/colaboracion/static")

# los tres tipos de herramientas colaborativas en vura (notas/pizarra, presentación y tablero de tareas)
TIPOS_DOCUMENTO = {"notas", "presentacion", "tablero_tareas"}
# límite máximo de tamaño para el documento en tiempo real (2 megabytes)
LIMITE_ESTADO = 2_000_000


def datos_validos(datos):
    """verifica que el alumno pertenezca al equipo y tenga permiso de colaborar en este proyecto."""
    tipo = datos.get("tipo")
    id_proyecto = datos.get("id_proyecto")
    if tipo not in TIPOS_DOCUMENTO or not current_user.is_authenticated:
        return None
    proyecto = db.session.get(Proyecto, id_proyecto)
    if proyecto is None or not proyecto.equipo.es_miembro(current_user):
        return None
    return tipo, proyecto.id


def nombre_sala(tipo, id_proyecto):
    """genera el nombre de la sala virtual donde se conectan los alumnos que editan la misma pantalla."""
    return f"documento_{tipo}_{id_proyecto}"


# evento cuando un estudiante abre la pizarra, presentación o tablero para unirse a la edición compartida
@socketio.on("doc_unirse")
def doc_unirse(datos):
    valido = datos_validos(datos)
    if not valido:
        return
    tipo, id_proyecto = valido
    sala = nombre_sala(tipo, id_proyecto)

    # le solicita a los alumnos que ya están conectados que envíen el estado actual de la pantalla
    emit("doc_solicitar_estado", {"tipo": tipo, "id_proyecto": id_proyecto},
         room=sala, include_self=False)

    join_room(sala)

    # carga la última copia del documento guardada en la base de datos para entregársela al alumno que acaba de entrar
    documento = DocumentoYjs.query.filter_by(tipo=tipo, id_proyecto=id_proyecto).first()
    estado = base64.b64encode(documento.estado).decode() if documento and documento.estado else None
    emit("doc_estado", {"tipo": tipo, "id_proyecto": id_proyecto, "estado": estado})


# retransmite inmediatamente cada trazo, letra o movimiento realizado por un estudiante hacia las pantallas de sus compañeros
@socketio.on("doc_actualizacion")
def doc_actualizacion(datos):
    valido = datos_validos(datos)
    if not valido or not datos.get("datos"):
        return
    tipo, id_proyecto = valido
    emit("doc_actualizacion", {"tipo": tipo, "id_proyecto": id_proyecto, "datos": datos["datos"]},
         room=nombre_sala(tipo, id_proyecto), include_self=False)


# guarda el avance acumulado de la pantalla colaborativa en la base de datos de respaldo
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

