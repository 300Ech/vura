# Vura — Código

Plataforma educativa colaborativa. Ver `../ARQUITECTURA.md` y `../GUIA_IMPLEMENTACION.md`.

## Cómo correr el proyecto

```bash
cd codigo
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python app.py
```

La aplicación crea automáticamente las tablas de la base de datos que falten la primera vez que arranca, usando `db.create_all()` de SQLAlchemy.

Abrir http://127.0.0.1:5000

## Estado de las etapas

- [x] 1. Autenticación (registro, inicio de sesión, perfil)
- [x] 2. Equipos (crear, código de invitación, unirse, miembros)
- [x] 3. Proyectos (crear, listar por equipo, detalle)
- [x] 4. Tareas (tablero, crear, asignar, cambiar estado)
- [x] 5. Chat (tiempo real por equipo, historial)
- [x] 6. Notas (texto enriquecido con Quill, autoguardado)
- [x] 7. Presentaciones (editor de diapositivas con Fabric.js)
- [x] 8. Colaboración (Yjs: notas y presentación en tiempo real)
- [x] 9. Offline (Service Worker, Dexie/IndexedDB, resincronización automática)
- [x] 10. Exportación (PDF con ReportLab, PowerPoint con python-pptx)
