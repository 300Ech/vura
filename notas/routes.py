import json

from flask import Blueprint, render_template, request, jsonify, abort
from flask_login import login_required, current_user

from extensiones import db
from proyectos.models import Proyecto
from notas.models import Nota

notas = Blueprint("notas", __name__, template_folder="templates",
                  static_folder="static", static_url_path="/notas/static")

LIMITE_CONTENIDO = 200_000  # caracteres de JSON; suficiente para notas escolares


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
    return render_template("notas/notas.html", proyecto=proyecto, nota=nota, contenido=contenido)


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
        "actualizado_en": nota.actualizado_en.strftime("%H:%M:%S"),
    })
