# este archivo define la plantilla de un proyecto o trabajo escolar en la base
# de datos. su propósito es guardar el título, la descripción, la fecha de
# entrega y el equipo responsable del trabajo. lo hace relacionando directamente
# cada proyecto con su grupo correspondiente. se diseñó de esta forma para que
# un equipo pueda administrar uno o varios proyectos escolares de forma clara.


# importamos herramientas para manejar fechas de creación y entrega de proyectos
from datetime import datetime, timezone



# importamos la conexión a la base de datos
from extensiones import db


# tabla que guarda los datos de cada proyecto o trabajo escolar creado por un equipo
class Proyecto(db.Model):

    __tablename__ = "proyectos"


    # número único identificador de cada proyecto
    id = db.Column(db.Integer, primary_key=True)
    # número del equipo de trabajo al que pertenece este proyecto
    id_equipo = db.Column(db.Integer, db.ForeignKey("equipos.id"), nullable=False)
    # nombre del proyecto (ej. Feria Tecnológica 2026)
    nombre = db.Column(db.String(80), nullable=False)
    # descripción o explicación de lo que trata el trabajo
    descripcion = db.Column(db.String(500), nullable=True)
    # fecha límite acordada para entregar el proyecto al docente
    fecha_entrega = db.Column(db.Date, nullable=True)
    # fecha y hora en la que se dio de alta el proyecto
    creado_en = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    # enlace que conecta el proyecto con su equipo correspondiente
    equipo = db.relationship("Equipo", backref=db.backref("proyectos", cascade="all, delete-orphan"))

