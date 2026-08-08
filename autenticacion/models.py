# este archivo define la plantilla de información para guardar la cuenta de cada
# alumno registrado. su propósito es indicar qué información se necesita
# almacenar de cada usuario (nombre, correo, clave encriptada, avatar y grado
# escolar). lo hace creando la plantilla del usuario en la base de datos e
# incluyendo funciones para convertir la contraseña en un código secreto
# seguro. se diseñó de esta manera para garantizar que cada estudiante tenga
# una cuenta propia y protegida.


# importamos las funciones para manejar fechas y horas de registro
from datetime import datetime, timezone



# importamos las funciones que ayudan a controlar quién está conectado en el sitio web
from flask_login import UserMixin

# importamos la conexión a la base de datos y la función de seguridad para contraseñas
from extensiones import db, bcrypt, administrador_sesion


# plantilla que define qué información se guarda de cada alumno registrado en vura
class Usuario(UserMixin, db.Model):
    __tablename__ = "usuarios"

    # número único que identifica a cada estudiante para evitar confusiones de cuentas
    id = db.Column(db.Integer, primary_key=True)
    # correo del alumno para ingresar al sistema, debe ser único para que dos alumnos no usen el mismo
    correo = db.Column(db.String(120), unique=True, nullable=False)
    # la contraseña guardada como un código secreto indescifrable para proteger la cuenta
    contrasena_hash = db.Column(db.String(128), nullable=False)
    # nombre completo del estudiante
    nombre = db.Column(db.String(80), nullable=False)
    # foto o avatar seleccionado por el estudiante para su perfil
    avatar = db.Column(db.String(200), nullable=True)
    # grado y sección del colegio al que pertenece el estudiante (ej. 8vo D)
    grado = db.Column(db.String(40), nullable=True)
    # pequeña descripción o biografía ingresada por el estudiante
    descripcion = db.Column(db.String(300), nullable=True)
    # guarda automáticamente la fecha y hora exacta en la que se creó la cuenta
    creado_en = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    # toma la contraseña escrita por el alumno y la transforma en un código secreto indescifrable
    def establecer_contrasena(self, contrasena):
        self.contrasena_hash = bcrypt.generate_password_hash(contrasena).decode("utf-8")

    # compara la clave ingresada al intentar entrar con el código secreto guardado para ver si coincide
    def verificar_contrasena(self, contrasena):
        return bcrypt.check_password_hash(self.contrasena_hash, contrasena)


# busca y entrega los datos del estudiante según su número de usuario mientras navega por la página
@administrador_sesion.user_loader
def cargar_usuario(id_usuario):
    return db.session.get(Usuario, int(id_usuario))

