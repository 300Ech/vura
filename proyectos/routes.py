from flask import Blueprint, render_template, redirect, url_for, flash, abort
from flask_login import login_required, current_user

from extensiones import db
from equipos.models import Equipo
from proyectos.models import Proyecto
from proyectos.forms import FormularioProyecto

proyectos = Blueprint("proyectos", __name__, template_folder="templates")


def obtener_equipo_de_miembro(id_equipo):
    equipo = db.get_or_404(Equipo, id_equipo)
    if not equipo.es_miembro(current_user):
        abort(403)
    return equipo


@proyectos.route("/equipos/<int:id_equipo>/proyectos/crear", methods=["GET", "POST"])
@login_required
def crear_proyecto(id_equipo):
    equipo = obtener_equipo_de_miembro(id_equipo)
    formulario = FormularioProyecto()
    if formulario.validate_on_submit():
        proyecto = Proyecto(
            id_equipo=equipo.id,
            nombre=formulario.nombre.data.strip(),
            descripcion=(formulario.descripcion.data or "").strip() or None,
            fecha_entrega=formulario.fecha_entrega.data,
        )
        db.session.add(proyecto)
        db.session.commit()
        flash(f"Proyecto «{proyecto.nombre}» creado.", "success")
        return redirect(url_for("proyectos.ver_proyecto", id_proyecto=proyecto.id))

    return render_template("proyectos/crear_proyecto.html", formulario=formulario, equipo=equipo)


@proyectos.route("/proyectos/<int:id_proyecto>")
@login_required
def ver_proyecto(id_proyecto):
    proyecto = db.get_or_404(Proyecto, id_proyecto)
    if not proyecto.equipo.es_miembro(current_user):
        abort(403)
    return render_template("proyectos/proyecto.html", proyecto=proyecto)
