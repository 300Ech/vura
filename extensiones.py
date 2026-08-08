# este archivo prepara las herramientas principales que necesita vura para
# funcionar. su propósito es dejar listos los componentes de la base de datos,
# el protector de contraseñas, el control de inicio de sesión y la hora local.
# lo hace inicializando estos sistemas y ajustando el reloj a la hora oficial
# del país. se hizo así para compartir las mismas herramientas entre todas las
# pantallas de la aplicación sin crear duplicados.


# usamos la herramienta del sistema operativo para leer variables de entorno como la zona horaria
import os


# importamos las funciones de fecha y hora para calcular las horas de publicación
from datetime import timezone, timedelta

# importamos el almacenamiento de la base de datos
from flask_sqlalchemy import SQLAlchemy
# importamos el administrador de sesiones para controlar qué usuario está conectado
from flask_login import LoginManager
# importamos el protector para ocultar y asegurar las contraseñas
from flask_bcrypt import Bcrypt
# importamos la herramienta de comunicación instantánea para el chat y avisos en vivo
from flask_socketio import SocketIO

# preparamos el espacio donde se guardará toda la información de tareas, mensajes y notas
db = SQLAlchemy()
# creamos el encargado de verificar qué estudiante inició sesión
administrador_sesion = LoginManager()
# creamos el sistema que convierte las contraseñas en códigos secretos indecodificables
bcrypt = Bcrypt()
# creamos el motor que transmite los mensajes del chat en tiempo real
socketio = SocketIO()

# configuramos el reloj para que use la hora oficial de nuestro país (guatemala / centroamérica UTC-6)
try:
    from zoneinfo import ZoneInfo
    ZONA_HORARIA = ZoneInfo(os.environ.get("VURA_ZONA_HORARIA", "America/Guatemala"))
except Exception:
    ZONA_HORARIA = timezone(timedelta(hours=-6))


def hora_local(momento, formato="%d/%m %H:%M"):
    """convierte cualquier fecha guardada a la hora de nuestro reloj local."""
    # si no hay fecha registrada, regresamos un texto vacío
    if momento is None:
        return ""
    # si la fecha no tiene zona horaria asignada, le indicamos que es hora universal
    if momento.tzinfo is None:
        momento = momento.replace(tzinfo=timezone.utc)
    # cambiamos la fecha a nuestro horario local y le damos un formato legible (ej. 15/08 14:30)
    return momento.astimezone(ZONA_HORARIA).strftime(formato)

