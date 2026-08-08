# este archivo define las plantillas de las tareas en el tablero del proyecto, sus
# comentarios y sus archivos adjuntos. su propósito es hacer posible la división
# del trabajo en fases (pendiente, en progreso, terminada), asignando responsables
# y documentos de entrega. lo hace mediante tres plantillas en la base de datos.
# se construyó así para que cada estudiante sepa cuál es su responsabilidad.



# importamos herramientas para generar identificadores únicos de tareas y manejar horas
import uuid
from datetime import datetime, timezone

# importamos la conexión a la base de datos
from extensiones import db

# valores internos válidos para el estado de una tarea
ESTADOS_TAREA = ("pendiente", "en_progreso", "terminada")
# nombres amigables para mostrar en pantalla según el estado
TITULOS_ESTADO = {
    "pendiente": "Pendiente",
    "en_progreso": "En progreso",
    "terminada": "Terminada",
}
# explicaciones sencillas de cada estado para orientación del alumno
DESCRIPCIONES_ESTADO = {
    "pendiente": "Tareas por iniciar",
    "en_progreso": "Tareas en desarrollo actualmente",
    "terminada": "Tareas finalizadas por el equipo",
}


# plantilla que guarda la información de cada tarea asignada en el tablero de trabajo
class Tarea(db.Model):
    __tablename__ = "tareas"

    id = db.Column(db.Integer, primary_key=True)
    # código único de la tarea, usado en los enlaces en vez del número interno
    uuid = db.Column(db.String(36), unique=True, nullable=False, default=lambda: str(uuid.uuid4()))
    id_proyecto = db.Column(db.Integer, db.ForeignKey("proyectos.id"), nullable=False)
    id_asignado = db.Column(db.Integer, db.ForeignKey("usuarios.id"), nullable=True)
    titulo = db.Column(db.String(120), nullable=False)
    descripcion = db.Column(db.Text, nullable=True)
    estado = db.Column(db.String(20), nullable=False, default="pendiente")
    # posición de la tarjeta dentro de su columna, para recordar el orden en que el alumno la dejó
    orden = db.Column(db.Integer, nullable=True)
    fecha_limite = db.Column(db.Date, nullable=True)
    # última vez que se modificó la tarea, para saber si hay cambios recientes
    actualizado_en = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc),
                               onupdate=lambda: datetime.now(timezone.utc))
    actualizado_por = db.Column(db.Integer, db.ForeignKey("usuarios.id"), nullable=True)

    proyecto = db.relationship("Proyecto", backref=db.backref("tareas", cascade="all, delete-orphan"))
    asignado = db.relationship("Usuario", foreign_keys=[id_asignado])

# plantilla que guarda los comentarios y dudas que escriben los estudiantes sobre una tarea
class ComentarioTarea(db.Model):
    __tablename__ = "comentarios_tarea"

    id = db.Column(db.Integer, primary_key=True)
    uuid_tarea = db.Column(db.String(36), nullable=False, index=True)
    id_autor = db.Column(db.Integer, db.ForeignKey("usuarios.id"), nullable=False)
    texto = db.Column(db.String(300), nullable=False)
    creado_en = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    autor = db.relationship("Usuario")


# plantilla que guarda los archivos (pdf, imágenes, documentos) adjuntados a una tarea
class ArchivoTarea(db.Model):

    __tablename__ = "archivos_tarea"

    id = db.Column(db.Integer, primary_key=True)
    # código único de la tarea a la que se adjuntó el archivo
    uuid_tarea = db.Column(db.String(36), nullable=False, index=True)
    # alumno que subió el archivo
    id_autor = db.Column(db.Integer, db.ForeignKey("usuarios.id"), nullable=False)
    # nombre real con el que el alumno subió el archivo
    nombre_original = db.Column(db.String(120), nullable=False)
    # nombre secreto generado en el disco para evitar que dos archivos con el mismo nombre se sobreescriban
    nombre_guardado = db.Column(db.String(80), unique=True, nullable=False)
    # hora y fecha en la que se subió el archivo
    creado_en = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    autor = db.relationship("Usuario")

