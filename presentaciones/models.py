# este archivo define las plantillas de información de las presentaciones de
# diapositivas y sus láminas individuales. su propósito es permitir que los
# estudiantes maqueten su exposición con textos, formas y fichas de apoyo. lo
# hace conectando la presentación del proyecto con una serie de diapositivas
# ordenadas (1, 2, 3...) en la base de datos. se concibió así para preparar
# la exposición oral dentro de la misma herramienta.


# importamos utilidades para guardar la fecha y hora de edición de diapositivas
from datetime import datetime, timezone



# importamos la conexión a la base de datos
from extensiones import db


# plantilla que guarda la presentación de láminas/diapositivas para la exposición del proyecto
class Presentacion(db.Model):
    __tablename__ = "presentaciones"

    # número único de la presentación
    id = db.Column(db.Integer, primary_key=True)
    # proyecto al que pertenecen las diapositivas
    id_proyecto = db.Column(db.Integer, db.ForeignKey("proyectos.id"), unique=True, nullable=False)
    # título de la presentación (ej. Exposición Grupo 9)
    titulo = db.Column(db.String(120), nullable=False)
    # fecha y hora del último cambio guardado
    actualizado_en = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc),
                               onupdate=lambda: datetime.now(timezone.utc))

    proyecto = db.relationship("Proyecto",
                               backref=db.backref("presentacion", uselist=False, cascade="all, delete-orphan"))
    diapositivas = db.relationship("Diapositiva", back_populates="presentacion",
                                   order_by="Diapositiva.orden", cascade="all, delete-orphan")


# plantilla que guarda cada una de las diapositivas o láminas individuales de la exposición
class Diapositiva(db.Model):
    __tablename__ = "diapositivas"

    # número único de la diapositiva
    id = db.Column(db.Integer, primary_key=True)
    # presentación a la que pertenece esta lámina
    id_presentacion = db.Column(db.Integer, db.ForeignKey("presentaciones.id"), nullable=False)
    # orden o posición de la diapositiva en la secuencia (1, 2, 3...)
    orden = db.Column(db.Integer, nullable=False, default=1)
    # contenido gráfico de la diapositiva (textos, imágenes, formas)
    contenido_json = db.Column(db.Text, nullable=True)
    # apuntes privados del estudiante para recordar qué decir durante la exposición
    notas = db.Column(db.Text, nullable=True)
    # fecha y hora de modificación de la diapositiva
    actualizado_en = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc),
                               onupdate=lambda: datetime.now(timezone.utc))
    # alumno que realizó el último cambio
    actualizado_por = db.Column(db.Integer, db.ForeignKey("usuarios.id"), nullable=True)

    presentacion = db.relationship("Presentacion", back_populates="diapositivas")

