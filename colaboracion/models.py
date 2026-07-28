from datetime import datetime, timezone

from extensiones import db


class DocumentoYjs(db.Model):
    """Estado binario de un documento colaborativo de Yjs.

    El servidor lo guarda y lo reparte tal cual; nunca lo interpreta.
    La fusión de cambios la hace Yjs en el navegador.
    """

    __tablename__ = "documentos_yjs"
    __table_args__ = (db.UniqueConstraint("tipo", "id_proyecto"),)

    id = db.Column(db.Integer, primary_key=True)
    tipo = db.Column(db.String(20), nullable=False)  # "notas" / "presentacion" / "tablero_tareas"
    id_proyecto = db.Column(db.Integer, db.ForeignKey("proyectos.id"), nullable=False)
    estado = db.Column(db.LargeBinary, nullable=True)
    actualizado_en = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc),
                               onupdate=lambda: datetime.now(timezone.utc))
