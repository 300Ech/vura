from flask import Flask, render_template
from flask_login import login_required

from config import Config
from extensiones import db, migrate, administrador_sesion, bcrypt

app = Flask(__name__)
app.config.from_object(Config)

db.init_app(app)
migrate.init_app(app, db)
bcrypt.init_app(app)
administrador_sesion.init_app(app)
administrador_sesion.login_view = "autenticacion.iniciar_sesion"
administrador_sesion.login_message = "Inicia sesión para ver esta página."
administrador_sesion.login_message_category = "info"

from autenticacion.routes import autenticacion
from perfiles.routes import perfiles

app.register_blueprint(autenticacion)
app.register_blueprint(perfiles)


@app.route("/")
@login_required
def inicio():
    return render_template("inicio.html")


if __name__ == "__main__":
    app.run(debug=True)
