import os

RUTA_BASE = os.path.dirname(os.path.abspath(__file__))

# En Railway se apunta a un volumen (ej. /datos) para que la base de datos
# y los archivos subidos sobrevivan a cada deploy. Localmente es la carpeta del código.
RUTA_DATOS = os.environ.get("VURA_RUTA_DATOS", RUTA_BASE)


class Config:
    SECRET_KEY = os.environ.get("VURA_SECRET_KEY", "clave-de-desarrollo-cambiar-en-produccion")
    SQLALCHEMY_DATABASE_URI = "sqlite:///" + os.path.join(RUTA_DATOS, "vura.db")
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    URL_PUBLICA = os.environ.get("VURA_URL_PUBLICA")
    # Brevo por API HTTP (funciona en Railway, donde el SMTP saliente está bloqueado).
    BREVO_API_KEY = os.environ.get("VURA_BREVO_API_KEY")
    BREVO_REMITENTE = os.environ.get("VURA_BREVO_REMITENTE")  # correo verificado en Brevo
    BREVO_REMITENTE_NOMBRE = os.environ.get("VURA_BREVO_REMITENTE_NOMBRE", "Vura")
    SMTP_HOST = os.environ.get("VURA_SMTP_HOST")
    SMTP_PORT = int(os.environ.get("VURA_SMTP_PORT", "587"))
    SMTP_USUARIO = os.environ.get("VURA_SMTP_USUARIO")
    SMTP_CONTRASENA = os.environ.get("VURA_SMTP_CONTRASENA")
    SMTP_REMITENTE = os.environ.get("VURA_SMTP_REMITENTE") or SMTP_USUARIO
    SMTP_TLS = os.environ.get("VURA_SMTP_TLS", "true").lower() == "true"
    SMTP_SSL = os.environ.get("VURA_SMTP_SSL", "false").lower() == "true"
    # Suficiente para videos cortos de la pizarra (máximo 25 MB).
    MAX_CONTENT_LENGTH = 30 * 1024 * 1024
