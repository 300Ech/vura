# este archivo define cómo se organizan los equipos de trabajo y sus miembros
# en la base de datos. su propósito es permitir la formación de grupos escolares
# con un líder, una lista de integrantes y un código único de acceso. lo hace
# creando plantillas conectadas que generan automáticamente códigos como vura-a8k2
# para invitar a otros compañeros. se construyó así para que cada grupo tenga
# su propio espacio privado sin interferir con otros equipos.


# importamos herramientas para generar códigos secretos aleatorios
import secrets


import string
# importamos herramientas para manejar la fecha y hora de creación del grupo
from datetime import datetime, timezone

# importamos la conexión con la base de datos
from extensiones import db


def generar_codigo_invitacion():
    """genera un código de 4 letras y números al azar con el prefijo VURA- (ej. VURA-A8K2) para invitar compañeros."""
    caracteres = string.ascii_uppercase + string.digits
    return "VURA-" + "".join(secrets.choice(caracteres) for _ in range(4))


# plantilla que guarda la información de cada equipo de trabajo creado por los alumnos

class Equipo(db.Model):
    __tablename__ = "equipos"

    id = db.Column(db.Integer, primary_key=True)
    nombre = db.Column(db.String(80), nullable=False)
    codigo_invitacion = db.Column(db.String(10), unique=True, nullable=False, default=generar_codigo_invitacion)
    creado_en = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    # alumno que lidera el equipo (quien lo creó, o a quien se le transfirió el liderazgo al salir el líder anterior)
    id_lider = db.Column(db.Integer, db.ForeignKey("usuarios.id"), nullable=False)

    miembros = db.relationship("MiembroEquipo", back_populates="equipo", cascade="all, delete-orphan")
    lider = db.relationship("Usuario", foreign_keys=[id_lider])
    # "proyectos" en el equipo llega por backref desde Proyecto.equipo (proyectos/models.py)

    def es_miembro(self, usuario):
        if not usuario or not usuario.is_authenticated:
            return False
        return MiembroEquipo.query.filter_by(id_equipo=self.id, id_usuario=usuario.id).first() is not None

    def es_lider(self, usuario):
        if not usuario or not usuario.is_authenticated:
            return False
        return self.id_lider == usuario.id


# plantilla que conecta a un alumno con un equipo de trabajo determinado
class MiembroEquipo(db.Model):

    __tablename__ = "miembros_equipo"
    __table_args__ = (db.UniqueConstraint("id_equipo", "id_usuario"),)

    # identificador de la unión entre el alumno y el grupo
    id = db.Column(db.Integer, primary_key=True)
    # número del equipo al que se unió el alumno
    id_equipo = db.Column(db.Integer, db.ForeignKey("equipos.id"), nullable=False)
    # número del alumno que se integró al equipo
    id_usuario = db.Column(db.Integer, db.ForeignKey("usuarios.id"), nullable=False)
    # fecha y hora en la que el estudiante se unió al equipo
    unido_en = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    equipo = db.relationship("Equipo", back_populates="miembros")
    usuario = db.relationship("Usuario")

