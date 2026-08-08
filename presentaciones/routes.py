# este archivo administra el editor interactivo de diapositivas, el reordenamiento
# de láminas y la eliminación de diapositivas. su propósito es ofrecer una
# pantalla gráfica donde el grupo arme y ensaye la presentación de su trabajo. lo hace
# cargando las láminas en formato visual, permitiendo moverlas mediante arrastrar y
# soltar y guardando los elementos creados. se desarrolló así para centralizar
# la preparación de la defensa escolar.


# importamos la herramienta para organizar datos en formato comprensible

import json

# importamos las funciones de flask para vistas html, peticiones de datos y alertas
from flask import Blueprint, render_template, request, jsonify, abort
# importamos la protección para verificar la sesión del alumno
from flask_login import login_required, current_user

# importamos la notificación para avisar al grupo cuando se edita la presentación
from chat.routes import notificar_equipo
# importamos la base de datos y la función de hora local
from extensiones import db, hora_local
# importamos los modelos de proyecto, presentación y diapositivas
from proyectos.models import Proyecto
from presentaciones.models import Presentacion, Diapositiva

# agrupamos las rutas del creador de diapositivas bajo la sección presentaciones
presentaciones = Blueprint("presentaciones", __name__, template_folder="templates",
                           static_folder="static", static_url_path="/presentaciones/static")

# límite de tamaño para el contenido visual de cada diapositiva
LIMITE_CONTENIDO = 500_000


# función auxiliar que verifica si el proyecto existe y si el usuario pertenece al equipo.
# sirve para proteger las diapositivas y asegurar que solo los integrantes del grupo puedan verlas o editarlas.
def obtener_proyecto_de_miembro(id_proyecto):
    proyecto = db.get_or_404(Proyecto, id_proyecto)
    if not proyecto.equipo.es_miembro(current_user):
        abort(403)
    return proyecto


# función auxiliar que verifica si la diapositiva existe y si el alumno tiene permiso de verla.
# sirve para validar el acceso individual a cada lámina de la exposición.
def obtener_diapositiva_de_miembro(id_diapositiva):
    diapositiva = db.get_or_404(Diapositiva, id_diapositiva)
    obtener_proyecto_de_miembro(diapositiva.presentacion.id_proyecto)
    return diapositiva


# función que abre la pantalla interactiva del editor de diapositivas para la exposición.
# sirve para proyectar y diseñar las láminas con títulos, figuras y fichas de notas de apoyo para el expositor.
# lo hace buscando la presentación guardada en la base de datos (o creando una primera lámina en blanco si no existe).
# se diseñó de esta manera para permitir que el grupo prepare la defensa oral de su proyecto escolar.
@presentaciones.route("/proyectos/<int:id_proyecto>/presentacion")
@login_required
def editor(id_proyecto):
    proyecto = obtener_proyecto_de_miembro(id_proyecto)

    # si el proyecto no tiene presentación creada aún, creamos una primera diapositiva en blanco
    presentacion = proyecto.presentacion
    if presentacion is None:
        presentacion = Presentacion(id_proyecto=proyecto.id, titulo=proyecto.nombre)
        presentacion.diapositivas.append(Diapositiva(orden=1))
        db.session.add(presentacion)
        db.session.commit()

    # preparamos los datos de cada diapositiva (su contenido visual y los apuntes de exposición del alumno)
    diapositivas = [
        {"id": d.id, "orden": d.orden,
         "contenido": json.loads(d.contenido_json) if d.contenido_json else None,
         "notas": d.notas or ""}
        for d in presentacion.diapositivas
    ]
    # previene vulnerabilidades al cargar las diapositivas en la pantalla
    datos_diapositivas = json.dumps(diapositivas, ensure_ascii=False).replace("<", "\\u003c")

    return render_template("presentaciones/editor.html", proyecto=proyecto,
                           presentacion=presentacion, datos_diapositivas=datos_diapositivas)


