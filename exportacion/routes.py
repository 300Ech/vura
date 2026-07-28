import io
import json
import re
from xml.sax.saxutils import escape

from flask import Blueprint, send_file, abort
from flask_login import login_required, current_user

from extensiones import db
from proyectos.models import Proyecto
from tareas.models import TITULOS_ESTADO

from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer

from pptx import Presentation as ArchivoPptx
from pptx.util import Emu, Pt
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE

exportacion = Blueprint("exportacion", __name__)

EMU_POR_PIXEL = 9525  # medida estándar de PowerPoint
ANCHO_LIENZO = 960
ALTO_LIENZO = 540


def obtener_proyecto_de_miembro(id_proyecto):
    proyecto = db.get_or_404(Proyecto, id_proyecto)
    if not proyecto.equipo.es_miembro(current_user):
        abort(403)
    return proyecto


def nombre_de_archivo(texto, extension):
    limpio = re.sub(r"[^\w\s-]", "", texto).strip().replace(" ", "_") or "vura"
    return f"{limpio}.{extension}"


# ---- PDF: resumen del proyecto y notas (ReportLab) ----

def parrafos_desde_delta(delta_json, estilos):
    """Convierte el Delta de Quill en párrafos de ReportLab (texto y formato básico)."""
    try:
        operaciones = json.loads(delta_json).get("ops", [])
    except (ValueError, AttributeError):
        return []

    parrafos = []
    linea = ""
    for operacion in operaciones:
        texto = operacion.get("insert")
        if not isinstance(texto, str):
            continue
        atributos = operacion.get("attributes") or {}
        partes = texto.split("\n")
        for posicion, parte in enumerate(partes):
            if parte:
                fragmento = escape(parte)
                if atributos.get("bold"):
                    fragmento = f"<b>{fragmento}</b>"
                if atributos.get("italic"):
                    fragmento = f"<i>{fragmento}</i>"
                linea += fragmento
            if posicion < len(partes) - 1:  # había un salto de línea
                estilo = estilos["Heading2"] if atributos.get("header") else estilos["BodyText"]
                parrafos.append(Paragraph(linea or " ", estilo))
                linea = ""
    if linea:
        parrafos.append(Paragraph(linea, estilos["BodyText"]))
    return parrafos


@exportacion.route("/proyectos/<int:id_proyecto>/exportar/pdf")
@login_required
def exportar_pdf(id_proyecto):
    proyecto = obtener_proyecto_de_miembro(id_proyecto)
    estilos = getSampleStyleSheet()

    contenido = [
        Paragraph(escape(proyecto.nombre), estilos["Title"]),
        Paragraph(f"Equipo: {escape(proyecto.equipo.nombre)}", estilos["Normal"]),
    ]
    if proyecto.fecha_entrega:
        contenido.append(Paragraph(
            f"Fecha de entrega: {proyecto.fecha_entrega.strftime('%d/%m/%Y')}", estilos["Normal"]))
    if proyecto.descripcion:
        contenido += [Spacer(1, 0.4 * cm), Paragraph(escape(proyecto.descripcion), estilos["BodyText"])]

    contenido += [Spacer(1, 0.6 * cm), Paragraph("Tareas", estilos["Heading1"])]
    if proyecto.tareas:
        for tarea in proyecto.tareas:
            detalles = [TITULOS_ESTADO[tarea.estado]]
            if tarea.asignado:
                detalles.append(tarea.asignado.nombre)
            if tarea.fecha_limite:
                detalles.append("entrega " + tarea.fecha_limite.strftime("%d/%m/%Y"))
            contenido.append(Paragraph(
                f"• <b>{escape(tarea.titulo)}</b> — {escape(', '.join(detalles))}", estilos["BodyText"]))
    else:
        contenido.append(Paragraph("Sin tareas registradas.", estilos["BodyText"]))

    contenido += [Spacer(1, 0.6 * cm), Paragraph("Notas", estilos["Heading1"])]
    parrafos_notas = parrafos_desde_delta(
        proyecto.nota.contenido_json if proyecto.nota else None, estilos)
    contenido += parrafos_notas or [Paragraph("Sin notas todavía.", estilos["BodyText"])]

    archivo = io.BytesIO()
    SimpleDocTemplate(archivo, pagesize=letter, title=proyecto.nombre).build(contenido)
    archivo.seek(0)

    return send_file(archivo, mimetype="application/pdf", as_attachment=True,
                     download_name=nombre_de_archivo(proyecto.nombre, "pdf"))


