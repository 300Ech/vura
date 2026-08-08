# este es el archivo principal que enciende y pone a correr la página web vura.
# su propósito es conectar todas las partes del sistema (chat, tareas,
# pizarra y cuentas) en una sola aplicación accesible desde el navegador.
# lo hace cargando las configuraciones, conectando la base de datos,
# registrando cada sección del sitio y activando la transmisión en tiempo real.
# elegimos la herramienta flask porque es liviana y nos permite estructurar todas
# las secciones de la plataforma de forma limpia, y usamos la librería socketio
# para que la pizarra y el chat transmitan los cambios inmediatamente a todos
# los navegadores conectados. se construyó de esta manera para tener un único
# punto de arranque organizado desde donde se encienda todo el programa.



# usamos la herramienta para leer carpetas de la computadora y saber en qué puerto de red vamos a transmitir
import os



# traemos la herramienta principal para crear la página web y la función para mostrar las pantallas visuales al alumno
from flask import Flask, render_template
# traemos las funciones para saber qué usuario inició sesión y evitar que desconocidos entren a páginas privadas
from flask_login import login_required, current_user

# traemos la lista de reglas y ajustes guardados en el archivo de configuración
from config import Config
# traemos la base de datos, la seguridad de claves, el control de sesiones y el chat en vivo
from extensiones import db, administrador_sesion, bcrypt, socketio, hora_local

# creamos el programa principal sobre el que va a funcionar toda nuestra página web
app = Flask(__name__)
# le cargamos las reglas del proyecto: dónde guardar la base de datos, el peso máximo de los archivos a subir (30mb) y las claves de seguridad
app.config.from_object(Config)
# ajustamos los relojes del sitio para que las publicaciones salgan con la hora exacta de nuestro país
app.jinja_env.filters["hora_local"] = hora_local

# conectamos la base de datos para que la aplicación pueda guardar las tareas, mensajes y notas creadas por los alumnos
db.init_app(app)
# activamos la protección para que las contraseñas no se guarden en texto normal sino escondidas como un código secreto
bcrypt.init_app(app)
# activamos el sistema que recuerda quién inició sesión para que no pida la clave a cada rato mientras navega
administrador_sesion.init_app(app)
# si un alumno intenta entrar a un proyecto sin iniciar sesión, el programa lo envía directo a la pantalla de entrada
administrador_sesion.login_view = "autenticacion.iniciar_sesion"
# mensaje de aviso que le sale en pantalla al alumno cuando intenta entrar sin haber iniciado sesión
administrador_sesion.login_message = "Inicia sesión para ver esta página."
# le asignamos el color azul informativo al mensaje de aviso
administrador_sesion.login_message_category = "info"

# traemos cada una de las secciones del sitio: cuentas, perfiles, grupos, tareas, chat, notas, presentaciones y descargas
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

# activamos e integramos cada una de las secciones dentro de la aplicación web principal
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

# activamos el sistema de mensajes instantáneos en tiempo real para el chat y videollamada
socketio.init_app(app)


# crea automáticamente las tablas de información si es la primera vez que se enciende la aplicación
with app.app_context():
    db.create_all()

# una opción especial para reiniciar los datos de prueba si es necesario durante la presentación
@app.route("/reset_db_demo")
def reset_db_demo():
    """Ruta temporal para borrar la BD persistente en Railway."""
    db.drop_all()
    db.create_all()
    return "Base de datos borrada exitosamente. Ya puedes iniciar tu demo."


# esta es la dirección principal del sitio web (la portada)
@app.route("/")
@login_required
def inicio():
    """El inicio de Vura es la pizarra del proyecto en el que se trabajó por última vez."""
    from flask import redirect, url_for
    from equipos.models import MiembroEquipo
    from proyectos.models import Proyecto

    # buscamos la lista de equipos en los que está inscrito el alumno conectado
    ids_equipos = [m.id_equipo for m in MiembroEquipo.query.filter_by(id_usuario=current_user.id)]
    # buscamos los proyectos creados por esos equipos, ordenados del más reciente al más antiguo
    proyectos = (Proyecto.query.filter(Proyecto.id_equipo.in_(ids_equipos))
                 .order_by(Proyecto.creado_en.desc()).all())
    # si el alumno aún no tiene proyectos creados, le mostramos la pantalla de bienvenida vacía
    if not proyectos:
        return render_template("inicio.html")

    # elegimos el trabajo en el que se escribió o dibujó más recientemente para que no pierda tiempo buscándolo
    con_nota = [p for p in proyectos if p.nota]
    elegido = max(con_nota, key=lambda p: p.nota.actualizado_en) if con_nota else proyectos[0]
    # enviamos al estudiante directo a la pizarra de su trabajo más reciente
    return redirect(url_for("notas.ver_notas", id_proyecto=elegido.id))


# archivo especial que permite que la página cargue rápido y guarde datos sin conexión a internet
@app.route("/sw.js")
def service_worker():
    # el service worker se sirve desde la raíz para poder controlar toda la aplicación
    return app.send_static_file("sw.js")


# archivo que permite instalar vura como si fuera una aplicación normal en el celular o tablet
@app.route("/manifest.webmanifest")
def manifesto():
    # indica el formato correcto para que los navegadores reconozcan vura como una app instalable
    return app.send_static_file("manifest.webmanifest"), 200, {
        "Content-Type": "application/manifest+json",
    }


# punto de inicio para encender el programa
if __name__ == "__main__":
    # elegimos el puerto de red (puerto 5000 en la computadora local o el puerto asignado en internet)
    puerto = int(os.environ.get("PORT", 5000))
    # revisamos si la aplicación está corriendo en internet o en nuestra propia computadora
    en_produccion = "PORT" in os.environ
    # encendemos la aplicación vura con el chat en vivo activo
    socketio.run(app, host="0.0.0.0", port=puerto, debug=not en_produccion, allow_unsafe_werkzeug=True)

