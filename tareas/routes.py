# este archivo controla la lógica del tablero de tareas, el cambio de estado de
# cada tarjeta, los comentarios y la subida de archivos adjuntos. su propósito es
# ofrecer un panel dinámico donde el grupo gestione su avance en tiempo real. lo
# hace actualizando la base de datos según el movimiento de tarjetas, notificando
# a los compañeros y almacenando archivos de hasta 5mb. se creó así para mantener
# una gestión de responsabilidades ágil y transparente.


# importamos herramientas para manejar datos organizados, archivos y horas
import json


import os
import uuid as modulo_uuid
from datetime import date

# importamos las funciones para responder pantallas web, datos y descargas de archivos
from flask import Blueprint, render_template, request, jsonify, abort, send_from_directory
# importamos la verificación de sesión del estudiante
from flask_login import login_required, current_user
# importamos la limpieza de nombres de archivos cargados
from werkzeug.utils import secure_filename

# importamos la función para notificar al equipo cuando se crean o mueven tareas
from chat.routes import notificar_equipo
# importamos la ruta de almacenamiento de archivos
from config import RUTA_DATOS
# importamos la base de datos y la función de hora local
from extensiones import db, hora_local
# importamos los modelos de proyecto y tareas
from proyectos.models import Proyecto
from tareas.models import Tarea, ComentarioTarea, ArchivoTarea, ESTADOS_TAREA, TITULOS_ESTADO

# creamos la sección de tareas
tareas = Blueprint("tareas", __name__, template_folder="templates",
                   static_folder="static", static_url_path="/tareas/static")

# límite máximo de tareas permitidas por tablero para mantener la fluidez
LIMITE_TAREAS = 300

# carpeta en la computadora donde se guardan físicamente las fotos y documentos adjuntados a las tareas
CARPETA_ARCHIVOS = os.path.join(RUTA_DATOS, "archivos")
# tipos de archivos permitidos para subir en las tareas (pdf, imágenes, word, ppt, excel, texto)
EXTENSIONES_PERMITIDAS = {"pdf", "png", "jpg", "jpeg", "gif", "docx", "pptx", "xlsx", "txt"}
# peso máximo permitido para cada archivo subido (máximo 5 megabytes)
TAMANO_MAXIMO = 5 * 1024 * 1024


def obtener_proyecto_de_miembro(id_proyecto):
    """comprueba que el proyecto exista y que el alumno conectado pertenezca al equipo dueño del proyecto."""
    proyecto = db.get_or_404(Proyecto, id_proyecto)
    if not proyecto.equipo.es_miembro(current_user):
        abort(403)
    return proyecto


# pantalla principal del tablero de tareas por columnas (pendiente, en progreso, terminada)
@tareas.route("/proyectos/<int:id_proyecto>/tareas")
@login_required
def tablero(id_proyecto):
    proyecto = obtener_proyecto_de_miembro(id_proyecto)

    # organizamos las tarjetas de tareas por columnas según su estado
    columnas = {estado: [] for estado in ESTADOS_TAREA}
    for tarea in proyecto.tareas:
        columnas[tarea.estado].append(tarea)

    # datos completos del tablero formateados para cargarse dinámicamente en pantalla
    datos_tablero = {
        "id_proyecto": proyecto.id,
        "tareas": [
            {
                "uuid": t.uuid,
                "titulo": t.titulo,
                "descripcion": t.descripcion,
                "estado": t.estado,
                "id_asignado": t.id_asignado,
                "fecha_limite": t.fecha_limite.isoformat() if t.fecha_limite else None,
                "creado_en": t.id,
                "orden": t.orden if t.orden is not None else t.id,
            }
            for t in proyecto.tareas
        ],
        "contadores": contar_comentarios_y_archivos(proyecto),
        "miembros": [
            {"id": m.usuario.id, "nombre": m.usuario.nombre}
            for m in proyecto.equipo.miembros
        ],
    }
    # previene problemas de seguridad al incrustar el contenido del tablero en la página
    datos_tablero = json.dumps(datos_tablero, ensure_ascii=False).replace("<", "\\u003c")

    return render_template("tareas/tablero.html", proyecto=proyecto, columnas=columnas,
                           titulos_estado=TITULOS_ESTADO, datos_tablero=datos_tablero)


