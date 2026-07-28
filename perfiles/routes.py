from flask import Blueprint, render_template, redirect, url_for, flash
from flask_login import login_required, current_user

from extensiones import db
from autenticacion.models import Usuario
from perfiles.forms import FormularioPerfil

perfiles = Blueprint("perfiles", __name__, template_folder="templates")


@perfiles.route("/perfil/<int:id_usuario>")
@login_required
def ver_perfil(id_usuario):
    usuario = db.get_or_404(Usuario, id_usuario)
    return render_template("perfiles/perfil.html", usuario=usuario)


@perfiles.route("/perfil/editar", methods=["GET", "POST"])
@login_required
def editar_perfil():
    formulario = FormularioPerfil(obj=current_user)
    if formulario.validate_on_submit():
        current_user.nombre = formulario.nombre.data.strip()
        current_user.grado = (formulario.grado.data or "").strip() or None
        current_user.descripcion = (formulario.descripcion.data or "").strip() or None
        current_user.avatar = (formulario.avatar.data or "").strip() or None
        db.session.commit()
        flash("Perfil actualizado.", "success")
        return redirect(url_for("perfiles.ver_perfil", id_usuario=current_user.id))

    return render_template("perfiles/editar_perfil.html", formulario=formulario)
