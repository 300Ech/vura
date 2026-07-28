from flask import Blueprint, render_template, redirect, url_for, flash, abort
from flask_login import login_required, current_user

from extensiones import db
from equipos.models import Equipo, MiembroEquipo
from equipos.forms import FormularioCrearEquipo, FormularioUnirseEquipo

equipos = Blueprint("equipos", __name__, template_folder="templates")


@equipos.route("/equipos")
@login_required
def mis_equipos():
    membresias = MiembroEquipo.query.filter_by(id_usuario=current_user.id).all()
    formulario_unirse = FormularioUnirseEquipo()
    return render_template("equipos/mis_equipos.html", membresias=membresias, formulario_unirse=formulario_unirse)


@equipos.route("/equipos/crear", methods=["GET", "POST"])
@login_required
def crear_equipo():
    formulario = FormularioCrearEquipo()
    if formulario.validate_on_submit():
        equipo = Equipo(nombre=formulario.nombre.data.strip(), id_lider=current_user.id)
        equipo.miembros.append(MiembroEquipo(id_usuario=current_user.id))
        db.session.add(equipo)
        db.session.commit()
        flash(f"Equipo «{equipo.nombre}» creado. Comparte el código {equipo.codigo_invitacion} con tus compañeros.", "success")
        return redirect(url_for("equipos.ver_equipo", id_equipo=equipo.id))

    return render_template("equipos/crear_equipo.html", formulario=formulario)


@equipos.route("/equipos/unirse", methods=["POST"])
@login_required
def unirse_equipo():
    formulario = FormularioUnirseEquipo()
    if formulario.validate_on_submit():
        codigo = formulario.codigo_invitacion.data.strip().upper()
        equipo = Equipo.query.filter_by(codigo_invitacion=codigo).first()
        if not equipo:
            flash("No existe un equipo con ese código.", "warning")
            return redirect(url_for("equipos.mis_equipos"))
        if equipo.es_miembro(current_user):
            flash("Ya eres parte de ese equipo.", "info")
            return redirect(url_for("equipos.ver_equipo", id_equipo=equipo.id))

        db.session.add(MiembroEquipo(id_equipo=equipo.id, id_usuario=current_user.id))
        db.session.commit()
        flash(f"Te uniste al equipo «{equipo.nombre}».", "success")
        return redirect(url_for("equipos.ver_equipo", id_equipo=equipo.id))

    flash("Escribe un código de invitación válido.", "warning")
    return redirect(url_for("equipos.mis_equipos"))


@equipos.route("/equipos/<int:id_equipo>")
@login_required
def ver_equipo(id_equipo):
    equipo = db.get_or_404(Equipo, id_equipo)
    if not equipo.es_miembro(current_user):
        abort(403)
    return render_template("equipos/equipo.html", equipo=equipo)
