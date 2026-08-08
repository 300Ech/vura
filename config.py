# este archivo guarda las reglas de funcionamiento, límites de peso y claves
# de seguridad del proyecto vura. su propósito es centralizar los ajustes
# importantes (como la carpeta de datos, el límite de 30mb para archivos o
# la dirección web) para no escribirlos repetidamente en otros archivos. lo
# hace reuniendo todas las variables en un bloque de configuración organizado.
# se creó así para que si en el futuro se necesita cambiar una clave o regla del
# proyecto, solo se modifique este archivo sin tocar el resto del código.


# usamos la herramienta para consultar rutas de archivos y variables guardadas en la computadora
import os



# obtiene la carpeta exacta en la computadora donde están guardados los archivos del programa
RUTA_BASE = os.path.dirname(os.path.abspath(__file__))

# indica la ubicación donde se van a guardar los archivos y la base de datos para que no se borren al apagar la compu
RUTA_DATOS = os.environ.get("VURA_RUTA_DATOS", RUTA_BASE)


def url_publica():
    """obtiene la dirección de internet oficial para que los compañeros puedan entrar al sitio."""
    # lista de posibles direcciones de internet configuradas para el sitio web
    candidatos = [
        os.environ.get("VURA_URL_PUBLICA"),
        os.environ.get("RAILWAY_PUBLIC_DOMAIN"),
    ]
    # revisamos cada dirección posible para asegurarnos de que sea una dirección web válida y pública
    for candidato in candidatos:
        direccion = (candidato or "").strip().rstrip("/")
        # ignoramos direcciones internas que no funcionan fuera de la red local
        if not direccion or ".railway.internal" in direccion:
            continue
        # si a la dirección le falta el encabezado http:// o https://, se lo agregamos automáticamente
        if not direccion.startswith(("http://", "https://")):
            direccion = "https://" + direccion
        return direccion
    return None


# conjunto organizado de reglas y claves de configuración del proyecto vura
class Config:
    # clave secreta que protege las sesiones de los estudiantes para que nadie las falsifique
    SECRET_KEY = os.environ.get("VURA_SECRET_KEY", "clave-de-desarrollo-cambiar-en-produccion")
    # indica dónde se creará y guardará la base de datos sqlite con todas las tareas y proyectos (vura.db)
    SQLALCHEMY_DATABASE_URI = "sqlite:///" + os.path.join(RUTA_DATOS, "vura.db")
    # desactiva un rastreador innecesario para que el programa consuma menos memoria y funcione más rápido
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    # guarda la dirección web pública donde se transmite la aplicación
    URL_PUBLICA = url_publica()
    # llave del servicio para enviar correos electrónicos si un usuario olvida su cuenta
    BREVO_API_KEY = os.environ.get("VURA_BREVO_API_KEY")
    # correo remitente desde el cual llegarán las notificaciones a los estudiantes
    BREVO_REMITENTE = os.environ.get("VURA_BREVO_REMITENTE")
    # nombre con el que aparecerán firmados los correos (vura)
    BREVO_REMITENTE_NOMBRE = os.environ.get("VURA_BREVO_REMITENTE_NOMBRE", "Vura")
    # servidor, puerto y credenciales para el envío de correo por smtp (método alternativo a brevo)
    SMTP_HOST = os.environ.get("VURA_SMTP_HOST")
    SMTP_PORT = int(os.environ.get("VURA_SMTP_PORT", 587))
    SMTP_USUARIO = os.environ.get("VURA_SMTP_USUARIO")
    SMTP_CONTRASENA = os.environ.get("VURA_SMTP_CONTRASENA")
    # correo del remitente asignado para los mensajes enviados
    SMTP_REMITENTE = os.environ.get("VURA_SMTP_REMITENTE") or SMTP_USUARIO
    # activa la conexión segura estándar para el envío de correos
    SMTP_TLS = os.environ.get("VURA_SMTP_TLS", "true").lower() == "true"
    # opción para activar la conexión encriptada ssl en correos
    SMTP_SSL = os.environ.get("VURA_SMTP_SSL", "false").lower() == "true"
    # peso máximo de archivos o audios que los estudiantes pueden subir a la app (máximo 30 megabytes)
    MAX_CONTENT_LENGTH = 30 * 1024 * 1024
    # interruptor global para mostrar el botón de compartir pantalla en las videollamadas (activado por defecto)
    COMPARTIR_PANTALLA_HABILITADO = os.environ.get("VURA_COMPARTIR_PANTALLA_HABILITADO", "true").lower() == "true"
    # interruptor global para mostrar el botón de difuminar el fondo en las videollamadas (activado por defecto)
    DESENFOQUE_FONDO_HABILITADO = os.environ.get("VURA_DESENFOQUE_FONDO_HABILITADO", "true").lower() == "true"

