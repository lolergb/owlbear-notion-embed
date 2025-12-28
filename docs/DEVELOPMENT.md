# 🛠️ Guía de Desarrollo

Esta guía está dirigida a desarrolladores que quieren contribuir, hacer fork o desplegar su propia versión de la extensión.

## 📦 Estructura del Proyecto

```
owlbear-notion-embed/
├── manifest.json              # Configuración de la extensión
├── index.html                 # Interfaz de usuario
├── js/
│   └── index.js               # Lógica principal
├── css/
│   ├── app.css                # Estilos de la aplicación
│   └── notion-markdown.css    # Estilos para renderizar contenido
├── html/
│   └── image-viewer.html      # Visor de imágenes modal
├── img/                       # Iconos e imágenes
├── icon.svg                   # Icono de la extensión
├── netlify/
│   ├── functions/
│   │   ├── notion-api.js      # Netlify Function (proxy seguro)
│   │   └── get-debug-mode.js  # Función de modo debug
│   └── netlify.toml           # Configuración de Netlify
├── public/
│   └── default-config.json    # Configuración por defecto
├── package.json               # Configuración de Node.js
├── .gitignore                 # Archivos ignorados por Git
└── README.md                  # Documentación pública
```

## 🚀 Despliegue en Netlify

### Pasos básicos

1. **Fork/clona este repositorio**

2. **Crea una cuenta de Netlify** (gratis)

3. **Conecta tu repositorio:**
   - "Add new site" → "Import an existing project"
   - Conecta GitHub/GitLab → Selecciona este repo

4. **Despliegue automático:**
   - Netlify detectará y desplegará automáticamente
   - **No necesitas configurar token** - cada usuario configurará el suyo

5. **Comparte la URL:**
   - Ejemplo: `https://your-project.netlify.app/manifest.json`
   - Comparte esta URL con los usuarios
   - **Cada usuario configurará su propio token** desde la interfaz (botón 🔑)

### Token opcional del servidor

Si quieres que funcione sin que los usuarios configuren nada (páginas compartidas):

1. **En el Dashboard de Netlify:**
   - Settings → Environment variables
   - Agrega: `NOTION_API_TOKEN` = `your_notion_token`
   - Obtén el token: https://www.notion.so/my-integrations

2. **En Notion:**
   - Comparte tus páginas con la integración
   - Los usuarios verán estas páginas sin configurar nada

3. **Los usuarios pueden:**
   - Usar páginas compartidas (sin token)
   - O configurar su propio token (🔑) para sus páginas

## 🔧 Desarrollo Local

### Requisitos

- Servidor web estático (cualquiera funciona)
- Páginas de Notion configuradas como privadas (compartidas con integración) o públicas

### Configuración

1. **Servidor local:**
   ```bash
   npm run serve
   # o
   npx http-server -p 8000
   ```

2. **Usa en Owlbear:**
   - `http://localhost:8000/manifest.json`

3. **Configura tu token:**
   - Abre la extensión en Owlbear
   - Haz clic en el botón **🔑** (arriba a la derecha)
   - Pega tu token de Notion
   - ¡Listo! Ya puedes usar tus páginas

**Nota:** La configuración se gestiona completamente desde la interfaz. No necesitas archivos de configuración locales.

## 🧪 Probar que funciona

Para probar que la extensión funciona:

1. **Abre Owlbear Rodeo** y entra a una sala
2. **Abre la extensión** desde el menú de extensiones
3. **Configura tu token** haciendo clic en el botón **🔑**
4. **Agrega una página** desde la interfaz
5. **Haz clic en la página** para verificar que se carga correctamente

**Si hay errores:**
- **Token inválido:** Verifica que el token sea correcto (debe comenzar con `secret_` o `ntn_`)
- **Sin permisos:** Asegúrate de que la integración de Notion tenga acceso a la página
- **Página no encontrada:** Verifica que la URL sea correcta y que la página esté compartida con la integración

## 🔐 Seguridad

**Para Desarrolladores:**

- ✅ El token se almacena en Netlify (variables de entorno) - opcional
- ✅ El token NUNCA se expone al cliente (usa Netlify Functions como proxy)
- ✅ Los usuarios finales configuran su propio token desde la interfaz (botón 🔑)
- ✅ Los tokens de usuario se almacenan localmente en el navegador (localStorage)
- ✅ El token del servidor es opcional y solo se usa si el token de usuario no está configurado

**Para Usuarios:**

- ✅ No necesitas saber nada sobre tokens
- ✅ Solo usa la extensión normalmente
- ✅ Tu token se almacena localmente y nunca se envía al servidor (excepto a través de Netlify Functions seguras)

## 📚 SDK de Owlbear

