from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager
from flask_bcrypt import Bcrypt
from flask_socketio import SocketIO

db = SQLAlchemy()
administrador_sesion = LoginManager()
bcrypt = Bcrypt()
socketio = SocketIO()
