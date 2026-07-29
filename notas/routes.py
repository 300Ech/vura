import json
import os
import uuid as modulo_uuid

from flask import Blueprint, render_template, request, jsonify, abort, send_from_directory
from flask_login import login_required, current_user
from werkzeug.utils import secure_filename

from config import RUTA_DATOS
from extensiones import db, hora_local
from proyectos.models import Proyecto
from notas.models import Nota

notas = Blueprint("notas", __name__, template_folder="templates",
                  static_folder="static", static_url_path="/notas/static")

LIMITE_CONTENIDO = 500_000  # JSON de la pizarra (los archivos van aparte, en disco)

# Medios de la pizarra (fotos, Voz-it y videos): se guardan en disco;
# en Yjs solo viaja la URL corta del archivo.
CARPETA_MEDIOS = os.path.join(RUTA_DATOS, "medios_pizarra")
EXTENSIONES_IMAGEN = {"png", "jpg", "jpeg", "gif", "webp"}
EXTENSIONES_AUDIO = {"webm", "ogg", "mp3", "m4a", "wav"}
EXTENSIONES_VIDEO = {"webm", "mp4"}
TAMANOS_MAXIMOS = {
    "imagen": 10 * 1024 * 1024,
    "audio": 5 * 1024 * 1024,
    "video": 25 * 1024 * 1024,
}


def obtener_proyecto_de_miembro(id_proyecto):
    proyecto = db.get_or_404(Proyecto, id_proyecto)
    if not proyecto.equipo.es_miembro(current_user):
        abort(403)
    return proyecto


@notas.route("/proyectos/<int:id_proyecto>/notas")
@login_required
def ver_notas(id_proyecto):
    proyecto = obtener_proyecto_de_miembro(id_proyecto)
    nota = proyecto.nota
    contenido = nota.contenido_json if nota and nota.contenido_json else "null"
    # Se escapa '<' para que un texto con '</script>' no pueda romper la etiqueta donde va incrustado el JSON.
    contenido = contenido.replace("<", "\\u003c")

    # Todos los proyectos del usuario, para el selector con el que se cambia de pizarra.
    from equipos.models import MiembroEquipo
    ids_equipos = [m.id_equipo for m in MiembroEquipo.query.filter_by(id_usuario=current_user.id)]
    mis_proyectos = (Proyecto.query.filter(Proyecto.id_equipo.in_(ids_equipos))
                     .order_by(Proyecto.nombre).all())

    return render_template("notas/notas.html", proyecto=proyecto, nota=nota,
                           contenido=contenido, mis_proyectos=mis_proyectos)


@notas.route("/proyectos/<int:id_proyecto>/notas/guardar", methods=["POST"])
@login_required
def guardar_notas(id_proyecto):
    proyecto = obtener_proyecto_de_miembro(id_proyecto)

    datos = request.get_json(silent=True)
    if not datos or "contenido" not in datos:
        abort(400)

    contenido = json.dumps(datos["contenido"], ensure_ascii=False)
    if len(contenido) > LIMITE_CONTENIDO:
        abort(413)

    nota = proyecto.nota
    if nota is None:
        nota = Nota(id_proyecto=proyecto.id)
        db.session.add(nota)

    nota.contenido_json = contenido
    nota.actualizado_por = current_user.id
    db.session.commit()

    # Aviso al equipo, como mucho una vez cada 10 minutos por persona
    # (las notas se guardan solas cada pocos segundos mientras se escribe).
    from chat.routes import notificar_equipo
    notificar_equipo(
        proyecto.equipo.id,
        f"🗒️ Pizarra de {proyecto.nombre}",
        f"{current_user.nombre} está editando la pizarra.",
        f"/proyectos/{proyecto.id}/notas",
        clave_repeticion=f"nota_{proyecto.id}_{current_user.id}",
        minutos_espera=10,
    )

    return jsonify({
        "guardado": True,
        "actualizado_en": hora_local(nota.actualizado_en, "%H:%M:%S"),
    })


@notas.route("/proyectos/<int:id_proyecto>/pizarra/medios", methods=["POST"])
@login_required
def subir_medio_pizarra(id_proyecto):
    """Sube una foto, un Voz-it o un video para pegarlo en la pizarra."""
    obtener_proyecto_de_miembro(id_proyecto)
    archivo = request.files.get("archivo")
    tipo = (request.form.get("tipo") or "").strip()
    if not archivo or not archivo.filename or tipo not in TAMANOS_MAXIMOS:
        abort(400)

    nombre_original = secure_filename(archivo.filename) or f"medio.{tipo}"
    extension = nombre_original.rsplit(".", 1)[-1].lower() if "." in nombre_original else ""
    permitidas = {
        "imagen": EXTENSIONES_IMAGEN,
        "audio": EXTENSIONES_AUDIO,
        "video": EXTENSIONES_VIDEO,
    }[tipo]
    if extension not in permitidas:
        return jsonify({"error": f"Tipo de archivo no permitido para {tipo}."}), 400

    contenido = archivo.read()
    if len(contenido) > TAMANOS_MAXIMOS[tipo]:
        limite_mb = TAMANOS_MAXIMOS[tipo] // (1024 * 1024)
        return jsonify({"error": f"El archivo pesa más de {limite_mb} MB."}), 400

    nombre_guardado = f"{modulo_uuid.uuid4().hex}.{extension}"
    os.makedirs(CARPETA_MEDIOS, exist_ok=True)
    with open(os.path.join(CARPETA_MEDIOS, nombre_guardado), "wb") as destino:
        destino.write(contenido)

    url = f"/proyectos/{id_proyecto}/pizarra/medios/{nombre_guardado}"
    return jsonify({"url": url, "nombre": nombre_original, "tipo": tipo})


@notas.route("/proyectos/<int:id_proyecto>/pizarra/medios/<nombre_archivo>")
@login_required
def servir_medio_pizarra(id_proyecto, nombre_archivo):
    obtener_proyecto_de_miembro(id_proyecto)
    # Solo nombres inventados por nosotros (uuid + extensión), sin rutas.
    if "/" in nombre_archivo or "\\" in nombre_archivo or ".." in nombre_archivo:
        abort(404)
    return send_from_directory(CARPETA_MEDIOS, nombre_archivo)
