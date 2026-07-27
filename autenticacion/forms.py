from flask_wtf import FlaskForm
from wtforms import StringField, PasswordField, SubmitField
from wtforms.validators import DataRequired, Email, EqualTo, Length


class FormularioRegistro(FlaskForm):
    nombre = StringField("Nombre completo", validators=[DataRequired(), Length(min=3, max=80)])
    correo = StringField("Correo electrónico", validators=[DataRequired(), Email()])
    contrasena = PasswordField("Contraseña", validators=[DataRequired(), Length(min=6)])
    confirmar_contrasena = PasswordField(
        "Confirmar contraseña",
        validators=[DataRequired(), EqualTo("contrasena", message="Las contraseñas no coinciden")],
    )
    enviar = SubmitField("Crear cuenta")


class FormularioInicioSesion(FlaskForm):
    correo = StringField("Correo electrónico", validators=[DataRequired(), Email()])
    contrasena = PasswordField("Contraseña", validators=[DataRequired()])
    enviar = SubmitField("Entrar")
