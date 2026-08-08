# este archivo administra las pantallas de crear cuenta, iniciar sesión,
# cerrar sesión y recuperar contraseña. su propósito es dar acceso seguro a
# la plataforma verificando la identidad del alumno. lo hace procesando la
# información introducida en los formularios, comprobando las credenciales
# guardadas y enviando enlaces de ayuda por correo si se olvida la clave.
# elegimos la herramienta bcrypt porque transforma la contraseña introducida
# por el alumno en un código secreto indescifrable que nadie puede leer o robar,
# y usamos la herramienta flask-login para recordar de forma segura qué alumno
# tiene su sesión iniciada en la computadora. se construyó así para proteger
# la privacidad y los trabajos del estudiante.


# importamos herramientas para generar claves únicas, manipular textos y enviar correos
import hashlib




import json
import smtplib
import urllib.error
import urllib.request
from email.message import EmailMessage

# importamos las funciones de flask para manejar pantallas visuales, redirecciones y avisos al usuario
from flask import Blueprint, render_template, redirect, url_for, flash, current_app, request
# importamos las funciones para iniciar sesión, cerrar sesión y conocer al usuario activo
from flask_login import login_user, logout_user, current_user
# importamos la herramienta que crea un código temporal seguro para recuperar contraseñas
from itsdangerous import URLSafeTimedSerializer, BadSignature, SignatureExpired

# importamos la conexión a la base de datos
from extensiones import db
# importamos la plantilla de usuario
from autenticacion.models import Usuario

# importamos los cuatro formularios creados para esta sección
from autenticacion.forms import (
    FormularioRegistro,
    FormularioInicioSesion,
    FormularioRecuperacion,
    FormularioRestablecer,
)

# agrupamos todas las pantallas de ingreso y registro bajo la sección de autenticación
autenticacion = Blueprint("autenticacion", __name__, template_folder="templates")

# definimos el tiempo de validez del enlace de recuperación de contraseña (30 minutos máximo por seguridad)
DURACION_ENLACE = 30 * 60


def firma_contrasena(usuario):
    """crea una firma única para que si el alumno cambia su clave, los enlaces viejos expiren al instante."""
    return hashlib.sha256(usuario.contrasena_hash.encode("utf-8")).hexdigest()[:16]


def crear_token_recuperacion(usuario):
    """genera un código temporal seguro que se envía en el enlace de recuperación."""
    firmador = URLSafeTimedSerializer(current_app.config["SECRET_KEY"])
    return firmador.dumps(
        {"id": usuario.id, "firma": firma_contrasena(usuario)},
        salt="recuperar-contrasena",
    )


def usuario_desde_token(token):
    """comprueba si el código del enlace de recuperación es válido y aún no ha vencido."""
    firmador = URLSafeTimedSerializer(current_app.config["SECRET_KEY"])
    try:
        datos = firmador.loads(token, salt="recuperar-contrasena", max_age=DURACION_ENLACE)
    except (BadSignature, SignatureExpired):
        return None
    if not isinstance(datos, dict):
        return None
    usuario = db.session.get(Usuario, datos.get("id"))
    if not usuario or datos.get("firma") != firma_contrasena(usuario):
        return None
    return usuario


def enlace_absoluto(ruta):
    """construye la dirección web completa que se pondrá dentro del correo electrónico."""
    base = current_app.config.get("URL_PUBLICA")
    if not base:
        base = request.url_root.rstrip("/")
    return base.rstrip("/") + ruta


def _texto_correo(usuario, enlace):
    """genera el mensaje de texto plano para el correo de recuperación."""
    return (
        f"Hola, {usuario.nombre}.\n\n"
        "Recibimos una solicitud para cambiar tu contraseña de Vura.\n"
        f"Abre este enlace (vence en 30 minutos):\n\n{enlace}\n\n"
        "Si no fuiste tú, puedes ignorar este mensaje."
    )


def _html_correo(usuario, enlace):
    """genera la versión visual con formato web para el correo de recuperación."""
    return (
        f"<p>Hola, {usuario.nombre}.</p>"
        "<p>Recibimos una solicitud para cambiar tu contraseña de Vura.</p>"
        f'<p><a href="{enlace}">Cambiar mi contraseña</a> (el enlace vence en 30 minutos).</p>'
        "<p>Si no fuiste tú, puedes ignorar este mensaje.</p>"
    )


