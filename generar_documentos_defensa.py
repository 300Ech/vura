# Script para generar los dos PDFs de apoyo para la defensa del proyecto Vura:
# 1. Glosario_de_Terminos_Vura.pdf (Sencillo y amigable)
# 2. Historia_y_Desarrollo_Vura.pdf (Narración extensa del Grupo 9 CCA con la desglose y explicación interactiva archivo por archivo de cada módulo)

import sys
import shutil
import os
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable, PageBreak, KeepTogether
)
from reportlab.pdfgen import canvas

class NumberedCanvas(canvas.Canvas):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_number(num_pages)
            canvas.Canvas.showPage(self)
        canvas.Canvas.save(self)

    def draw_page_number(self, page_count):
        self.saveState()
        self.setFont("Helvetica", 8.5)
        self.setFillColor(colors.HexColor("#64748b"))
        # Header (pages > 1)
        if self._pageNumber > 1:
            self.drawString(2.0 * cm, 26.5 * cm, "Vura — Bitácora Completa de Desarrollo — Grupo 9 (II Bimestre 2026)")
            self.setStrokeColor(colors.HexColor("#cbd5e1"))
            self.setLineWidth(0.5)
            self.line(2.0 * cm, 26.2 * cm, 19.5 * cm, 26.2 * cm)
        # Footer
        page_text = f"Página {self._pageNumber} de {page_count}"
        self.drawRightString(19.5 * cm, 1.2 * cm, page_text)
        self.drawString(2.0 * cm, 1.2 * cm, "Colegio Centro América — II Feria Tecnológica")
        self.setStrokeColor(colors.HexColor("#cbd5e1"))
        self.setLineWidth(0.5)
        self.line(2.0 * cm, 1.6 * cm, 19.5 * cm, 1.6 * cm)
        self.restoreState()

def crear_estilos():
    styles = getSampleStyleSheet()
    
    COLOR_PRIMARY = colors.HexColor("#1e293b")   # Slate 800
    COLOR_SECONDARY = colors.HexColor("#2563eb") # Blue 600
    COLOR_CATEGORY = colors.HexColor("#0f172a")  # Slate 900
    COLOR_TEXT = colors.HexColor("#334155")      # Slate 700
    
    title_style = ParagraphStyle(
        "DocTitle",
        parent=styles["Title"],
        fontName="Helvetica-Bold",
        fontSize=18,
        leading=22,
        textColor=COLOR_PRIMARY,
        alignment=0,
        spaceAfter=4
    )
    
    subtitle_style = ParagraphStyle(
        "DocSubtitle",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=9.5,
        leading=13.5,
        textColor=colors.HexColor("#64748b"),
        spaceAfter=12
    )

    cat_style = ParagraphStyle(
        "CategoryTitle",
        fontName="Helvetica-Bold",
        fontSize=11.5,
        leading=14.5,
        textColor=COLOR_CATEGORY,
        spaceBefore=14,
        spaceAfter=6,
        keepWithNext=True
    )
    
    h1_style = ParagraphStyle(
        "Heading1_Custom",
        parent=styles["Heading1"],
        fontName="Helvetica-Bold",
        fontSize=11.5,
        leading=14.5,
        textColor=COLOR_PRIMARY,
        spaceBefore=14,
        spaceAfter=6,
        keepWithNext=True
    )

    term_title_style = ParagraphStyle(
        "TermTitle",
        fontName="Helvetica-Bold",
        fontSize=10,
        leading=13,
        textColor=COLOR_SECONDARY,
        spaceAfter=2,
        keepWithNext=True
    )
    
    body_style = ParagraphStyle(
        "Body_Custom",
        parent=styles["BodyText"],
        fontName="Helvetica",
        fontSize=9,
        leading=13,
        textColor=COLOR_TEXT,
        spaceAfter=6
    )

    story_p_style = ParagraphStyle(
        "StoryParagraph",
        fontName="Helvetica",
        fontSize=9.2,
        leading=13.8,
        textColor=colors.HexColor("#334155"),
        spaceAfter=7
    )

    cmd_box_style = ParagraphStyle(
        "CmdBox",
        fontName="Courier-Bold",
        fontSize=8.5,
        leading=12,
        textColor=colors.HexColor("#0f172a"),
        backColor=colors.HexColor("#f1f5f9"),
        borderColor=colors.HexColor("#cbd5e1"),
        borderWidth=0.5,
        borderPadding=6,
        spaceAfter=7
    )

    return {
        "title": title_style,
        "subtitle": subtitle_style,
        "cat": cat_style,
        "h1": h1_style,
        "term_title": term_title_style,
        "body": body_style,
        "story_p": story_p_style,
        "cmd_box": cmd_box_style
    }

