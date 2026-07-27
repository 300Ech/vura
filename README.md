# Vura — Código

Plataforma educativa colaborativa. Ver `../ARQUITECTURA.md` y `../GUIA_IMPLEMENTACION.md`.

## Cómo correr el proyecto

```bash
cd codigo
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Crear la base de datos (solo la primera vez)
flask db upgrade

# Iniciar el servidor
python app.py
```

Abrir http://127.0.0.1:5000

## Estado de las etapas

- [x] 1. Autenticación (registro, inicio de sesión, perfil)
- [ ] 2. Equipos
- [ ] 3. Proyectos
- [ ] 4. Tareas
- [ ] 5. Chat
- [ ] 6. Notas
- [ ] 7. Presentaciones
- [ ] 8. Colaboración
- [ ] 9. Offline
- [ ] 10. Exportación
