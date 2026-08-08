# este archivo construye el formulario para registrar o editar un proyecto
# escolar. su propósito es permitir que los estudiantes definan el nombre de
# su trabajo, la explicación del tema y el día en que deben entregarlo. lo hace
# mediante casillas de texto y un selector de fecha con validaciones. se hizo
# así para capturar la información clave del proyecto de manera sencilla.


# importamos la herramienta para formularios interactivos
from flask_wtf import FlaskForm


# importamos los tipos de casilla para texto corto, descripción, fecha de entrega y botón
from wtforms import StringField, TextAreaField, DateField, SubmitField
# importamos validadores de datos obligatorios y largos permitidos
from wtforms.validators import DataRequired, Length, Optional


# formulario para dar de alta un nuevo proyecto escolar en el sistema
class FormularioProyecto(FlaskForm):
    # casilla donde el alumno escribe el nombre del trabajo
    nombre = StringField("Nombre del proyecto", validators=[DataRequired(), Length(min=3, max=80)])
    # área para escribir detalles sobre lo que tratará el trabajo
    descripcion = TextAreaField("Descripción", validators=[Optional(), Length(max=500)])
    # casilla con calendario para elegir la fecha límite de entrega
    fecha_entrega = DateField("Fecha de entrega", validators=[Optional()])
    # botón para guardar el nuevo proyecto en el grupo
    enviar = SubmitField("Guardar proyecto")

