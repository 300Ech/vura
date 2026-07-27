from flask_wtf import FlaskForm
from wtforms import StringField, TextAreaField, SubmitField
from wtforms.validators import DataRequired, Length, Optional, URL


class FormularioPerfil(FlaskForm):
    nombre = StringField("Nombre completo", validators=[DataRequired(), Length(min=3, max=80)])
    grado = StringField("Grado escolar", validators=[Optional(), Length(max=40)])
    descripcion = TextAreaField("Acerca de mí", validators=[Optional(), Length(max=300)])
    avatar = StringField("Foto (URL de imagen)", validators=[Optional(), URL(), Length(max=200)])
    enviar = SubmitField("Guardar cambios")
