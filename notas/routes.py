# este archivo administra la pizarra colaborativa digital del proyecto. la
# pizarra es un lienzo visual donde el equipo realiza lluvias de ideas, traza
# esquemas, escribe notas adhesivas de colores y pega fotos, audios o videos.
# su propósito es dar un espacio gráfico e interactivo para organizar el trabajo.
# lo hace recibiendo los trazos e imágenes del lienzo y guardándolos en disco.
# elegimos la herramienta gráfica interactiva del navegador porque
# permite mover y escalar figuras libremente, y usamos carpetas de medios para
# que las fotos y audios carguen velozmente sin saturar la base de datos.
# se creó así para solucionar la falta de un espacio creativo en grupo.


# importamos herramientas para manejar datos organizados, archivos e identificadores únicos
import json
import os
import uuid as modulo_uuid

# importamos funciones de flask para cargar pantallas web, peticiones de datos y servir archivos
from flask import Blueprint, render_template, request, jsonify, abort, send_from_directory
# importamos la verificación de sesión del alumno
from flask_login import login_required, current_user
# importamos la limpieza de nombres de archivos subidos
from werkzeug.utils import secure_filename

# importamos la ruta donde se guardan los datos
from config import RUTA_DATOS
# importamos la base de datos y la función de hora local
from extensiones import db, hora_local
# importamos los modelos de proyectos y notas
from proyectos.models import Proyecto
from notas.models import Nota

# creamos la sección notas
notas = Blueprint("notas", __name__, template_folder="templates",
                  static_folder="static", static_url_path="/notas/static")


# límite de tamaño del contenido escrito en la pizarra
LIMITE_CONTENIDO = 500_000

# carpeta donde se almacenan físicamente los audios, videos y fotos pegados en la pizarra
CARPETA_MEDIOS = os.path.join(RUTA_DATOS, "medios_pizarra")
# extensiones de imágenes permitidas
EXTENSIONES_IMAGEN = {"png", "jpg", "jpeg", "gif", "webp"}
# extensiones de notas de voz permitidas
EXTENSIONES_AUDIO = {"webm", "ogg", "mp3", "m4a", "wav"}
# extensiones de video permitidas
EXTENSIONES_VIDEO = {"webm", "mp4"}
# peso máximo para fotos (10mb), audios de voz (5mb) y videos (25mb) pegados en la pizarra
TAMANOS_MAXIMOS = {
    "imagen": 10 * 1024 * 1024,
    "audio": 5 * 1024 * 1024,
    "video": 25 * 1024 * 1024,
}


# función auxiliar que comprueba si el proyecto existe y si el alumno conectado es parte del equipo.
# sirve para proteger la pizarra y evitar que estudiantes de otros grupos entren a ver o modificar bocetos.
def obtener_proyecto_de_miembro(id_proyecto):
    proyecto = db.get_or_404(Proyecto, id_proyecto)
    if not proyecto.equipo.es_miembro(current_user):
        abort(403)
    return proyecto


# función que abre la pantalla principal de la pizarra de dibujo y notas adhesivas.
# sirve para mostrar a los alumnos su lienzo interactivo con sus figuras, notas y fotos.
# lo hace buscando la nota guardada del proyecto y cargando la lista de todos los proyectos del alumno para cambiar rápido.
# se diseñó así para que los estudiantes tengan un espacio visual de planificación dentro de su proyecto.
@notas.route("/proyectos/<int:id_proyecto>/notas")
@login_required
def ver_notas(id_proyecto):
    proyecto = obtener_proyecto_de_miembro(id_proyecto)
    nota = proyecto.nota
    contenido = nota.contenido_json if nota and nota.contenido_json else "null"
    # previene problemas de seguridad al insertar el contenido de la pizarra en el archivo html
    contenido = contenido.replace("<", "\\u003c")

    # cargamos todos los proyectos a los que pertenece el alumno para el menú desplegable de cambio rápido
    from equipos.models import MiembroEquipo
    ids_equipos = [m.id_equipo for m in MiembroEquipo.query.filter_by(id_usuario=current_user.id)]
    mis_proyectos = (Proyecto.query.filter(Proyecto.id_equipo.in_(ids_equipos))
                     .order_by(Proyecto.nombre).all())

    return render_template("notas/notas.html", proyecto=proyecto, nota=nota,
                           contenido=contenido, mis_proyectos=mis_proyectos)


# función que guarda los cambios de la pizarra (trazos, texto, figuras, notas adhesivas) en la base de datos.
# sirve para conservar el avance del trabajo gráfico para que no se pierda al cerrar el navegador.
# lo hace recibiendo los datos del lienzo y enviando además un aviso flotante a los demás compañeros del equipo.
# se creó de esta manera para garantizar que las ideas dibujadas queden almacenadas y todos sepan cuando alguien edita.
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

    # envía un aviso flotante a los compañeros del grupo (máximo una vez cada 10 minutos para no molestar)
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


# función que permite subir imágenes, notas de voz grabadas o clips de video para pegarlos en la pizarra.
# sirve para enriquecer los esquemas visuales permitiendo agregar elementos multimedia a la lluvia de ideas.
# lo hace verificando el tipo y peso del archivo (máximo 10mb fotos, 5mb audios, 25mb videos) y guardándolo en disco.
# se hizo así para no recargar la base de datos almacenando archivos pesados dentro de ella.
@notas.route("/proyectos/<int:id_proyecto>/pizarra/medios", methods=["POST"])
@login_required
def subir_medio_pizarra(id_proyecto):
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
    # verifica que el video, audio o foto no supere el peso máximo permitido
    if len(contenido) > TAMANOS_MAXIMOS[tipo]:
        limite_mb = TAMANOS_MAXIMOS[tipo] // (1024 * 1024)
        return jsonify({"error": f"El archivo pesa más de {limite_mb} MB."}), 400

    nombre_guardado = f"{modulo_uuid.uuid4().hex}.{extension}"
    os.makedirs(CARPETA_MEDIOS, exist_ok=True)
    with open(os.path.join(CARPETA_MEDIOS, nombre_guardado), "wb") as destino:
        destino.write(contenido)

    url = f"/proyectos/{id_proyecto}/pizarra/medios/{nombre_guardado}"
    return jsonify({"url": url, "nombre": nombre_original, "tipo": tipo})


# función que entrega la foto, el audio grabado o el video para ser mostrado dentro de la pizarra compartida.
# sirve para proyectar y reproducir los medios pegados en la pantalla de cualquier integrante del equipo.
# lo hace buscando el archivo guardado en la carpeta de medios de la computadora y entregándolo al navegador.
# se construyó así garantizando que solo los miembros autorizados del proyecto puedan ver los archivos.
@notas.route("/proyectos/<int:id_proyecto>/pizarra/medios/<nombre_archivo>")
@login_required
def servir_medio_pizarra(id_proyecto, nombre_archivo):
    obtener_proyecto_de_miembro(id_proyecto)
    if "/" in nombre_archivo or "\\" in nombre_archivo or ".." in nombre_archivo:
        abort(404)
    return send_from_directory(CARPETA_MEDIOS, nombre_archivo)


