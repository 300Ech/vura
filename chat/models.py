# este archivo define la tabla de información para los mensajes del chat, los
# archivos adjuntos (fotos/audios) y las reacciones con emojis. su propósito es
# asegurar que las conversaciones del equipo queden guardadas para siempre en
# la base de datos. lo hace creando plantillas conectadas que guardan el texto, los
# audios, las imágenes y las reacciones. se diseñó así para evitar que los
# estudiantes pierdan las explicaciones o acuerdos del grupo.



# importamos utilidades para guardar la hora exacta en la que se envió un mensaje
from datetime import datetime, timezone



# importamos la conexión a la base de datos
from extensiones import db


# plantilla que guarda la información de cada mensaje enviado en el chat grupal
class Mensaje(db.Model):
    __tablename__ = "mensajes"

    id = db.Column(db.Integer, primary_key=True)
    id_equipo = db.Column(db.Integer, db.ForeignKey("equipos.id"), nullable=False)
    id_usuario = db.Column(db.Integer, db.ForeignKey("usuarios.id"), nullable=False)
    texto = db.Column(db.Text, nullable=True)
    enviado_en = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    equipo = db.relationship("Equipo", backref=db.backref("mensajes", cascade="all, delete-orphan"))
    usuario = db.relationship("Usuario")
    adjunto = db.relationship("AdjuntoMensaje", backref="mensaje", uselist=False, cascade="all, delete-orphan")
    reacciones = db.relationship("ReaccionMensaje", back_populates="mensaje", cascade="all, delete-orphan")


# plantilla que guarda la información de fotos o notas de voz enviadas en el chat
class AdjuntoMensaje(db.Model):
    __tablename__ = "adjuntos_mensaje"

    id = db.Column(db.Integer, primary_key=True)
    id_mensaje = db.Column(db.Integer, db.ForeignKey("mensajes.id"), unique=True, nullable=False)
    nombre_guardado = db.Column(db.String(255), nullable=False)
    nombre_original = db.Column(db.String(255), nullable=False)
    tipo = db.Column(db.String(20), nullable=False)  # "imagen" o "audio"


# plantilla que guarda los emojis de reacción que colocan los compañeros a un mensaje
class ReaccionMensaje(db.Model):
    __tablename__ = "reacciones_mensaje"
    __table_args__ = (
        db.UniqueConstraint("id_mensaje", "id_usuario", "emoji"),
    )


    id = db.Column(db.Integer, primary_key=True)
    # mensaje al que le pusieron la reacción
    id_mensaje = db.Column(db.Integer, db.ForeignKey("mensajes.id"), nullable=False)
    # alumno que colocó el emoji
    id_usuario = db.Column(db.Integer, db.ForeignKey("usuarios.id"), nullable=False)
    # emoji seleccionado (ej. 👍, ❤️, 😂, 🎉, 👀)
    emoji = db.Column(db.String(10), nullable=False)

    mensaje = db.relationship("Mensaje", back_populates="reacciones")