def enviar_por_brevo(usuario, enlace):
    """envía el correo de recuperación utilizando el servicio de envío por internet brevo."""
    clave = current_app.config.get("BREVO_API_KEY")
    remitente = current_app.config.get("BREVO_REMITENTE")
    if not clave or not remitente:
        return False

    cuerpo = json.dumps({
        "sender": {
            "name": current_app.config.get("BREVO_REMITENTE_NOMBRE", "Vura"),
            "email": remitente,
        },
        "to": [{"email": usuario.correo, "name": usuario.nombre}],
        "subject": "Recupera tu contraseña de Vura",
        "htmlContent": _html_correo(usuario, enlace),
        "textContent": _texto_correo(usuario, enlace),
    }).encode("utf-8")

    peticion = urllib.request.Request(
        "https://api.brevo.com/v3/smtp/email",
        data=cuerpo,
        headers={"api-key": clave, "content-type": "application/json", "accept": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(peticion, timeout=15) as respuesta:
            return 200 <= respuesta.status < 300
    except urllib.error.HTTPError as error:
        detalle = error.read().decode("utf-8", "ignore")
        current_app.logger.error("Brevo rechazó el correo (%s): %s", error.code, detalle)
        raise
    except urllib.error.URLError as error:
        current_app.logger.error("No se pudo contactar a Brevo: %s", error)
        raise


def enviar_por_smtp(usuario, enlace):
    """método alternativo de envío de correo por servidor estándar."""
    host = current_app.config.get("SMTP_HOST")
    remitente = current_app.config.get("SMTP_REMITENTE")
    if not host or not remitente:
        return False

    mensaje = EmailMessage()
    mensaje["Subject"] = "Recupera tu contraseña de Vura"
    mensaje["From"] = remitente
    mensaje["To"] = usuario.correo
    mensaje.set_content(_texto_correo(usuario, enlace))
    mensaje.add_alternative(_html_correo(usuario, enlace), subtype="html")

    puerto = current_app.config["SMTP_PORT"]
    if current_app.config["SMTP_SSL"]:
        servidor = smtplib.SMTP_SSL(host, puerto, timeout=15)
    else:
        servidor = smtplib.SMTP(host, puerto, timeout=15)
    with servidor:
        if current_app.config["SMTP_TLS"] and not current_app.config["SMTP_SSL"]:
            servidor.starttls()
        usuario_smtp = current_app.config.get("SMTP_USUARIO")
        contrasena_smtp = current_app.config.get("SMTP_CONTRASENA")
        if usuario_smtp and contrasena_smtp:
            servidor.login(usuario_smtp, contrasena_smtp)
        servidor.send_message(mensaje)
    return True


def enviar_correo_recuperacion(usuario, enlace):
    """intenta enviar el correo primero por brevo y si no funciona prueba con el método secundario."""
    if enviar_por_brevo(usuario, enlace):
        return
    if enviar_por_smtp(usuario, enlace):
        return
    raise RuntimeError("No hay ningún proveedor de correo configurado (Brevo o SMTP)")


# pantalla para crear una cuenta nueva de alumno
@autenticacion.route("/registro", methods=["GET", "POST"])
def registro():
    # si el usuario ya había iniciado sesión, lo mandamos directo al inicio
    if current_user.is_authenticated:
        return redirect(url_for("inicio"))

    formulario = FormularioRegistro()
    # si el alumno llenó el formulario y presionó el botón de crear cuenta
    if formulario.validate_on_submit():
        correo = formulario.correo.data.strip().lower()
        # verificamos que no exista otra cuenta registrada con el mismo correo
        existe = Usuario.query.filter_by(correo=correo).first()
        if existe:
            flash("Ese correo ya está registrado.", "warning")
            return render_template("autenticacion/registro.html", formulario=formulario)

        # creamos la nueva cuenta guardando nombre, correo y la contraseña escondida
        usuario = Usuario(nombre=formulario.nombre.data.strip(), correo=correo)
        usuario.establecer_contrasena(formulario.contrasena.data)
        db.session.add(usuario)
        db.session.commit()

        # iniciamos la sesión del nuevo alumno y le mostramos mensaje de bienvenida
        login_user(usuario)
        flash(f"¡Bienvenido a Vura, {usuario.nombre}!", "success")
        return redirect(url_for("inicio"))

    return render_template("autenticacion/registro.html", formulario=formulario)


# pantalla para ingresar con correo y contraseña
@autenticacion.route("/iniciar-sesion", methods=["GET", "POST"])
def iniciar_sesion():
    # si el alumno ya está conectado, lo llevamos a su inicio de trabajo
    if current_user.is_authenticated:
        return redirect(url_for("inicio"))

    formulario = FormularioInicioSesion()
    # si envió sus datos de correo y clave
    if formulario.validate_on_submit():
        correo = formulario.correo.data.strip().lower()
        # buscamos el usuario en el sistema
        usuario = Usuario.query.filter_by(correo=correo).first()
        # comprobamos si existe el usuario y si la clave ingresada es correcta
        if usuario and usuario.verificar_contrasena(formulario.contrasena.data):
            login_user(usuario)
            return redirect(url_for("inicio"))
        # si la clave o correo fallaron, le notificamos en pantalla
        flash("Correo o contraseña incorrectos.", "danger")

    return render_template("autenticacion/iniciar_sesion.html", formulario=formulario)


# pantalla para solicitar ayuda si se le olvidó la clave
@autenticacion.route("/olvide-contrasena", methods=["GET", "POST"])
def olvide_contrasena():
    if current_user.is_authenticated:
        return redirect(url_for("inicio"))

    formulario = FormularioRecuperacion()
    if formulario.validate_on_submit():
        correo = formulario.correo.data.strip().lower()
        usuario = Usuario.query.filter_by(correo=correo).first()
        enlace_desarrollo = None

        if usuario:
            # creamos el enlace con el código seguro de recuperación
            token = crear_token_recuperacion(usuario)
            ruta = url_for("autenticacion.restablecer_contrasena", token=token)
            enlace = enlace_absoluto(ruta)
            try:
                enviar_correo_recuperacion(usuario, enlace)
            except Exception:
                current_app.logger.exception("No se pudo enviar el correo de recuperación")
                if current_app.debug:
                    enlace_desarrollo = enlace

        # mostramos aviso informativo al alumno
        flash(
            "Si ese correo está registrado, recibirás un enlace para cambiar tu contraseña.",
            "info",
        )
        if enlace_desarrollo:
            flash("Modo local: enlace de recuperación: " + enlace_desarrollo, "warning")
        return redirect(url_for("autenticacion.iniciar_sesion"))

    return render_template("autenticacion/olvide_contrasena.html", formulario=formulario)


# pantalla donde el alumno escribe su clave nueva al abrir el enlace recibido por correo
@autenticacion.route("/restablecer-contrasena/<token>", methods=["GET", "POST"])
def restablecer_contrasena(token):
    # verifica si el enlace sigue activo o si ya venció
    usuario = usuario_desde_token(token)
    if not usuario:
        flash("Ese enlace venció o ya fue utilizado. Solicita uno nuevo.", "warning")
        return redirect(url_for("autenticacion.olvide_contrasena"))

    formulario = FormularioRestablecer()
    # si escribió la nueva clave bien y presionó guardar
    if formulario.validate_on_submit():
        usuario.establecer_contrasena(formulario.contrasena.data)
        db.session.commit()
        flash("Tu contraseña fue cambiada. Ya puedes iniciar sesión.", "success")
        return redirect(url_for("autenticacion.iniciar_sesion"))

    return render_template(
        "autenticacion/restablecer_contrasena.html",
        formulario=formulario,
    )


# opción para salir del sistema y cerrar la cuenta activa
@autenticacion.route("/cerrar-sesion")
def cerrar_sesion():
    logout_user()
    flash("Sesión cerrada. ¡Hasta pronto!", "info")
    return redirect(url_for("autenticacion.iniciar_sesion"))