# ---- PowerPoint: la presentación del proyecto (python-pptx) ----

def color_desde_hex(texto):
    if isinstance(texto, str) and re.fullmatch(r"#[0-9a-fA-F]{6}", texto):
        return RGBColor.from_string(texto[1:])
    return RGBColor(0, 0, 0)


def agregar_objeto_fabric(diapositiva_pptx, objeto):
    """Traduce un objeto de Fabric.js (texto, rectángulo o círculo) a una forma de PowerPoint."""
    tipo = objeto.get("type", "")
    izquierda = Emu(int(objeto.get("left", 0) * EMU_POR_PIXEL))
    arriba = Emu(int(objeto.get("top", 0) * EMU_POR_PIXEL))
    escala_x = objeto.get("scaleX", 1)
    escala_y = objeto.get("scaleY", 1)

    if tipo in ("i-text", "textbox", "text"):
        ancho = Emu(int(max(objeto.get("width", 200), 10) * escala_x * EMU_POR_PIXEL))
        alto = Emu(int(max(objeto.get("height", 50), 10) * escala_y * EMU_POR_PIXEL))
        caja = diapositiva_pptx.shapes.add_textbox(izquierda, arriba, ancho, alto)
        parrafo = caja.text_frame.paragraphs[0]
        parrafo.text = objeto.get("text", "")
        parrafo.font.size = Pt(objeto.get("fontSize", 32) * escala_y * 0.75)  # px -> pt
        parrafo.font.color.rgb = color_desde_hex(objeto.get("fill"))
        return

    if tipo == "rect":
        forma = MSO_SHAPE.RECTANGLE
        ancho = Emu(int(objeto.get("width", 100) * escala_x * EMU_POR_PIXEL))
        alto = Emu(int(objeto.get("height", 100) * escala_y * EMU_POR_PIXEL))
    elif tipo == "circle":
        forma = MSO_SHAPE.OVAL
        diametro = objeto.get("radius", 50) * 2
        ancho = Emu(int(diametro * escala_x * EMU_POR_PIXEL))
        alto = Emu(int(diametro * escala_y * EMU_POR_PIXEL))
    else:
        return  # otros tipos (por ejemplo imágenes de internet) no se exportan

    figura = diapositiva_pptx.shapes.add_shape(forma, izquierda, arriba, ancho, alto)
    figura.fill.solid()
    figura.fill.fore_color.rgb = color_desde_hex(objeto.get("fill"))
    figura.line.fill.background()


@exportacion.route("/proyectos/<int:id_proyecto>/exportar/pptx")
@login_required
def exportar_pptx(id_proyecto):
    proyecto = obtener_proyecto_de_miembro(id_proyecto)
    if proyecto.presentacion is None:
        abort(404)

    archivo_pptx = ArchivoPptx()
    archivo_pptx.slide_width = Emu(ANCHO_LIENZO * EMU_POR_PIXEL)
    archivo_pptx.slide_height = Emu(ALTO_LIENZO * EMU_POR_PIXEL)
    diseno_vacio = archivo_pptx.slide_layouts[6]

    for diapositiva in proyecto.presentacion.diapositivas:
        diapositiva_pptx = archivo_pptx.slides.add_slide(diseno_vacio)
        if not diapositiva.contenido_json:
            continue
        try:
            objetos = json.loads(diapositiva.contenido_json).get("objects", [])
        except ValueError:
            continue
        for objeto in objetos:
            agregar_objeto_fabric(diapositiva_pptx, objeto)

    archivo = io.BytesIO()
    archivo_pptx.save(archivo)
    archivo.seek(0)

    return send_file(
        archivo,
        mimetype="application/vnd.openxmlformats-officedocument.presentationml.presentation",
        as_attachment=True,
        download_name=nombre_de_archivo(proyecto.nombre, "pptx"),
    )
