# este archivo gestiona la creación y visualización de proyectos dentro de cada
# grupo. su propósito es permitir que los integrantes inicien un trabajo escolar
# y entren a su espacio correspondiente. lo hace procesando el formulario,
# guardando la información en la base de datos y dirigiendo al usuario a la
# vista del proyecto. se creó de este modo para enlazar los equipos con sus
# tableros de actividades específicos.


# importamos funciones para las pantallas, mensajes y manejo de errores de acceso
from flask import Blueprint, render_template, redirect, url_for, flash, abort


# importamos la protección para usuarios autenticados
from flask_login import login_required, current_user

# importamos la base de datos y utilidades de fecha
from extensiones import db
# importamos las plantillas de equipos y proyectos
from equipos.models import Equipo

from proyectos.models import Proyecto
# importamos el formulario para crear proyectos
from proyectos.forms import FormularioProyecto

# agrupamos las rutas de proyectos bajo la sección proyectos
proyectos = Blueprint("proyectos", __name__, template_folder="templates")


def obtener_equipo_de_miembro(id_equipo):
    """comprueba si el equipo existe y si el alumno conectado es parte de ese equipo."""
    equipo = db.get_or_404(Equipo, id_equipo)
    if not equipo.es_miembro(current_user):
        abort(403)
    return equipo


# pantalla para crear un nuevo trabajo o proyecto dentro de un equipo
@proyectos.route("/equipos/<int:id_equipo>/proyectos/crear", methods=["GET", "POST"])
@login_required
def crear_proyecto(id_equipo):
    equipo = obtener_equipo_de_miembro(id_equipo)
    formulario = FormularioProyecto()
    # al presionar guardar proyecto
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


# pantalla para ver los detalles del proyecto (pizarra de notas, tareas y chat)
@proyectos.route("/proyectos/<int:id_proyecto>")
@login_required
def ver_proyecto(id_proyecto):
    proyecto = db.get_or_404(Proyecto, id_proyecto)
    # verifica que el alumno sea integrante del equipo dueño del proyecto
    if not proyecto.equipo.es_miembro(current_user):
        abort(403)
    return render_template("proyectos/proyecto.html", proyecto=proyecto)

