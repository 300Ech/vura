from datetime import datetime, timezone

from extensiones import db


class Nota(db.Model):
    __tablename__ = "notas"

    id = db.Column(db.Integer, primary_key=True)
    id_proyecto = db.Column(db.Integer, db.ForeignKey("proyectos.id"), unique=True, nullable=False)
    contenido_json = db.Column(db.Text, nullable=True)  # Delta de Quill.js
    actualizado_en = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc),
                               onupdate=lambda: datetime.now(timezone.utc))
    actualizado_por = db.Column(db.Integer, db.ForeignKey("usuarios.id"), nullable=True)

    proyecto = db.relationship("Proyecto", backref=db.backref("nota", uselist=False, cascade="all, delete-orphan"))
    autor_ultimo_cambio = db.relationship("Usuario")