Esta extensión usa el SDK oficial de Owlbear Rodeo:
- [Documentación](https://docs.owlbear.rodeo/)
- [Modal API](https://docs.owlbear.rodeo/extensions/apis/modal/)

## 📝 Notas de Desarrollo

- Las páginas de Notion pueden ser **privadas** (no necesitan ser públicas) si se comparten con la integración
- El modal se abre con un tamaño responsivo
- Puedes tener múltiples páginas configuradas
- La extensión es completamente privada si no la compartes públicamente
- **✅ Seguridad:** Los tokens se gestionan desde la interfaz y se almacenan localmente (localStorage)

## 🗺️ Roadmap / Próximos Pasos

### ✅ Implementado

- ✅ Texto, encabezados (H1, H2, H3)
- ✅ Listas (con viñetas, numeradas, to-do)
- ✅ Lista toggle y Encabezados toggle (H1, H2, H3)
- ✅ Imágenes (clicables, modal a tamaño completo)
- ✅ Tablas
- ✅ Columnas (2, 3, 4, 5 columnas)
- ✅ Código, Cita, Callout
- ✅ Divisor
- ✅ Gestión de páginas basada en carpetas
- ✅ Reordenamiento mover arriba/abajo
- ✅ Importar/Exportar configuración JSON
- ✅ Gestión de token de usuario (global)
- ✅ Configuración por sala
- ✅ Soporte de URL externa con selectores CSS
- ✅ Filtrado de tipos de bloques (`blockTypes`)
- ✅ Carpetas anidadas (profundidad ilimitada)
- ✅ Iconos automáticos de páginas
- ✅ Gestión de caché
- ✅ Modo debug (controlado por variable de entorno de Netlify)
- ✅ **Soporte multi-servicio de URLs** (Google Drive, Docs, Sheets, Slides, Dropbox, OneDrive, YouTube, Vimeo, Figma, PDFs)
- ✅ **Conversión automática de URLs** al formato embed
- ✅ **Iconos específicos de servicio** para cada servicio soportado
- ✅ **Funcionalidad colapsar/expandir todas las carpetas**
- ✅ **Panel de configuración** con interfaz de configuración unificada
- ✅ **Integración con tokens** vía menú contextual (vincular/ver/desvincular páginas)

### 🔜 Implementaciones Futuras

#### Base de datos anidada (Bases de datos anidadas)
- **Estado:** Pendiente
- **Complejidad:** Media-Alta
- **Descripción:** Renderizar bases de datos completas que están dentro de una página
- **Requisitos:**
  - Obtener estructura de base de datos
  - Renderizar filas y columnas
  - Soporte para diferentes tipos de propiedades (texto, número, fecha, etc.)
  - Paginación si hay muchas filas

#### Bloque de ecuación (Fórmulas matemáticas)
- **Estado:** Pendiente
- **Complejidad:** Media
- **Descripción:** Renderizar fórmulas matemáticas usando KaTeX o MathJax
- **Requisitos:**
  - Integrar biblioteca de renderizado matemático
  - Analizar formato LaTeX de Notion

#### Bloque sincronizado (Bloques sincronizados)
- **Estado:** Pendiente
- **Complejidad:** Media
- **Descripción:** Renderizar bloques que están sincronizados entre páginas
- **Requisitos:**
  - Detectar bloques sincronizados
  - Obtener contenido del bloque original

## 📊 Estadísticas del Proyecto

### ⏱️ Tiempo de Desarrollo
- **Fecha de inicio:** 19 de diciembre de 2025
- **Última actualización:** 27 de diciembre de 2025
- **Días de trabajo activo:** 8 días (19, 20, 21, 22, 24, 25, 26, 27 dic)
- **Total de commits:** 223 commits
- **Promedio de commits por día:** ~28 commits/día
- **Días más productivos:** 
  - 21 dic: 45 commits
  - 20 dic: 39 commits  
  - 24 dic: 37 commits
- **Horas más activas:** 20:00-21:00 (sesiones nocturnas intensas)

### 📈 Métricas del Código
- **Líneas de código:** ~7,045 líneas
- **Archivos principales:** 17 archivos
- **Lenguajes:** JavaScript (ES6+), HTML5, CSS3, JSON
- **Versión actual:** 2.0.1
- **Tamaño del proyecto:** ~500 KB (sin node_modules)

### 🎯 Alcance del Proyecto
- **Tipo:** Extensión para Owlbear Rodeo
- **Funcionalidad principal:** Integración de Notion y servicios externos
- **Servicios soportados:** 10+ servicios (Notion, Google Drive, Docs, Sheets, Slides, Dropbox, OneDrive, YouTube, Vimeo, Figma, PDFs)
- **Características implementadas:** 30+ funcionalidades principales
- **Bloques de Notion soportados:** 15+ tipos de bloques

### 🛠️ Tecnologías Utilizadas
- **Frontend:** Vanilla JavaScript (ES6+), HTML5, CSS3
- **Backend:** Netlify Functions (Node.js)
- **SDK:** Owlbear Rodeo SDK v3.1.0
- **APIs:** Notion API, servicios externos (Google, Dropbox, OneDrive, etc.)
- **Almacenamiento:** localStorage (configuración por sala)
- **Deployment:** Netlify
- **Control de versiones:** Git

## 🐛 Problemas Conocidos

Actualmente no hay errores críticos conocidos. Si encuentras algún problema, por favor repórtalo a través de GitHub Issues.

### Limitaciones Menores

- **Bases de datos anidadas:** Las bases de datos anidadas aún no están soportadas (ver Roadmap)
- **Bloques de ecuación:** Las fórmulas matemáticas aún no se renderizan (ver Roadmap)
- **Bloques sincronizados:** Los bloques sincronizados aún no están soportados (ver Roadmap)

## 🔓 Hacer pública una página de Notion

1. Abre tu página en Notion
2. Haz clic en "Share" (arriba a la derecha)
3. Habilita "Share to web"
4. Copia la URL pública
5. Pégala en la configuración de la extensión

