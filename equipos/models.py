import secrets
import string
from datetime import datetime, timezone

from extensiones import db


def generar_codigo_invitacion():
    caracteres = string.ascii_uppercase + string.digits
    return "VURA-" + "".join(secrets.choice(caracteres) for _ in range(4))


class Equipo(db.Model):
    __tablename__ = "equipos"

    id = db.Column(db.Integer, primary_key=True)
    nombre = db.Column(db.String(80), nullable=False)
    codigo_invitacion = db.Column(db.String(12), unique=True, nullable=False, default=generar_codigo_invitacion)
    id_lider = db.Column(db.Integer, db.ForeignKey("usuarios.id"), nullable=False)
    creado_en = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    lider = db.relationship("Usuario")
    miembros = db.relationship("MiembroEquipo", back_populates="equipo", cascade="all, delete-orphan")

    def es_miembro(self, usuario):
        return any(miembro.id_usuario == usuario.id for miembro in self.miembros)


class MiembroEquipo(db.Model):
    __tablename__ = "miembros_equipo"
    __table_args__ = (db.UniqueConstraint("id_equipo", "id_usuario"),)

    id = db.Column(db.Integer, primary_key=True)
    id_equipo = db.Column(db.Integer, db.ForeignKey("equipos.id"), nullable=False)
    id_usuario = db.Column(db.Integer, db.ForeignKey("usuarios.id"), nullable=False)
    unido_en = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    equipo = db.relationship("Equipo", back_populates="miembros")
    usuario = db.relationship("Usuario")
