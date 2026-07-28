from flask_wtf import FlaskForm
from wtforms import StringField, SubmitField
from wtforms.validators import DataRequired, Length


class FormularioCrearEquipo(FlaskForm):
    nombre = StringField("Nombre del equipo", validators=[DataRequired(), Length(min=3, max=80)])
    enviar = SubmitField("Crear equipo")


class FormularioUnirseEquipo(FlaskForm):
    codigo_invitacion = StringField("Código de invitación", validators=[DataRequired(), Length(min=6, max=12)])
    enviar = SubmitField("Unirme")
