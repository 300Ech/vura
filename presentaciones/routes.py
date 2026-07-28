import json

from flask import Blueprint, render_template, request, jsonify, abort
from flask_login import login_required, current_user

from chat.routes import notificar_equipo
from extensiones import db
from proyectos.models import Proyecto
from presentaciones.models import Presentacion, Diapositiva

presentaciones = Blueprint("presentaciones", __name__, template_folder="templates",
                           static_folder="static", static_url_path="/presentaciones/static")

LIMITE_CONTENIDO = 500_000  # caracteres de JSON por diapositiva


def obtener_proyecto_de_miembro(id_proyecto):
    proyecto = db.get_or_404(Proyecto, id_proyecto)
    if not proyecto.equipo.es_miembro(current_user):
        abort(403)
    return proyecto


def obtener_diapositiva_de_miembro(id_diapositiva):
    diapositiva = db.get_or_404(Diapositiva, id_diapositiva)
    obtener_proyecto_de_miembro(diapositiva.presentacion.id_proyecto)
    return diapositiva


@presentaciones.route("/proyectos/<int:id_proyecto>/presentacion")
@login_required
def editor(id_proyecto):
    proyecto = obtener_proyecto_de_miembro(id_proyecto)

    presentacion = proyecto.presentacion
    if presentacion is None:
        presentacion = Presentacion(id_proyecto=proyecto.id, titulo=proyecto.nombre)
        presentacion.diapositivas.append(Diapositiva(orden=1))
        db.session.add(presentacion)
        db.session.commit()

    diapositivas = [
        {"id": d.id, "orden": d.orden, "contenido": json.loads(d.contenido_json) if d.contenido_json else None}
        for d in presentacion.diapositivas
    ]
    # Se escapa '<' para que un texto con '</script>' no pueda romper la etiqueta donde va incrustado el JSON.
    datos_diapositivas = json.dumps(diapositivas, ensure_ascii=False).replace("<", "\\u003c")

    return render_template("presentaciones/editor.html", proyecto=proyecto,
                           presentacion=presentacion, datos_diapositivas=datos_diapositivas)


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
    diapositiva.actualizado_por = current_user.id
    db.session.commit()

    # Aviso al equipo, como mucho una vez cada 10 minutos por persona
    # (las diapositivas se guardan solas cada pocos segundos mientras se edita).
    proyecto = diapositiva.presentacion.proyecto
    notificar_equipo(
        proyecto.equipo.id,
        f"🖼️ Presentación de {proyecto.nombre}",
        f"{current_user.nombre} está editando la presentación.",
        f"/proyectos/{proyecto.id}/presentacion",
        clave_repeticion=f"presentacion_{proyecto.id}_{current_user.id}",
        minutos_espera=10,
    )
    return jsonify({"guardado": True, "actualizado_en": diapositiva.actualizado_en.strftime("%H:%M:%S")})


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


@presentaciones.route("/diapositivas/<int:id_diapositiva>/eliminar", methods=["POST"])
@login_required
def eliminar_diapositiva(id_diapositiva):
    diapositiva = obtener_diapositiva_de_miembro(id_diapositiva)
    presentacion = diapositiva.presentacion

    if len(presentacion.diapositivas) <= 1:
        abort(400)  # una presentación siempre conserva al menos una diapositiva

    db.session.delete(diapositiva)
    for posicion, restante in enumerate(
            [d for d in presentacion.diapositivas if d.id != diapositiva.id], start=1):
        restante.orden = posicion
    db.session.commit()

    return jsonify({"eliminada": True})
