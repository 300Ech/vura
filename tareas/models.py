import uuid
from datetime import datetime, timezone

from extensiones import db

ESTADOS_TAREA = ["pendiente", "en_progreso", "terminada"]

TITULOS_ESTADO = {
    "pendiente": "Pendiente",
    "en_progreso": "En progreso",
    "terminada": "Terminada",
}


class Tarea(db.Model):
    __tablename__ = "tareas"

    id = db.Column(db.Integer, primary_key=True)
    uuid = db.Column(db.String(36), unique=True, nullable=False, default=lambda: str(uuid.uuid4()))
    id_proyecto = db.Column(db.Integer, db.ForeignKey("proyectos.id"), nullable=False)
    titulo = db.Column(db.String(120), nullable=False)
    descripcion = db.Column(db.String(500), nullable=True)
    estado = db.Column(db.String(20), nullable=False, default="pendiente")
    id_asignado = db.Column(db.Integer, db.ForeignKey("usuarios.id"), nullable=True)
    fecha_limite = db.Column(db.Date, nullable=True)
    actualizado_en = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc),
                               onupdate=lambda: datetime.now(timezone.utc))
    actualizado_por = db.Column(db.Integer, db.ForeignKey("usuarios.id"), nullable=True)

    proyecto = db.relationship("Proyecto", backref=db.backref("tareas", cascade="all, delete-orphan"))
    asignado = db.relationship("Usuario", foreign_keys=[id_asignado])


class ComentarioTarea(db.Model):
    __tablename__ = "comentarios_tarea"

    id = db.Column(db.Integer, primary_key=True)
    uuid_tarea = db.Column(db.String(36), nullable=False, index=True)
    id_autor = db.Column(db.Integer, db.ForeignKey("usuarios.id"), nullable=False)
    texto = db.Column(db.String(300), nullable=False)
    creado_en = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    autor = db.relationship("Usuario")


class ArchivoTarea(db.Model):
    __tablename__ = "archivos_tarea"

    id = db.Column(db.Integer, primary_key=True)
    uuid_tarea = db.Column(db.String(36), nullable=False, index=True)
    id_autor = db.Column(db.Integer, db.ForeignKey("usuarios.id"), nullable=False)
    nombre_original = db.Column(db.String(120), nullable=False)
    nombre_guardado = db.Column(db.String(80), unique=True, nullable=False)
    creado_en = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    autor = db.relationship("Usuario")
