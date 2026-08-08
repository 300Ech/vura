# este archivo construye los formularios para crear un nuevo equipo o unirse
# a uno existente con un código. su propósito es darle a los alumnos las casillas
# de texto para nombrar a su grupo o ingresar la clave que les compartió un
# compañero. lo hace preparando casillas validadas que exigen nombres claros y
# códigos bien formados. se hizo así para que la formación e incorporación a
# los equipos sea ágil y libre de equivocaciones.


# importamos la herramienta para crear formularios interactivos en la página web
from flask_wtf import FlaskForm


# importamos los componentes para la casilla de texto y el botón de enviar
from wtforms import StringField, SubmitField
# importamos las reglas para validar que la casilla no se envíe vacía y tenga un tamaño adecuado
from wtforms.validators import DataRequired, Length


# formulario para crear un nuevo equipo de trabajo
class FormularioCrearEquipo(FlaskForm):
    # casilla donde se ingresa el nombre del nuevo equipo de trabajo (ej. Grupo 9)
    nombre = StringField("Nombre del equipo", validators=[DataRequired(), Length(min=3, max=80)])
    # botón para confirmar y crear el equipo en el sistema
    enviar = SubmitField("Crear equipo")


# formulario para unirse a un equipo de trabajo ya existente usando un código
class FormularioUnirseEquipo(FlaskForm):
    # casilla donde el alumno escribe el código de invitación recibido (ej. VURA-A8K2)
    codigo_invitacion = StringField("Código de invitación", validators=[DataRequired(), Length(min=6, max=12)])
    # botón para enviar el código y registrarse en el equipo
    enviar = SubmitField("Unirme")

