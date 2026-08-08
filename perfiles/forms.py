# este archivo crea el formulario para modificar la información del perfil
# del estudiante. su propósito es permitir que los alumnos personalicen sus
# datos visibles como su nombre, grado escolar, biografía y foto. lo hace
# preparando casillas con reglas que controlan la cantidad de texto escrita y
# la validez de los enlaces a fotos. se hizo así para que los estudiantes se
# identifiquen claramente ante su equipo de forma ordenada.


# importamos la herramienta para formularios interactivos en la web
from flask_wtf import FlaskForm


# importamos los tipos de casillas para texto de una línea, área de texto y botón de guardar
from wtforms import StringField, TextAreaField, SubmitField
# importamos las validaciones para requerir datos, límites de largo y direcciones web de imágenes
from wtforms.validators import DataRequired, Length, Optional, URL


# formulario para que los alumnos modifiquen su perfil personal
class FormularioPerfil(FlaskForm):
    # casilla para editar el nombre completo (entre 3 y 80 letras)
    nombre = StringField("Nombre completo", validators=[DataRequired(), Length(min=3, max=80)])
    # casilla opcional para colocar el grado escolar (ej. 8vo D)
    grado = StringField("Grado escolar", validators=[Optional(), Length(max=40)])
    # área de texto opcional para escribir una presentación personal (máximo 300 caracteres)
    descripcion = TextAreaField("Acerca de mí", validators=[Optional(), Length(max=300)])
    # casilla opcional para colocar el enlace de la imagen o foto de perfil
    avatar = StringField("Foto (URL de imagen)", validators=[Optional(), URL(), Length(max=200)])
    # botón azul para guardar los datos modificados del perfil
    enviar = SubmitField("Guardar cambios")