def generar_glosario():
    filename = "Glosario_de_Terminos_Vura.pdf"
    doc = SimpleDocTemplate(
        filename,
        pagesize=letter,
        leftMargin=2.0 * cm,
        rightMargin=2.0 * cm,
        topMargin=2.5 * cm,
        bottomMargin=2.2 * cm
    )
    
    st = crear_estilos()
    story = []
    
    story.append(Paragraph("Glosario de Términos del Proyecto Vura — Grupo 9", st["title"]))
    story.append(Paragraph("Compendio de conceptos y herramientas alineado con el Informe de la II Feria Tecnológica del Colegio Centro América.", st["subtitle"]))
    story.append(HRFlowable(width="100%", thickness=1.5, color=colors.HexColor("#1e293b"), spaceAfter=12))
    
    categorias = [
        ("1. Conceptos Fundamentales del Proyecto (Colegio CCA)", [
            ("Trabajo en Equipo",
             "Labores compartidas y organizadas donde cada estudiante asume una parte y todos tienen el mismo objetivo común. Se basa en el compañerismo y facilita resolver problemas complejos integrando diversas perspectivas (Editorial Etecé, 2020)."),
            ("Sitio Web y Página Web",
             "Conjunto de páginas interconectadas accesibles por internet. Se componen de Encabezado (identificación visual), Contenido (información, texto, audios e imágenes) y Pie de página (aspectos de navegación) (Editorial Etecé, 2025)."),
            ("Lenguaje de Programación",
             "Programa destinado a la construcción de otros programas informáticos mediante símbolos y reglas lógicas que organizan los procesos en el ordenador (Editorial Etecé, 2025)."),
            ("Python",
             "Lenguaje de programación de código abierto, de alto nivel y propósito general, reconocido por su sintaxis sencilla y legible similar al lenguaje humano. Permite escribir código limpio con menos líneas.")
        ]),

        ("2. Tecnologías de Tiempo Real y Comunicación Gráfica", [
            ("WebRTC (Web Real-Time Communication)",
             "Tecnología de código abierto y estándar web que facilita la comunicación a distancia en tiempo real con audio, video y datos directamente entre navegadores, sin necesidad de instalar programas adicionales."),
            ("Socket.IO",
             "Biblioteca de JavaScript que proporciona comunicación bidireccional en tiempo real basada en eventos entre el servidor y los clientes, simplificando las conexiones para transmitir chat y avisos al instante (Patil, 2024)."),
            ("Antecedentes y Diseño Adaptable (CSS / Canva)",
             "En el estudio de antecedentes de plataformas como Canva, se destaca el uso de reglas de diseño visual y hojas de estilo (CSS) para mantener un diseño ordenado que se adapta a cualquier tamaño de pantalla de forma limpia.")
        ]),

        ("3. Gestión de Tareas, Modo Offline y Seguridad", [
            ("Gestión de Tareas Centralizada",
             "Sistema de distribución equitativa de responsabilidades en tres columnas (Pendiente, En progreso, Terminada) para evitar atrasos, discusiones y sobrecarga de estrés entre los compañeros del grupo."),
            ("IndexedDB",
             "Base de datos de almacenamiento interno integrada por defecto dentro del navegador del estudiante. Funciona como un disco duro privado que guarda permanentemente borradores, tareas y dibujos en la computadora para poder trabajar aunque no haya internet."),
            ("PWA (Aplicación Web Progresiva)",
             "Tecnología que permite instalar la página web directamente en la computadora o teléfono con un ícono de acceso directo, abriéndola en su propia ventana independiente para trabajar incluso sin red."),
            ("Service Worker y Dexie.js",
             "Service Worker es el asistente invisible que memoriza y carga las páginas sin red; Dexie.js es la herramienta que facilita escribir y leer en IndexedDB con comandos simples de una línea.")
        ])
    ]

    for cat_name, lista_terms in categorias:
        story.append(Paragraph(cat_name, st["cat"]))
        story.append(HRFlowable(width="100%", thickness=0.8, color=colors.HexColor("#cbd5e1"), spaceAfter=8))
        
        for titulo, desc in lista_terms:
            bloque = []
            bloque.append(Paragraph(titulo, st["term_title"]))
            bloque.append(Paragraph(desc, st["body"]))
            bloque.append(Spacer(1, 3))
            story.append(KeepTogether(bloque))
            
        story.append(Spacer(1, 6))

    doc.build(story, canvasmaker=NumberedCanvas)
    print("PDF Glosario Grupo 9 generado con éxito:", filename)

