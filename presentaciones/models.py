from datetime import datetime, timezone

from extensiones import db


class Presentacion(db.Model):
    __tablename__ = "presentaciones"

    id = db.Column(db.Integer, primary_key=True)
    id_proyecto = db.Column(db.Integer, db.ForeignKey("proyectos.id"), unique=True, nullable=False)
    titulo = db.Column(db.String(120), nullable=False)
    actualizado_en = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc),
                               onupdate=lambda: datetime.now(timezone.utc))

    proyecto = db.relationship("Proyecto",
                               backref=db.backref("presentacion", uselist=False, cascade="all, delete-orphan"))
    diapositivas = db.relationship("Diapositiva", back_populates="presentacion",
                                   order_by="Diapositiva.orden", cascade="all, delete-orphan")


class Diapositiva(db.Model):
    __tablename__ = "diapositivas"

    id = db.Column(db.Integer, primary_key=True)
    id_presentacion = db.Column(db.Integer, db.ForeignKey("presentaciones.id"), nullable=False)
    orden = db.Column(db.Integer, nullable=False, default=1)
    contenido_json = db.Column(db.Text, nullable=True)  # JSON que exporta Fabric.js
    actualizado_en = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc),
                               onupdate=lambda: datetime.now(timezone.utc))
    actualizado_por = db.Column(db.Integer, db.ForeignKey("usuarios.id"), nullable=True)

    presentacion = db.relationship("Presentacion", back_populates="diapositivas")
