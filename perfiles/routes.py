# este archivo gestiona la visualización y edición del perfil del estudiante.
# su propósito es permitir que los alumnos consulten la información de sus
# compañeros de equipo y actualicen sus propios datos cuando lo deseen. lo hace
# buscando al usuario en la base de datos para mostrar su tarjeta o guardando los
# cambios del formulario. se diseñó así para facilitar el reconocimiento.


# importamos las herramientas para cargar pantallas, redirigir y enviar avisos
from flask import Blueprint, render_template, redirect, url_for, flash



# importamos la protección de rutas para verificar que el usuario esté conectado
from flask_login import login_required, current_user

# importamos la base de datos
from extensiones import db
# importamos la plantilla del usuario
from autenticacion.models import Usuario

# importamos el formulario de edición de perfil
from perfiles.forms import FormularioPerfil

# agrupamos las pantallas del perfil bajo la sección perfiles
perfiles = Blueprint("perfiles", __name__, template_folder="templates")


# pantalla para ver la tarjeta de perfil de cualquier compañero según su número de id
@perfiles.route("/perfil/<int:id_usuario>")
@login_required
def ver_perfil(id_usuario):
    # busca al alumno en la base de datos o muestra error si no existe ese número
    usuario = db.get_or_404(Usuario, id_usuario)
    return render_template("perfiles/perfil.html", usuario=usuario)


# pantalla para que el estudiante edite sus propios datos de perfil
@perfiles.route("/perfil/editar", methods=["GET", "POST"])
@login_required
def editar_perfil():
    # carga el formulario llenado previamente con los datos actuales del estudiante
    formulario = FormularioPerfil(obj=current_user)
    # si el estudiante cambió sus datos y presionó el botón de guardar
    if formulario.validate_on_submit():
        current_user.nombre = formulario.nombre.data.strip()
        current_user.grado = (formulario.grado.data or "").strip() or None
        current_user.descripcion = (formulario.descripcion.data or "").strip() or None
        current_user.avatar = (formulario.avatar.data or "").strip() or None
        # guardamos los cambios definitivamente en la base de datos
        db.session.commit()
        # mostramos mensaje verde de éxito y lo devolvemos a ver su tarjeta de perfil
        flash("Perfil actualizado.", "success")
        return redirect(url_for("perfiles.ver_perfil", id_usuario=current_user.id))

    return render_template("perfiles/editar_perfil.html", formulario=formulario)