# guarda las modificaciones del tablero de tareas cuando los alumnos mueven tarjetas de una columna a otra
@tareas.route("/proyectos/<int:id_proyecto>/tareas/copia", methods=["POST"])
@login_required
def guardar_copia(id_proyecto):
    proyecto = obtener_proyecto_de_miembro(id_proyecto)

    datos = request.get_json(silent=True)
    if not datos or not isinstance(datos.get("tareas"), list) or len(datos["tareas"]) > LIMITE_TAREAS:
        abort(400)

    ids_miembros = {m.id_usuario for m in proyecto.equipo.miembros}
    existentes = {t.uuid: t for t in proyecto.tareas}
    uuids_recibidos = set()

    # recorremos cada tarea recibida para crearla o actualizar su columna de estado
    for entrada in datos["tareas"]:
        uuid_tarea = str(entrada.get("uuid") or "")[:36]
        titulo = str(entrada.get("titulo") or "").strip()[:120]
        if not uuid_tarea or not titulo:
            continue

        estado = entrada.get("estado")
        if estado not in ESTADOS_TAREA:
            estado = "pendiente"

        id_asignado = entrada.get("id_asignado")
        if id_asignado not in ids_miembros:
            id_asignado = None

        try:
            fecha_limite = date.fromisoformat(entrada["fecha_limite"]) if entrada.get("fecha_limite") else None
        except (ValueError, TypeError):
            fecha_limite = None

        descripcion = (str(entrada.get("descripcion") or "").strip() or None)
        if descripcion:
            descripcion = descripcion[:500]
        tarea = existentes.get(uuid_tarea)
        try:
            orden = int(entrada.get("orden"))
        except (TypeError, ValueError):
            orden = tarea.id if tarea else 0

        uuids_recibidos.add(uuid_tarea)
        # si es una tarea totalmente nueva la agregamos y notificamos al equipo
        if tarea is None:
            tarea = Tarea(uuid=uuid_tarea, id_proyecto=proyecto.id)
            db.session.add(tarea)
            notificar_equipo(
                proyecto.equipo.id,
                f"🗂️ Tareas de {proyecto.nombre}",
                f"{current_user.nombre} creó la tarea «{titulo}».",
                f"/proyectos/{proyecto.id}/tareas",
            )
        # si se movió la tarea a otra columna, enviamos notificación al resto de compañeros
        elif tarea.estado != estado:
            notificar_equipo(
                proyecto.equipo.id,
                f"🗂️ Tareas de {proyecto.nombre}",
                f"{current_user.nombre} movió «{titulo}» a {TITULOS_ESTADO[estado].lower()}.",
                f"/proyectos/{proyecto.id}/tareas",
            )

        tarea.titulo = titulo
        tarea.descripcion = descripcion
        tarea.estado = estado
        tarea.orden = orden
        tarea.id_asignado = id_asignado
        tarea.fecha_limite = fecha_limite
        tarea.actualizado_por = current_user.id

    # si una tarea fue eliminada del tablero, borramos sus comentarios y archivos adjuntos
    for uuid_tarea, tarea in existentes.items():
        if uuid_tarea not in uuids_recibidos:
            borrar_comentarios_y_archivos(uuid_tarea)
            db.session.delete(tarea)

    db.session.commit()
    return jsonify({"guardado": True})


def contar_comentarios_y_archivos(proyecto):
    """cuenta cuántos comentarios y archivos tiene cada tarea para mostrar el numerito en la tarjeta visual."""
    uuids = [t.uuid for t in proyecto.tareas]
    contadores = {u: {"comentarios": 0, "archivos": 0} for u in uuids}
    for comentario in ComentarioTarea.query.filter(ComentarioTarea.uuid_tarea.in_(uuids)):
        contadores[comentario.uuid_tarea]["comentarios"] += 1
    for archivo in ArchivoTarea.query.filter(ArchivoTarea.uuid_tarea.in_(uuids)):
        contadores[archivo.uuid_tarea]["archivos"] += 1
    return contadores


def borrar_comentarios_y_archivos(uuid_tarea):
    """borra del disco y de la base de datos los comentarios y archivos vinculados a una tarea eliminada."""
    ComentarioTarea.query.filter_by(uuid_tarea=uuid_tarea).delete()
    for archivo in ArchivoTarea.query.filter_by(uuid_tarea=uuid_tarea):
        ruta = os.path.join(CARPETA_ARCHIVOS, archivo.nombre_guardado)
        if os.path.exists(ruta):
            os.remove(ruta)
        db.session.delete(archivo)


