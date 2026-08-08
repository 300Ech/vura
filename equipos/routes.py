# este archivo administra las pantallas para listar grupos, crear equipos,
# unirse mediante un código, salir del grupo o expulsar a un integrante. su
# propósito es permitir la gestión completa de los equipos escolares de trabajo.
# lo hace procesando las solicitudes de los usuarios, guardando la lista de
# miembros, reasignando al líder si se sale y eliminando grupos vacíos. se
# creó así para solucionar los problemas de desorganización en trabajos grupales.


# importamos las funciones para mostrar pantallas, redirigir y enviar alertas
from flask import Blueprint, render_template, redirect, url_for, flash, abort



# importamos las utilidades de autenticación para saber qué alumno está conectado
from flask_login import login_required, current_user

# importamos la base de datos y la función de hora local
from extensiones import db, hora_local
# importamos las plantillas de equipos y miembros de equipo
from equipos.models import Equipo, MiembroEquipo

# importamos los formularios para crear o unirse a un equipo
from equipos.forms import FormularioCrearEquipo, FormularioUnirseEquipo

# agrupamos las pantallas de gestión de grupos bajo la sección equipos
equipos = Blueprint("equipos", __name__, template_folder="templates")


# pantalla donde el alumno ve la lista de todos los equipos de trabajo a los que pertenece
@equipos.route("/equipos")
@login_required
def mis_equipos():
    # buscamos los grupos en los que está inscrito el estudiante conectado
    membresias = MiembroEquipo.query.filter_by(id_usuario=current_user.id).all()
    # preparamos el formulario por si quiere unirse a otro grupo escribiendo un código
    formulario_unirse = FormularioUnirseEquipo()
    return render_template("equipos/mis_equipos.html", membresias=membresias, formulario_unirse=formulario_unirse)


# pantalla donde un estudiante crea un nuevo equipo de trabajo
@equipos.route("/equipos/crear", methods=["GET", "POST"])
@login_required
def crear_equipo():
    formulario = FormularioCrearEquipo()
    # si escribió el nombre del equipo y presionó crear
    if formulario.validate_on_submit():
        # creamos el equipo asignando al alumno conectado como el líder inicial
        equipo = Equipo(nombre=formulario.nombre.data.strip(), id_lider=current_user.id)
        # agregamos automáticamente al alumno como el primer integrante del equipo
        equipo.miembros.append(MiembroEquipo(id_usuario=current_user.id))
        db.session.add(equipo)
        db.session.commit()
        # mostramos aviso con el código generado para que lo comparta con sus compañeros
        flash(f"Equipo «{equipo.nombre}» creado. Comparte el código {equipo.codigo_invitacion} con tus compañeros.", "success")
        return redirect(url_for("equipos.ver_equipo", id_equipo=equipo.id))

    return render_template("equipos/crear_equipo.html", formulario=formulario)


# acción para unirse a un equipo ya existente ingresando su código secreto
@equipos.route("/equipos/unirse", methods=["POST"])
@login_required
def unirse_equipo():
    formulario = FormularioUnirseEquipo()
    if formulario.validate_on_submit():
        codigo = formulario.codigo_invitacion.data.strip().upper()
        # buscamos si existe algún equipo registrado con ese código exacto
        equipo = Equipo.query.filter_by(codigo_invitacion=codigo).first()
        if not equipo:
            flash("No existe un equipo con ese código.", "warning")
            return redirect(url_for("equipos.mis_equipos"))
        # si el alumno ya estaba en ese equipo, le avisamos que ya es miembro
        if equipo.es_miembro(current_user):
            flash("Ya eres parte de ese equipo.", "info")
            return redirect(url_for("equipos.ver_equipo", id_equipo=equipo.id))

        # agregamos al alumno a la lista de integrantes de ese equipo
        db.session.add(MiembroEquipo(id_equipo=equipo.id, id_usuario=current_user.id))
        db.session.commit()
        flash(f"Te uniste al equipo «{equipo.nombre}».", "success")
        return redirect(url_for("equipos.ver_equipo", id_equipo=equipo.id))

    flash("Escribe un código de invitación válido.", "warning")
    return redirect(url_for("equipos.mis_equipos"))


# pantalla para ver los detalles del grupo (compañeros, proyectos y tareas asignadas)
@equipos.route("/equipos/<int:id_equipo>")
@login_required
def ver_equipo(id_equipo):
    equipo = db.get_or_404(Equipo, id_equipo)
    # verificamos que el alumno conectado sea integrante del equipo para dejarlo pasar
    if not equipo.es_miembro(current_user):
        abort(403)
    return render_template("equipos/equipo.html", equipo=equipo)


def borrar_equipo_completo(equipo):
    """borra el equipo junto con todos sus proyectos, tareas y archivos guardados si queda vacío."""
    from tareas.routes import borrar_comentarios_y_archivos

    # limpia los archivos y tareas de cada proyecto del equipo antes de borrarlo
    for proyecto in equipo.proyectos:
        for tarea in proyecto.tareas:
            borrar_comentarios_y_archivos(tarea.uuid)
    db.session.delete(equipo)


# acción para salir de un equipo de trabajo
@equipos.route("/equipos/<int:id_equipo>/salir", methods=["POST"])
@login_required
def salir_equipo(id_equipo):
    equipo = db.get_or_404(Equipo, id_equipo)
    membresia = MiembroEquipo.query.filter_by(id_equipo=equipo.id, id_usuario=current_user.id).first()
    if not membresia:
        abort(403)

    # eliminamos la inscripción del alumno en el equipo
    db.session.delete(membresia)

    # revisamos si quedan otros compañeros en el equipo
    restantes = [m for m in equipo.miembros if m.id != membresia.id]
    if not restantes:
        # si era el último integrante, borramos el equipo completo para no dejar grupos abandonados
        borrar_equipo_completo(equipo)
        db.session.commit()
        flash(f"Saliste del equipo «{equipo.nombre}» y, como eras el último, el equipo se eliminó.", "info")
        return redirect(url_for("equipos.mis_equipos"))

    # si el que salió era el líder, le transferimos el liderazgo al compañero más antiguo
    if equipo.id_lider == current_user.id:
        nuevo_lider = min(restantes, key=lambda m: m.id)
        equipo.id_lider = nuevo_lider.id_usuario
        flash(f"Saliste del equipo. Ahora {nuevo_lider.usuario.nombre} es líder de «{equipo.nombre}».", "info")
    else:
        flash(f"Saliste del equipo «{equipo.nombre}».", "info")

    db.session.commit()
    return redirect(url_for("equipos.mis_equipos"))


# acción permitida únicamente al líder para retirar a un integrante del grupo
@equipos.route("/equipos/<int:id_equipo>/expulsar/<int:id_usuario>", methods=["POST"])
@login_required
def expulsar_miembro(id_equipo, id_usuario):
    equipo = db.get_or_404(Equipo, id_equipo)
    # sólo el líder del equipo tiene permiso para expulsar a un compañero
    if equipo.id_lider != current_user.id or id_usuario == current_user.id:
        abort(403)

    membresia = MiembroEquipo.query.filter_by(id_equipo=equipo.id, id_usuario=id_usuario).first()
    if not membresia:
        abort(404)

    nombre = membresia.usuario.nombre
    db.session.delete(membresia)
    db.session.commit()
    flash(f"{nombre} ya no es parte del equipo.", "info")
    return redirect(url_for("equipos.ver_equipo", id_equipo=equipo.id))

