# este archivo define la tabla de respaldo que guarda la sincronización
# colaborativa en vivo. su propósito es permitir que los cambios realizados por
# un alumno en la pizarra o presentación se transmitan al instante a sus compañeros.
# lo hace almacenando los estados de edición en formato binario vinculado a cada
# proyecto. se concibió de esta manera para garantizar que la edición compartida
# sea veloz y no sobrecargue la base de datos.


# importamos herramientas para registrar la fecha y hora de los cambios en vivo
from datetime import datetime, timezone



# importamos la conexión a la base de datos
from extensiones import db


# plantilla que guarda el estado de edición en vivo (dibujos, notas o tarjetas del tablero) mientras los estudiantes colaboran
class DocumentoYjs(db.Model):
    __tablename__ = "documentos_yjs"
    __table_args__ = (db.UniqueConstraint("tipo", "id_proyecto"),)

    # número único de registro del documento colaborativo
    id = db.Column(db.Integer, primary_key=True)
    # tipo de documento colaborativo (pizarra de notas, presentación o tablero de tareas)
    tipo = db.Column(db.String(20), nullable=False)
    # número del proyecto escolar al que pertenece este documento en vivo
    id_proyecto = db.Column(db.Integer, db.ForeignKey("proyectos.id"), nullable=False)
    # estado grabado en binario puro con todos los cambios que se transmiten entre los navegadores de los alumnos
    estado = db.Column(db.LargeBinary, nullable=True)
    # fecha y hora del último trazo o cambio realizado por cualquier compañero
    actualizado_en = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc),
                               onupdate=lambda: datetime.now(timezone.utc))