# devuelve la lista de comentarios y archivos subidos dentro de una tarjeta de tarea específica
@tareas.route("/proyectos/<int:id_proyecto>/tareas/<uuid_tarea>/detalles")
@login_required
def detalles_tarea(id_proyecto, uuid_tarea):
    obtener_proyecto_de_miembro(id_proyecto)
    comentarios = (ComentarioTarea.query.filter_by(uuid_tarea=uuid_tarea)
                   .order_by(ComentarioTarea.id).all())
    archivos = (ArchivoTarea.query.filter_by(uuid_tarea=uuid_tarea)
                .order_by(ArchivoTarea.id).all())
    return jsonify({
        "comentarios": [
            {"autor": c.autor.nombre, "texto": c.texto, "fecha": hora_local(c.creado_en)}
            for c in comentarios
        ],
        "archivos": [
            {"id": a.id, "nombre": a.nombre_original, "autor": a.autor.nombre}
            for a in archivos
        ],
    })


# permite a un alumno dejar un comentario o pregunta dentro de una tarea en particular
@tareas.route("/proyectos/<int:id_proyecto>/tareas/<uuid_tarea>/comentarios", methods=["POST"])
@login_required
def comentar_tarea(id_proyecto, uuid_tarea):
    obtener_proyecto_de_miembro(id_proyecto)
    datos = request.get_json(silent=True)
    texto = (datos or {}).get("texto", "").strip()[:300]
    if not texto:
        abort(400)
    comentario = ComentarioTarea(uuid_tarea=uuid_tarea[:36], id_autor=current_user.id, texto=texto)
    db.session.add(comentario)
    db.session.commit()

    # notificamos al equipo sobre el nuevo comentario agregado
    proyecto = db.session.get(Proyecto, id_proyecto)
    tarea = Tarea.query.filter_by(uuid=uuid_tarea[:36]).first()
    notificar_equipo(
        proyecto.equipo.id,
        f"💬 Comentario en «{tarea.titulo if tarea else 'una tarea'}»",
        f"{current_user.nombre}: {texto[:80]}",
        f"/proyectos/{id_proyecto}/tareas",
    )
    return jsonify({"autor": current_user.nombre, "texto": comentario.texto,
                    "fecha": hora_local(comentario.creado_en)})


# permite subir un documento o imagen adjunta a una tarjeta de tarea específica
@tareas.route("/proyectos/<int:id_proyecto>/tareas/<uuid_tarea>/archivos", methods=["POST"])
@login_required
def subir_archivo(id_proyecto, uuid_tarea):
    obtener_proyecto_de_miembro(id_proyecto)
    archivo = request.files.get("archivo")
    if not archivo or not archivo.filename:
        abort(400)

    nombre_original = secure_filename(archivo.filename)[:120]
    extension = nombre_original.rsplit(".", 1)[-1].lower() if "." in nombre_original else ""
    # rechaza archivos con formato no permitido (como ejecutables sospechosos)
    if extension not in EXTENSIONES_PERMITIDAS:
        return jsonify({"error": "Tipo de archivo no permitido."}), 400

    contenido = archivo.read()
    # rechaza archivos que superen los 5 megabytes de peso
    if len(contenido) > TAMANO_MAXIMO:
        return jsonify({"error": "El archivo pesa más de 5 MB."}), 400

    # le asigna un nombre secreto e irrepetible para guardarlo en la carpeta sin sobreescribir otros
    nombre_guardado = modulo_uuid.uuid4().hex + "." + extension
    os.makedirs(CARPETA_ARCHIVOS, exist_ok=True)
    with open(os.path.join(CARPETA_ARCHIVOS, nombre_guardado), "wb") as destino:
        destino.write(contenido)

    registro = ArchivoTarea(uuid_tarea=uuid_tarea[:36], id_autor=current_user.id,
                            nombre_original=nombre_original, nombre_guardado=nombre_guardado)
    db.session.add(registro)
    db.session.commit()

    proyecto = db.session.get(Proyecto, id_proyecto)
    tarea = Tarea.query.filter_by(uuid=uuid_tarea[:36]).first()
    notificar_equipo(
        proyecto.equipo.id,
        f"📎 Archivo en «{tarea.titulo if tarea else 'una tarea'}»",
        f"{current_user.nombre} subió {nombre_original}.",
        f"/proyectos/{id_proyecto}/tareas",
    )
    return jsonify({"id": registro.id, "nombre": registro.nombre_original, "autor": current_user.nombre})


# permite descargar en la computadora un archivo adjunto que subió un compañero a una tarea
@tareas.route("/proyectos/<int:id_proyecto>/archivos/<int:id_archivo>")
@login_required
def descargar_archivo(id_proyecto, id_archivo):
    obtener_proyecto_de_miembro(id_proyecto)
    archivo = db.get_or_404(ArchivoTarea, id_archivo)
    return send_from_directory(CARPETA_ARCHIVOS, archivo.nombre_guardado,
                               as_attachment=True, download_name=archivo.nombre_original)