def generar_historia():
    filename = "Historia_y_Desarrollo_Vura.pdf"
    doc = SimpleDocTemplate(
        filename,
        pagesize=letter,
        leftMargin=2.0 * cm,
        rightMargin=2.0 * cm,
        topMargin=2.5 * cm,
        bottomMargin=2.2 * cm
    )
    
    st = crear_estilos()
    story = []
    
    story.append(Paragraph("Historia y Bitácora Completa de Desarrollo — Grupo 9", st["title"]))
    story.append(Paragraph("Relato testimonial, comandos de terminal, herramientas y deslose de archivos alineado con el Informe del Colegio Centro América (II Bimestre 2026).", st["subtitle"]))
    story.append(HRFlowable(width="100%", thickness=1.5, color=colors.HexColor("#1e293b"), spaceAfter=14))

    capitulos = [
        ("Capítulo 1: La Problemática en el Colegio CCA, la Filosofía de Vura y el Entorno de Trabajo",
         "Durante las clases en el Colegio Centro América (CCA), los integrantes del Grupo 9 identificamos una problemática constante: al armar grupos de trabajo para evaluaciones escolares, muchos equipos no lograban ponerse de acuerdo. Los mensajes importantes se perdían entre conversaciones de WhatsApp, las carpetas compartidas a veces sufrían borrados accidentales de archivos y las notas anotadas en papel terminaban extraviándose. Además, cuando el internet del colegio fallaba, el trabajo se detenía y los grupos terminaban estresados o con bajas notas.\n\n"
         "Para la II Feria Tecnológica (II Bimestre 2026) nos reunimos a proponer ideas y elegimos construir **Vura**: un sitio web de colaboración escolar orientado a la organización y al diseño gráfico. Adoptamos una filosofía clara desde el inicio: *Vura es una plataforma de integración, no una reimplementación*. No pretendíamos reconstruir Canva, Google Docs ni Slack desde cero, sino integrar herramientas de código abierto libres, maduras y especializadas en una sola experiencia sencilla e intuitiva.\n\n"
         "Para arrancar el desarrollo, primero instalamos y configuramos el entorno de trabajo en nuestras computadoras:\n"
         "• **Python**: Lenguaje principal descargado desde python.org por su sintaxis clara y legible.\n"
         "• **Visual Studio Code**: Nuestro editor de código gratuito (code.visualstudio.com).\n"
         "• **Navegador Web**: Chrome y Edge para probar la página en `http://127.0.0.1:5000`.\n\n"
         "En la pantalla de comandos de la terminal ejecutamos los siguientes pasos exactos:\n\n"
         "1. Entramos a la carpeta del código del proyecto:\n"
         "`cd vura/codigo`\n\n"
         "2. Creamos el entorno virtual de pruebas `.venv` para aislar las librerías:\n"
         "`python3 -m venv .venv`\n\n"
         "3. Encendimos el entorno e instalamos los requerimientos:\n"
         "`source .venv/bin/activate && pip install -r requirements.txt`\n\n"
         "4. Creamos `app.py` (servidor principal), `config.py` (configuración) y `extensiones.py` (herramientas secundarias).\n\n"
         "5. Encendimos el servidor de la aplicación:\n"
         "`python app.py`\n\n"
         "Abrimos la dirección `http://127.0.0.1:5000` en el navegador y celebramos emocionados al ver aparecer la pantalla de bienvenida de Vura."),

        ("Capítulo 2: Registro de Cuentas y Seguridad de Usuarios (Módulo autenticacion/)",
         "Fijamos con claridad nuestros objetivos en el informe escolar: prototipo en Python, comunicación rápida sobre tareas pendientes y trabajo colaborativo sin estrés.\n\n"
         "Para construir el módulo de cuentas creamos la carpeta `autenticacion/` con cuatro archivos específicos:\n"
         "• **`models.py`**: El archivo que define la estructura del usuario en la base de datos (nombre, correo, contraseña cifrada, grado y foto de avatar).\n"
         "• **`forms.py`**: El archivo que construye los formularios y casillas donde los alumnos escriben sus datos.\n"
         "• **`routes.py`**: Las funciones de navegación que procesan las peticiones para registrarse, iniciar sesión o cerrar cuenta.\n"
         "• **`registro.html` y `login.html`**: Las páginas con las que el estudiante interactúa directamente en el navegador para crear su cuenta o iniciar sesión.\n\n"
         "Siguiendo el consejo de un profesor de no guardar claves en texto claro, integramos la librería **Flask-Login** para gestionar la sesión activa del alumno e **Flask-Bcrypt** para encriptar las contraseñas en códigos indescifrables antes de guardarlas en la base de datos `vura.db`.\n\n"
         "Para comprobar que las cuentas estaban protegidas, descargamos la herramienta gratuita **DB Browser for SQLite** (sqlitebrowser.org). Abrimos el archivo `vura.db` e inspeccionamos la tabla de usuarios, verificando que la clave ingresada (por ejemplo '123456') se convirtió en un hash indescifrable como `$2b$12$e8x...`, garantizando la seguridad total de las cuentas."),

        ("Capítulo 3: Creación de Equipos y Códigos de Invitación (Módulo equipos/)",
         "Queríamos que los alumnos armaran sus equipos escolarmente sin que personas extrañas se metieran a sus proyectos. Para montar este módulo creamos la carpeta `equipos/` con sus archivos específicos:\n"
         "• **`models.py`**: Define la estructura del equipo, el integrante líder y la lista de miembros.\n"
         "• **`forms.py`**: Formularios para nombrar el equipo o ingresar el código de invitación.\n"
         "• **`routes.py`**: Genera el código único de acceso (ej. `VURA-8FK2`) y administra la reasignación automática de líder.\n"
         "• **`detalle.html`, `crear.html` y `unirse.html`**: Las páginas interactivas con las que el equipo interactúa para consultar miembros o unirse a un grupo.\n\n"
         "Se nos ocurrió inspirarnos en los pases de acceso cortos de los videojuegos en línea. Programamos una función que genera automáticamente un código aleatorio de 8 caracteres (como `VURA-8FK2`). El líder crea el grupo y comparte la clave corta para que sus compañeros se unan con un solo clic.\n\n"
         "Durante las pruebas resolvimos un problema feo: si el líder abandonaba el equipo, la página daba error. Programamos una regla en `routes.py` para que, si el líder se sale, el mando se le entregue automáticamente al integrante que lleva más tiempo en el grupo, y si el equipo queda vacío, el registro se elimina automáticamente."),

        ("Capítulo 4: Registro de Proyectos Escolares Vinculados (Módulo proyectos/)",
         "Para que los alumnos puedan organizar distintas asignaturas (por ejemplo, 'Feria Tecnológica' o 'Proyecto de Ciencias'), creamos la carpeta `proyectos/` con sus archivos específicos:\n"
         "• **`models.py`**: Guarda el título del proyecto escolar, su descripción y la fecha de entrega.\n"
         "• **`forms.py`**: Formulario de registro de trabajos nuevos.\n"
         "• **`routes.py`**: Conecta el proyecto con su equipo correspondiente para restringir el acceso privado.\n"
         "• **`detalle.html` y `crear.html`**: Las páginas interactivas donde el grupo consulta las herramientas del proyecto.\n\n"
         "Conectamos cada proyecto directamente con su equipo correspondiente. Esto asegura que al hacer clic en un proyecto, solo los integrantes autorizados tengan acceso privado a la lista de tareas, las notas compartidas, la pizarra, el chat y las opciones de descarga."),

        ("Capítulo 5: El Tablero de Tareas Centralizado (Módulo tareas/)",
         "Inspirándonos en los murales escolares y pizarras de avisos que usamos en las aulas de clase para pegar recordatorios, construimos la gestión de tareas centralizada en la carpeta `tareas/` con sus archivos específicos:\n"
         "• **`models.py`**: Define las tarjetas de tareas, los comentarios de dudas y los archivos adjuntos.\n"
         "• **`forms.py`**: Formularios para crear tareas y adjuntar entregables en PDF o fotos.\n"
         "• **`routes.py`**: Administra el cambio de estado de las tareas entre las 3 columnas (*Pendiente*, *En progreso*, *Terminada*).\n"
         "• **`static/tareas.js`**: El script que permite interactuar y arrastrar las tarjetas con el ratón de una columna a otra.\n"
         "• **`tablero.html`**: La página interactiva principal donde el estudiante organiza las tarjetas del tablero.\n\n"
         "Hicimos pruebas creando una tarea de ejemplo ('Preparar lámina de exposición'), asignándola a un compañero con fecha de entrega y adjuntando una entrega en PDF. Vimos que al mover la tarjeta, el estado se actualizaba al instante en la pantalla y en la base de datos, evitando que nadie dijera 'a mí no me tocaba eso'."),

        ("Capítulo 6: Chat Grupal en Tiempo Real y Videollamadas sin Plugins (Módulo chat/)",
         "Para la comunicación rápida construimos la carpeta `chat/` con sus archivos específicos:\n"
         "• **`models.py`**: Guarda los mensajes de texto, las reacciones emoji y los audios grabados.\n"
         "• **`routes.py`**: Controla las salas privadas de comunicación por equipo.\n"
         "• **`static/chat.js`**: El script cliente que recibe los mensajes instantáneos y los muestra en pantalla sin recargar.\n"
         "• **`static/llamada.js`**: El script que gestiona la transmisión de voz y video para llamadas grupales.\n"
         "• **`sala.html` y `llamada.html`**: Las páginas interactivas donde los alumnos leen los mensajes o realizan la videollamada.\n\n"
         "Tal como lo establecimos en la investigación de nuestro informe escolar, seleccionamos la herramienta **Flask-SocketIO** (en el servidor Python) y `socket.io.js` (en el navegador) para gestionar la comunicación basada en eventos, creando una sala virtual privada por equipo donde los mensajes aparecen al instante en pantalla.\n\n"
         "En `notificaciones.js` agregamos avisos flotantes emergentes cuando alguien escribe o hace cambios. Además, investigamos la grabadora de voz (`MediaRecorder API`) para enviar audios cortos explicativos.\n\n"
         "Para las reuniones a distancia integramos la tecnología **WebRTC** (la API nativa integrada en los navegadores web). WebRTC nos permite realizar llamadas de voz y video conectando directamente las computadoras de los alumnos entre sí. El equipo fijó intencionalmente el límite en máximo 6 participantes para cuidar la velocidad de las computadoras y evitar que se pongan lentas o se sobrecaliente el procesador al mostrar muchas cámaras al mismo tiempo."),

        ("Capítulo 7: La Odisea de la Pizarra y Diapositivas (Módulos notas/ y presentaciones/)",
         "Al investigar antecedentes para el diseño del sitio, estudiamos la forma en que páginas modernas de diseño usan reglas de diseño visual y hojas de estilo (CSS) para que las pantallas se adapten limpiamente al tamaño de cualquier computadora o teléfono. A partir de esto, construimos nuestros editores visuales en las carpetas `notas/` y `presentaciones/` con sus archivos específicos:\n"
         "• **`notas/models.py`**: Guarda los trazos y figuras dibujadas en la base de datos.\n"
         "• **`notas/routes.py`**: Carga el lienzo de dibujo interactivo.\n"
         "• **`notas/static/notas.js`**: El script de Fabric.js para pintar trazos libremente, crear notas post-it amarillas y mover figuras.\n"
         "• **`presentaciones/models.py`**: Guarda la secuencia ordenada de diapositivas (1, 2, 3...) y sus notas de apoyo.\n"
         "• **`presentaciones/routes.py`**: Carga la vista del editor de láminas.\n"
         "• **`presentaciones/static/presentaciones.js`**: El editor de láminas en formato estándar de exposición (960x540px).\n"
         "• **`presentaciones/static/plantillas.js`**: Los temas visuales de color (Papel Claro, Noche Oscura, Neón Vibrante).\n"
         "• **`presentaciones/templates/editor.html`**: La página interactiva donde los estudiantes diseñan las láminas y escriben los apuntes del expositor.\n\n"
         "Integramos **Quill.js** para el texto enriquecido y el sincronizador inteligente **Yjs** para coordinar la edición simultánea entre varios alumnos, garantizando que dos personas puedan escribir o mover objetos a la vez sin borrarse el trabajo.\n\n"
         "Con ayuda de un tutor/programador en `notas.js` ajustamos el espacio interno entre el texto y el borde del papel amarillo para que el cuadro de color crezca automáticamente según el texto, agregando bordes oscuros, sombras flotantes e inclinación aleatoria al soltar el ratón."),

        ("Capítulo 8: Funcionamiento Sin Conexión Explicado a Detalle (Módulo colaboracion/ y static/)",
         "Para responder a las complicaciones de conexión a internet en el colegio, implementamos un sistema sin conexión transparente que permite a los estudiantes registrar sus avances sin estar conectados a la red.\n\n"
         "Explicamos los archivos y piezas que hacen posible trabajar offline sin perder ningún dato:\n\n"
         "1. **`static/sw.js` (Service Worker)**: Es un asistente invisible que corre en segundo plano dentro del navegador. Su trabajo es memorizar y guardar copias de las páginas web, botones e imágenes en la memoria caché para que la aplicación cargue de inmediato aunque no haya señal de internet.\n\n"
         "2. **IndexedDB (La Libreta Secreta del Navegador)**: Es una base de datos interna integrada por defecto en el propio navegador web (Chrome, Edge, Firefox). Funciona como un disco duro privado dentro del navegador que guarda archivos completos, borradores de tareas y notas en la computadora del alumno de forma permanente, sin borrarse al cerrar la pestaña.\n\n"
         "3. **`colaboracion/static/almacen_local.js` (Dexie.js)**: Es la herramienta que nos permite consultar y escribir en la libreta IndexedDB de manera muy sencilla mediante comandos legibles de una sola línea, sin tener que lidiar con código complejo.\n\n"
         "4. **`colaboracion/static/colaboracion.js` (Yjs)**: Es el organizador colaborativo que trabaja siempre sobre el documento local. Cuando el alumno escribe sin internet, Yjs guarda los cambios inmediatamente en IndexedDB mediante Dexie.js. En cuanto el navegador detecta que regresó la señal de red, Yjs **intercambia y fusiona automáticamente las diferencias** con la computadora del compañero y el servidor central, sin que nadie pierda una sola palabra ni tenga que presionar botones manuales de guardar.\n\n"
         "**Demostración en la Feria**: La prueba consiste en poner a dos alumnos a escribir en la misma nota compartida, apagar el WiFi de una laptop frente a los evaluadores, continuar escribiendo sin red, reconectar el WiFi y observar cómo Yjs fusiona automáticamente todo el texto sin perder una sola letra."),

        ("Capítulo 9: Exportación e Informes de Entrega (Módulo exportacion/)",
         "En la carpeta `exportacion/` creamos su archivo específico **`routes.py`**, donde integramos las herramientas de descarga final para cumplir con la entrega escolar:\n"
         "• **ReportLab**: Convierte las notas y el resumen del proyecto en un documento PDF impreso listo para entregar al docente en formato de hoja carta.\n"
         "• **python-pptx**: Lee las láminas diseñadas en la web y las convierte en una presentación real de PowerPoint (`.pptx`) descargable para proyectar en el aula.")
    ]

    for titulo_cap, relato in capitulos:
        story.append(Paragraph(titulo_cap, st["h1"]))
        sub_paras = relato.split("\n\n")
        for sp in sub_paras:
            if sp.startswith("`") or sp.startswith("1.") or sp.startswith("2.") or sp.startswith("3.") or sp.startswith("4.") or sp.startswith("5.") or sp.startswith("6."):
                story.append(Paragraph(sp, st["cmd_box"]))
            else:
                story.append(Paragraph(sp, st["story_p"]))
        story.append(Spacer(1, 4))

    doc.build(story, canvasmaker=NumberedCanvas)
    print("PDF Historia Maestra con Archivos Grupo 9 generado con éxito:", filename)

if __name__ == "__main__":
    generar_glosario()
    generar_historia()