# función que guarda los elementos dibujados, textos introducidos y apuntes de una diapositiva.
# sirve para actualizar el contenido de la lámina en la base de datos para que no se borre al salir.
# lo hace recibiendo los datos del lienzo interactivo y notificando al resto del grupo sobre el cambio.
# se creó así para mantener respaldado el avance del diseño visual de la exposición.
@presentaciones.route("/diapositivas/<int:id_diapositiva>/guardar", methods=["POST"])
@login_required
def guardar_diapositiva(id_diapositiva):
    diapositiva = obtener_diapositiva_de_miembro(id_diapositiva)

    datos = request.get_json(silent=True)
    if not datos or "contenido" not in datos:
        abort(400)

    contenido = json.dumps(datos["contenido"], ensure_ascii=False)
    if len(contenido) > LIMITE_CONTENIDO:
        abort(413)

    diapositiva.contenido_json = contenido
    # guarda los apuntes o fichas de apoyo que escribió el estudiante para su exposición
    if "notas" in datos and isinstance(datos["notas"], str):
        diapositiva.notas = datos["notas"][:5000]
    diapositiva.actualizado_por = current_user.id
    db.session.commit()

    # envía un aviso flotante a los compañeros del equipo informando que se está editando la presentación
    proyecto = diapositiva.presentacion.proyecto
    notificar_equipo(
        proyecto.equipo.id,
        f"🖼️ Presentación de {proyecto.nombre}",
        f"{current_user.nombre} está editando la presentación.",
        f"/proyectos/{proyecto.id}/presentacion",
        clave_repeticion=f"presentacion_{proyecto.id}_{current_user.id}",
        minutos_espera=10,
    )
    return jsonify({"guardado": True, "actualizado_en": hora_local(diapositiva.actualizado_en, "%H:%M:%S")})


# función que añade una nueva lámina en blanco al final de la presentación.
# sirve para expandir la exposición agregando más temas o diapositivas según se requiera.
# lo hace calculando el número de posición correspondiente y agregando un nuevo registro a la base de datos.
# se diseñó de esta manera para permitir el crecimiento flexible del trabajo de presentación.
@presentaciones.route("/presentaciones/<int:id_presentacion>/diapositivas/crear", methods=["POST"])
@login_required
def crear_diapositiva(id_presentacion):
    presentacion = db.get_or_404(Presentacion, id_presentacion)
    obtener_proyecto_de_miembro(presentacion.id_proyecto)

    nuevo_orden = len(presentacion.diapositivas) + 1
    diapositiva = Diapositiva(id_presentacion=presentacion.id, orden=nuevo_orden)
    db.session.add(diapositiva)
    db.session.commit()

    proyecto = presentacion.proyecto
    notificar_equipo(
        proyecto.equipo.id,
        f"🖼️ Presentación de {proyecto.nombre}",
        f"{current_user.nombre} agregó una diapositiva.",
        f"/proyectos/{proyecto.id}/presentacion",
    )
    return jsonify({"id": diapositiva.id, "orden": diapositiva.orden})


# función que guarda el nuevo orden numérico de las diapositivas al moverlas de lugar.
# sirve para reordenar la secuencia de exposición cuando los alumnos arrastran una lámina antes o después de otra.
# lo hace actualizando la posición asignada (1, 2, 3...) de cada diapositiva en la base de datos.
# se construyó así para brindar libertad completa de reorganizar el hilo conductor del trabajo.
@presentaciones.route("/presentaciones/<int:id_presentacion>/orden", methods=["POST"])
@login_required
def guardar_orden(id_presentacion):
    presentacion = db.get_or_404(Presentacion, id_presentacion)
    obtener_proyecto_de_miembro(presentacion.id_proyecto)

    datos = request.get_json(silent=True)
    ids_recibidos = (datos or {}).get("orden")
    ids_reales = {d.id for d in presentacion.diapositivas}
    if not isinstance(ids_recibidos, list) or set(ids_recibidos) != ids_reales:
        abort(400)

    for posicion, id_diapositiva in enumerate(ids_recibidos, start=1):
        db.session.get(Diapositiva, id_diapositiva).orden = posicion
    db.session.commit()
    return jsonify({"guardado": True})


# función que borra una diapositiva específica de la presentación.
# sirve para eliminar láminas sobrantes o no deseadas del trabajo escolar.
# lo hace eliminando el registro de la base de datos y reajustando automáticamente el número de orden de las demás.
# se fijó la regla de impedir borrar la última lámina para que la presentación nunca quede en cero.
@presentaciones.route("/diapositivas/<int:id_diapositiva>/eliminar", methods=["POST"])
@login_required
def eliminar_diapositiva(id_diapositiva):
    diapositiva = obtener_diapositiva_de_miembro(id_diapositiva)
    presentacion = diapositiva.presentacion

    # evita borrar la última diapositiva existente para que la presentación nunca quede en cero
    if len(presentacion.diapositivas) <= 1:
        abort(400)

    db.session.delete(diapositiva)
    # reacomoda los números de orden de las diapositivas restantes
    for posicion, restante in enumerate(
            [d for d in presentacion.diapositivas if d.id != diapositiva.id], start=1):
        restante.orden = posicion
    db.session.commit()

    return jsonify({"eliminada": True})


