from flask_wtf import FlaskForm
from wtforms import StringField, TextAreaField, DateField, SubmitField
from wtforms.validators import DataRequired, Length, Optional


class FormularioProyecto(FlaskForm):
    nombre = StringField("Nombre del proyecto", validators=[DataRequired(), Length(min=3, max=80)])
    descripcion = TextAreaField("Descripción", validators=[Optional(), Length(max=500)])
    fecha_entrega = DateField("Fecha de entrega", validators=[Optional()])
    enviar = SubmitField("Guardar proyecto")
