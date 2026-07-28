from datetime import datetime, timezone

from extensiones import db


class Proyecto(db.Model):
    __tablename__ = "proyectos"

    id = db.Column(db.Integer, primary_key=True)
    id_equipo = db.Column(db.Integer, db.ForeignKey("equipos.id"), nullable=False)
    nombre = db.Column(db.String(80), nullable=False)
    descripcion = db.Column(db.String(500), nullable=True)
    fecha_entrega = db.Column(db.Date, nullable=True)
    creado_en = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    equipo = db.relationship("Equipo", backref=db.backref("proyectos", cascade="all, delete-orphan"))
