import os
from datetime import timezone, timedelta

from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager
from flask_bcrypt import Bcrypt
from flask_socketio import SocketIO

db = SQLAlchemy()
administrador_sesion = LoginManager()
bcrypt = Bcrypt()
socketio = SocketIO()

# Las fechas se guardan en UTC (la hora universal) y se convierten a la hora
# local solo al mostrarlas. La zona se puede cambiar con la variable VURA_ZONA_HORARIA.
try:
    from zoneinfo import ZoneInfo
    ZONA_HORARIA = ZoneInfo(os.environ.get("VURA_ZONA_HORARIA", "America/Guatemala"))
except Exception:
    ZONA_HORARIA = timezone(timedelta(hours=-6))


def hora_local(momento, formato="%d/%m %H:%M"):
    """Convierte una fecha guardada en UTC a la hora local y la formatea."""
    if momento is None:
        return ""
    if momento.tzinfo is None:
        momento = momento.replace(tzinfo=timezone.utc)
    return momento.astimezone(ZONA_HORARIA).strftime(formato)
