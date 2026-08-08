# este archivo construye los formularios de registro, inicio de sesión y
# recuperación de clave. su propósito es mostrar las casillas de texto en la
# pantalla y verificar que los estudiantes escriban sus datos sin
# equivocaciones. lo hace estableciendo reglas automáticas que exigen llenar
# los campos obligatorios, revisar correos válidos y comprobar contraseñas. se
# hizo así para impedir que entren datos incompletos o mal escritos a la base
# de datos.


# importamos la herramienta para construir formularios interactivos en las páginas web
from flask_wtf import FlaskForm


# importamos los tipos de casillas para texto normal, casilla de clave y botón de envío
from wtforms import StringField, PasswordField, SubmitField
# importamos las validaciones para exigir datos, revisar correos válidos y comparar claves
from wtforms.validators import DataRequired, Email, EqualTo, Length


# formulario para crear una nueva cuenta de estudiante en vura
class FormularioRegistro(FlaskForm):
    # casilla para el nombre completo (exige llenar dato y entre 3 y 80 caracteres)
    nombre = StringField("Nombre completo", validators=[DataRequired(), Length(min=3, max=80)])
    # casilla para el correo electrónico (comprueba que tenga formato de correo válido)
    correo = StringField("Correo electrónico", validators=[DataRequired(), Email()])
    # casilla para ingresar la contraseña (exige un mínimo de 6 caracteres por seguridad)
    contrasena = PasswordField("Contraseña", validators=[DataRequired(), Length(min=6)])
    # segunda casilla de contraseña para verificar que el usuario no cometió un error al escribirla
    confirmar_contrasena = PasswordField(
        "Confirmar contraseña",
        validators=[DataRequired(), EqualTo("contrasena", message="Las contraseñas no coinciden")],
    )
    # botón azul para enviar los datos e inscribirse
    enviar = SubmitField("Crear cuenta")


# formulario para ingresar a una cuenta ya registrada
class FormularioInicioSesion(FlaskForm):
    # casilla obligatoria para escribir el correo registrado
    correo = StringField("Correo electrónico", validators=[DataRequired(), Email()])
    # casilla obligatoria para escribir la clave secreta
    contrasena = PasswordField("Contraseña", validators=[DataRequired()])
    # botón para enviar las credenciales e ingresar
    enviar = SubmitField("Entrar")


# formulario para solicitar el restablecimiento si al alumno se le olvidó su contraseña
class FormularioRecuperacion(FlaskForm):
    # casilla donde el alumno escribe su correo para recibir el enlace de ayuda
    correo = StringField("Correo electrónico", validators=[DataRequired(), Email()])
    # botón para solicitar el envío del correo de recuperación
    enviar = SubmitField("Enviar enlace")


# formulario que le aparece al alumno para escribir su nueva contraseña
class FormularioRestablecer(FlaskForm):
    # casilla para ingresar la nueva contraseña elegida
    contrasena = PasswordField("Nueva contraseña", validators=[DataRequired(), Length(min=6)])
    # casilla para reescribir la nueva contraseña y confirmar que esté bien escrita
    confirmar_contrasena = PasswordField(
        "Confirmar nueva contraseña",
        validators=[DataRequired(), EqualTo("contrasena", message="Las contraseñas no coinciden")],
    )
    # botón para guardar la nueva contraseña cambiada
    enviar = SubmitField("Cambiar contraseña")

