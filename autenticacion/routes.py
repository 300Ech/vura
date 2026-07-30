import hashlib
import json
import smtplib
import urllib.error
import urllib.request
from email.message import EmailMessage

from flask import Blueprint, render_template, redirect, url_for, flash, current_app, request
from flask_login import login_user, logout_user, current_user
from itsdangerous import URLSafeTimedSerializer, BadSignature, SignatureExpired

from extensiones import db
from autenticacion.models import Usuario
from autenticacion.forms import (
    FormularioRegistro,
    FormularioInicioSesion,
    FormularioRecuperacion,
    FormularioRestablecer,
)

autenticacion = Blueprint("autenticacion", __name__, template_folder="templates")

DURACION_ENLACE = 30 * 60  # 30 minutos


def firma_contrasena(usuario):
    """Hace que un enlace viejo deje de servir en cuanto cambia la contraseña."""
    return hashlib.sha256(usuario.contrasena_hash.encode("utf-8")).hexdigest()[:16]


def crear_token_recuperacion(usuario):
    firmador = URLSafeTimedSerializer(current_app.config["SECRET_KEY"])
    return firmador.dumps(
        {"id": usuario.id, "firma": firma_contrasena(usuario)},
        salt="recuperar-contrasena",
    )


def usuario_desde_token(token):
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


def _texto_correo(usuario, enlace):
    return (
        f"Hola, {usuario.nombre}.\n\n"
        "Recibimos una solicitud para cambiar tu contraseña de Vura.\n"
        f"Abre este enlace (vence en 30 minutos):\n\n{enlace}\n\n"
        "Si no fuiste tú, puedes ignorar este mensaje."
    )


def _html_correo(usuario, enlace):
    return (
        f"<p>Hola, {usuario.nombre}.</p>"
        "<p>Recibimos una solicitud para cambiar tu contraseña de Vura.</p>"
        f'<p><a href="{enlace}">Cambiar mi contraseña</a> (el enlace vence en 30 minutos).</p>'
        "<p>Si no fuiste tú, puedes ignorar este mensaje.</p>"
    )


def enviar_por_brevo(usuario, enlace):
    """Envía el correo con la API HTTP de Brevo. Devuelve True si lo logró."""
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
    """Respaldo por SMTP (útil en local; en Railway el SMTP saliente está bloqueado)."""
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
    """Intenta Brevo (API HTTP) y, si no está configurado, cae al SMTP."""
    if enviar_por_brevo(usuario, enlace):
        return
    if enviar_por_smtp(usuario, enlace):
        return
    raise RuntimeError("No hay ningún proveedor de correo configurado (Brevo o SMTP)")


@autenticacion.route("/registro", methods=["GET", "POST"])
def registro():
    if current_user.is_authenticated:
        return redirect(url_for("inicio"))

    formulario = FormularioRegistro()
    if formulario.validate_on_submit():
        correo = formulario.correo.data.strip().lower()
        existe = Usuario.query.filter_by(correo=correo).first()
        if existe:
            flash("Ese correo ya está registrado.", "warning")
            return render_template("autenticacion/registro.html", formulario=formulario)

        usuario = Usuario(nombre=formulario.nombre.data.strip(), correo=correo)
        usuario.establecer_contrasena(formulario.contrasena.data)
        db.session.add(usuario)
        db.session.commit()

        login_user(usuario)
        flash(f"¡Bienvenido a Vura, {usuario.nombre}!", "success")
        return redirect(url_for("inicio"))

    return render_template("autenticacion/registro.html", formulario=formulario)


@autenticacion.route("/iniciar-sesion", methods=["GET", "POST"])
def iniciar_sesion():
    if current_user.is_authenticated:
        return redirect(url_for("inicio"))

    formulario = FormularioInicioSesion()
    if formulario.validate_on_submit():
        correo = formulario.correo.data.strip().lower()
        usuario = Usuario.query.filter_by(correo=correo).first()
        if usuario and usuario.verificar_contrasena(formulario.contrasena.data):
            login_user(usuario)
            return redirect(url_for("inicio"))
        flash("Correo o contraseña incorrectos.", "danger")

    return render_template("autenticacion/iniciar_sesion.html", formulario=formulario)


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
            token = crear_token_recuperacion(usuario)
            ruta = url_for("autenticacion.restablecer_contrasena", token=token)
            base = (current_app.config.get("URL_PUBLICA") or request.url_root).rstrip("/")
            enlace = base + ruta
            try:
                enviar_correo_recuperacion(usuario, enlace)
            except Exception:
                current_app.logger.exception("No se pudo enviar el correo de recuperación")
                if current_app.debug:
                    enlace_desarrollo = enlace

        # La respuesta es igual aunque el correo no exista para no revelar cuentas.
        flash(
            "Si ese correo está registrado, recibirás un enlace para cambiar tu contraseña.",
            "info",
        )
        if enlace_desarrollo:
            flash("Modo local: enlace de recuperación: " + enlace_desarrollo, "warning")
        return redirect(url_for("autenticacion.iniciar_sesion"))

    return render_template("autenticacion/olvide_contrasena.html", formulario=formulario)


@autenticacion.route("/restablecer-contrasena/<token>", methods=["GET", "POST"])
def restablecer_contrasena(token):
    usuario = usuario_desde_token(token)
    if not usuario:
        flash("Ese enlace venció o ya fue utilizado. Solicita uno nuevo.", "warning")
        return redirect(url_for("autenticacion.olvide_contrasena"))

    formulario = FormularioRestablecer()
    if formulario.validate_on_submit():
        usuario.establecer_contrasena(formulario.contrasena.data)
        db.session.commit()
        flash("Tu contraseña fue cambiada. Ya puedes iniciar sesión.", "success")
        return redirect(url_for("autenticacion.iniciar_sesion"))

    return render_template(
        "autenticacion/restablecer_contrasena.html",
        formulario=formulario,
    )


@autenticacion.route("/cerrar-sesion")
def cerrar_sesion():
    logout_user()
    flash("Sesión cerrada. ¡Hasta pronto!", "info")
    return redirect(url_for("autenticacion.iniciar_sesion"))
