# este archivo define la plantilla de la pizarra colaborativa del proyecto. la
# pizarra es un lienzo interactivo donde los alumnos plasman ideas gráficas,
# notas de colores y bocetos. su propósito es asegurar que los dibujos y notas
# adhesivas no se borren y queden respaldados. lo hace guardando la lista de
# elementos visuales asociada a cada proyecto en la base de datos sqlite.
# elegimos sqlite para guardar la pizarra porque permite mantener la información
# ordenada en un solo archivo accesible al instante. se diseñó de este modo para
# que los esquemas del equipo permanezcan siempre disponibles.


# importamos utilidades para guardar fechas y horas en las notas de la pizarra
from datetime import datetime, timezone


# importamos la conexión a la base de datos
from extensiones import db


# tabla de información que guarda todo lo escrito y dibujado en la pizarra del equipo
class Nota(db.Model):
    __tablename__ = "notas"

    # número único de la nota/pizarra
    id = db.Column(db.Integer, primary_key=True)
    # proyecto al que pertenece esta pizarra única
    id_proyecto = db.Column(db.Integer, db.ForeignKey("proyectos.id"), unique=True, nullable=False)
    # contenido gráfico de la pizarra (dibujos, textos, tarjetas flotantes)
    contenido_json = db.Column(db.Text, nullable=True)
    # hora y fecha de la última modificación en la pizarra
    actualizado_en = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc),
                               onupdate=lambda: datetime.now(timezone.utc))
    # alumno que realizó el último trazo o modificación
    actualizado_por = db.Column(db.Integer, db.ForeignKey("usuarios.id"), nullable=True)

    proyecto = db.relationship("Proyecto", backref=db.backref("nota", uselist=False, cascade="all, delete-orphan"))
    autor_ultimo_cambio = db.relationship("Usuario")
