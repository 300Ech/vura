from datetime import datetime, timezone

from flask_login import UserMixin

from extensiones import db, bcrypt, administrador_sesion


class Usuario(UserMixin, db.Model):
    __tablename__ = "usuarios"

    id = db.Column(db.Integer, primary_key=True)
    correo = db.Column(db.String(120), unique=True, nullable=False)
    contrasena_hash = db.Column(db.String(128), nullable=False)
    nombre = db.Column(db.String(80), nullable=False)
    avatar = db.Column(db.String(200), nullable=True)
    grado = db.Column(db.String(40), nullable=True)
    descripcion = db.Column(db.String(300), nullable=True)
    creado_en = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    def establecer_contrasena(self, contrasena):
        self.contrasena_hash = bcrypt.generate_password_hash(contrasena).decode("utf-8")

    def verificar_contrasena(self, contrasena):
        return bcrypt.check_password_hash(self.contrasena_hash, contrasena)


@administrador_sesion.user_loader
def cargar_usuario(id_usuario):
    return db.session.get(Usuario, int(id_usuario))
