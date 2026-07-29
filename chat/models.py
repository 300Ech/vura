from datetime import datetime, timezone

from extensiones import db


class Mensaje(db.Model):
    __tablename__ = "mensajes"

    id = db.Column(db.Integer, primary_key=True)
    id_equipo = db.Column(db.Integer, db.ForeignKey("equipos.id"), nullable=False)
    id_usuario = db.Column(db.Integer, db.ForeignKey("usuarios.id"), nullable=False)
    texto = db.Column(db.String(1000), nullable=False)
    enviado_en = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    usuario = db.relationship("Usuario")
    adjunto = db.relationship("AdjuntoMensaje", back_populates="mensaje", uselist=False,
                              cascade="all, delete-orphan")
    reacciones = db.relationship("ReaccionMensaje", back_populates="mensaje",
                                 cascade="all, delete-orphan")


class AdjuntoMensaje(db.Model):
    __tablename__ = "adjuntos_mensaje"

    id = db.Column(db.Integer, primary_key=True)
    id_mensaje = db.Column(db.Integer, db.ForeignKey("mensajes.id"), unique=True, nullable=False)
    tipo = db.Column(db.String(10), nullable=False)  # imagen o audio
    nombre_original = db.Column(db.String(120), nullable=False)
    nombre_guardado = db.Column(db.String(80), unique=True, nullable=False)

    mensaje = db.relationship("Mensaje", back_populates="adjunto")


class ReaccionMensaje(db.Model):
    __tablename__ = "reacciones_mensaje"
    __table_args__ = (
        db.UniqueConstraint("id_mensaje", "id_usuario", "emoji"),
    )

    id = db.Column(db.Integer, primary_key=True)
    id_mensaje = db.Column(db.Integer, db.ForeignKey("mensajes.id"), nullable=False)
    id_usuario = db.Column(db.Integer, db.ForeignKey("usuarios.id"), nullable=False)
    emoji = db.Column(db.String(10), nullable=False)

    mensaje = db.relationship("Mensaje", back_populates="reacciones")
