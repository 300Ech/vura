import os

RUTA_BASE = os.path.dirname(os.path.abspath(__file__))

# En Railway se apunta a un volumen (ej. /datos) para que la base de datos
# y los archivos subidos sobrevivan a cada deploy. Localmente es la carpeta del código.
RUTA_DATOS = os.environ.get("VURA_RUTA_DATOS", RUTA_BASE)


class Config:
    SECRET_KEY = os.environ.get("VURA_SECRET_KEY", "clave-de-desarrollo-cambiar-en-produccion")
    SQLALCHEMY_DATABASE_URI = "sqlite:///" + os.path.join(RUTA_DATOS, "vura.db")
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    # Suficiente para videos cortos de la pizarra (máximo 25 MB).
    MAX_CONTENT_LENGTH = 30 * 1024 * 1024
