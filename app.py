import os

from flask import Flask, render_template
from flask_login import login_required, current_user

from config import Config
from extensiones import db, administrador_sesion, bcrypt, socketio

app = Flask(__name__)
app.config.from_object(Config)

db.init_app(app)
bcrypt.init_app(app)
administrador_sesion.init_app(app)
administrador_sesion.login_view = "autenticacion.iniciar_sesion"
administrador_sesion.login_message = "Inicia sesión para ver esta página."
administrador_sesion.login_message_category = "info"

from autenticacion.routes import autenticacion
from perfiles.routes import perfiles
from equipos.routes import equipos
from proyectos.routes import proyectos
from tareas.routes import tareas
from chat.routes import chat
from notas.routes import notas
from presentaciones.routes import presentaciones
from colaboracion.routes import colaboracion
from exportacion.routes import exportacion

app.register_blueprint(autenticacion)
app.register_blueprint(perfiles)
app.register_blueprint(equipos)
app.register_blueprint(proyectos)
app.register_blueprint(tareas)
app.register_blueprint(chat)
app.register_blueprint(notas)
app.register_blueprint(presentaciones)
app.register_blueprint(colaboracion)
app.register_blueprint(exportacion)

socketio.init_app(app)

# Crea automáticamente las tablas que falten la primera vez que arranca la aplicación.
with app.app_context():
    db.create_all()


@app.route("/")
@login_required
def inicio():
    """El inicio de Vura es la pizarra del proyecto en el que se trabajó por última vez."""
    from flask import redirect, url_for
    from equipos.models import MiembroEquipo
    from proyectos.models import Proyecto

    ids_equipos = [m.id_equipo for m in MiembroEquipo.query.filter_by(id_usuario=current_user.id)]
    proyectos = (Proyecto.query.filter(Proyecto.id_equipo.in_(ids_equipos))
                 .order_by(Proyecto.creado_en.desc()).all())
    if not proyectos:
        return render_template("inicio.html")

    # El proyecto cuya pizarra se editó más recientemente; si ninguna tiene nota, el más nuevo.
    con_nota = [p for p in proyectos if p.nota]
    elegido = max(con_nota, key=lambda p: p.nota.actualizado_en) if con_nota else proyectos[0]
    return redirect(url_for("notas.ver_notas", id_proyecto=elegido.id))


@app.route("/sw.js")
def service_worker():
    # El Service Worker debe servirse desde la raíz para poder controlar toda la aplicación.
    return app.send_static_file("sw.js")


if __name__ == "__main__":
    # En Railway el puerto llega en la variable PORT; localmente se usa el 5000 de siempre.
    puerto = int(os.environ.get("PORT", 5000))
    en_produccion = "PORT" in os.environ
    # allow_unsafe_werkzeug: permite usar el servidor de desarrollo de Flask; suficiente para la escuela.
    socketio.run(app, host="0.0.0.0", port=puerto, debug=not en_produccion, allow_unsafe_werkzeug=True)
