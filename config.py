import os

RUTA_BASE = os.path.dirname(os.path.abspath(__file__))


class Config:
    SECRET_KEY = os.environ.get("VURA_SECRET_KEY", "clave-de-desarrollo-cambiar-en-produccion")
    SQLALCHEMY_DATABASE_URI = "sqlite:///" + os.path.join(RUTA_BASE, "vura.db")
    SQLALCHEMY_TRACK_MODIFICATIONS = False
