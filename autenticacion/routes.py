from flask import Blueprint, render_template, redirect, url_for, flash
from flask_login import login_user, logout_user, current_user

from extensiones import db
from autenticacion.models import Usuario
from autenticacion.forms import FormularioRegistro, FormularioInicioSesion

autenticacion = Blueprint("autenticacion", __name__, template_folder="templates")


@autenticacion.route("/registro", methods=["GET", "POST"])
def registro():
    if current_user.is_authenticated:
        return redirect(url_for("inicio"))

    formulario = FormularioRegistro()
    if formulario.validate_on_submit():
        correo = formulario.correo.data.strip().lower()
        existe = Usuario.query.filter_by(correo=correo).first()
        if existe:
            flash("Ese correo ya está registrado.", "warning")
            return render_template("autenticacion/registro.html", formulario=formulario)

        usuario = Usuario(nombre=formulario.nombre.data.strip(), correo=correo)
        usuario.establecer_contrasena(formulario.contrasena.data)
        db.session.add(usuario)
        db.session.commit()

        login_user(usuario)
        flash(f"¡Bienvenido a Vura, {usuario.nombre}!", "success")
        return redirect(url_for("inicio"))

    return render_template("autenticacion/registro.html", formulario=formulario)


@autenticacion.route("/iniciar-sesion", methods=["GET", "POST"])
def iniciar_sesion():
    if current_user.is_authenticated:
        return redirect(url_for("inicio"))

    formulario = FormularioInicioSesion()
    if formulario.validate_on_submit():
        correo = formulario.correo.data.strip().lower()
        usuario = Usuario.query.filter_by(correo=correo).first()
        if usuario and usuario.verificar_contrasena(formulario.contrasena.data):
            login_user(usuario)
            return redirect(url_for("inicio"))
        flash("Correo o contraseña incorrectos.", "danger")

    return render_template("autenticacion/iniciar_sesion.html", formulario=formulario)


@autenticacion.route("/cerrar-sesion")
def cerrar_sesion():
    logout_user()
    flash("Sesión cerrada. ¡Hasta pronto!", "info")
    return redirect(url_for("autenticacion.iniciar_sesion"))
