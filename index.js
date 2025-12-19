console.log('🚀 Iniciando carga de index.js...');

import OBR from "https://esm.sh/@owlbear-rodeo/sdk@3.1.0";

console.log('✅ OBR SDK importado');

// Importar configuración
// Si config.js no existe, copia config.example.js a config.js y completa los datos
import { 
  NOTION_API_BASE, 
  NOTION_PAGES 
} from "./config.js";

// Importar sistema de gestión de páginas
import {
  getPagesConfig,
  initializeDefaultPages,
  getAllPagesFlat
} from "./pages-manager.js";

// El token ya no se importa directamente - se usa Netlify Function como proxy en producción
// En desarrollo local, config.js puede tener el token, pero en producción no es necesario
// porque el token está seguro en el servidor (Netlify Function)

// Verificar que las páginas se cargaron correctamente
console.log('✅ Config.js cargado');
console.log('📄 Páginas importadas:', NOTION_PAGES?.length || 0);
if (NOTION_PAGES && NOTION_PAGES.length > 0) {
  console.log('📝 Nombres de páginas:', NOTION_PAGES.map(p => p.name));
  console.log('🔗 URLs:', NOTION_PAGES.map(p => p.url));
} else {
  console.warn('⚠️ No se encontraron páginas en config.js');
}

// Manejo de errores global para capturar problemas de carga
window.addEventListener('error', (event) => {
  console.error('Error global:', event.error);
  if (event.message && event.message.includes('fetch')) {
    console.error('Error de fetch detectado:', event.message);
  }
});

// Manejo de errores no capturados
window.addEventListener('unhandledrejection', (event) => {
  console.error('Promesa rechazada no manejada:', event.reason);
  if (event.reason && event.reason.message && event.reason.message.includes('fetch')) {
    console.error('Error de fetch en promesa rechazada:', event.reason);
  }
});

// Función para extraer el ID de página desde una URL de Notion
function extractNotionPageId(url) {
  try {
    // Formato: https://workspace.notion.site/Title-{32-char-id}?params
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('-');
    if (pathParts.length > 0) {
      const lastPart = pathParts[pathParts.length - 1];
      // El ID tiene 32 caracteres hexadecimales
      if (lastPart && lastPart.length >= 32) {
        const pageId = lastPart.substring(0, 32);
        // Convertir a formato UUID con guiones
        return `${pageId.substring(0, 8)}-${pageId.substring(8, 12)}-${pageId.substring(12, 16)}-${pageId.substring(16, 20)}-${pageId.substring(20, 32)}`;
      }
    }
    return null;
  } catch (e) {
    console.error('Error al extraer ID de Notion:', e);
    return null;
  }
}

// Función para obtener bloques de una página de Notion
async function fetchNotionBlocks(pageId) {
  try {
    // Usar Netlify Function como proxy para mantener el token seguro
    // Netlify Functions se exponen en /.netlify/functions/nombre-funcion
    const apiUrl = window.location.origin.includes('netlify.app') || window.location.origin.includes('netlify.com')
      ? `/.netlify/functions/notion-api?pageId=${encodeURIComponent(pageId)}`
      : `${NOTION_API_BASE}/blocks/${pageId}/children`;
    
    const headers = {
      'Content-Type': 'application/json'
    };
    
    // Solo agregar Authorization si no estamos usando el proxy (desarrollo local)
    // En producción, el token está en el servidor (Netlify Function)
    if (!apiUrl.includes('/.netlify/functions/')) {
      // Para desarrollo local, intentar obtener el token dinámicamente
      try {
        const config = await import("./config.js");
        const localToken = config.NOTION_API_TOKEN;
        if (!localToken || localToken === 'tu_token_de_notion_aqui') {
          throw new Error('El token de la API de Notion no está configurado. Edita config.js y agrega tu token para desarrollo local.');
        }
        headers['Authorization'] = `Bearer ${localToken}`;
        headers['Notion-Version'] = '2022-06-28';
      } catch (e) {
        throw new Error('No se pudo cargar el token. En desarrollo local, asegúrate de que config.js tenga NOTION_API_TOKEN configurado.');
      }
    } else {
      // En producción, el token está en el servidor (Netlify Function)
      console.log('✅ Usando Netlify Function como proxy (token seguro en servidor)');
    }
    
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: headers
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      
      if (response.status === 401) {
        throw new Error('Token inválido o sin permisos. Verifica que el token en config.js sea correcto y que la integración tenga acceso a esta página.');
      } else if (response.status === 404) {
        throw new Error('Página no encontrada. Verifica que la URL sea correcta y que la integración tenga acceso.');
      } else {
        throw new Error(`Error de API: ${response.status} - ${errorData.message || response.statusText}`);
      }
    }

    const data = await response.json();
    return data.results || [];
  } catch (error) {
    console.error('Error al obtener bloques de Notion:', error);
    throw error;
  }
}

// Función para renderizar texto con formato
function renderRichText(richTextArray) {
  if (!richTextArray || richTextArray.length === 0) return '';
  
  return richTextArray.map(text => {
    let content = text.plain_text || '';
    
    if (text.annotations) {
      if (text.annotations.bold) content = `<strong class="notion-text-bold">${content}</strong>`;
      if (text.annotations.italic) content = `<em class="notion-text-italic">${content}</em>`;
      if (text.annotations.underline) content = `<u class="notion-text-underline">${content}</u>`;
      if (text.annotations.strikethrough) content = `<s class="notion-text-strikethrough">${content}</s>`;
      if (text.annotations.code) content = `<code class="notion-text-code">${content}</code>`;
      
      if (text.href) {
        content = `<a href="${text.href}" class="notion-text-link" target="_blank" rel="noopener noreferrer">${content}</a>`;
      }
    }
    
    return content;
  }).join('');
}

// Función para renderizar un bloque individual
function renderBlock(block) {
  const type = block.type;
  
  switch (type) {
    case 'paragraph':
      const paragraphText = renderRichText(block.paragraph?.rich_text);
      return `<p class="notion-paragraph">${paragraphText || '<br>'}</p>`;
    
    case 'heading_1':
      return `<h1>${renderRichText(block.heading_1?.rich_text)}</h1>`;
    
    case 'heading_2':
      return `<h2>${renderRichText(block.heading_2?.rich_text)}</h2>`;
    
    case 'heading_3':
      return `<h3>${renderRichText(block.heading_3?.rich_text)}</h3>`;
    
    case 'bulleted_list_item':
      return `<li class="notion-bulleted-list-item">${renderRichText(block.bulleted_list_item?.rich_text)}</li>`;
    
    case 'numbered_list_item':
      return `<li class="notion-numbered-list-item">${renderRichText(block.numbered_list_item?.rich_text)}</li>`;
    
    case 'image':
      const image = block.image;
      const imageUrl = image?.external?.url || image?.file?.url;
      const caption = image?.caption ? renderRichText(image.caption) : '';
      
      if (imageUrl) {
        return `
          <div class="notion-image">
            <img src="${imageUrl}" alt="${caption || ''}" />
            ${caption ? `<div class="notion-image-caption">${caption}</div>` : ''}
          </div>
        `;
      }
      return '';
    
    case 'divider':
      return '<div class="notion-divider"></div>';
    
    case 'code':
      const codeText = renderRichText(block.code?.rich_text);
      const language = block.code?.language || '';
      return `<pre class="notion-code"><code>${codeText}</code></pre>`;
    
    case 'quote':
      return `<div class="notion-quote">${renderRichText(block.quote?.rich_text)}</div>`;
    
    case 'callout':
      const callout = block.callout;
      const icon = callout?.icon?.emoji || '💡';
      const calloutText = renderRichText(callout?.rich_text);
      return `
        <div class="notion-callout">
          <div class="notion-callout-icon">${icon}</div>
          <div class="notion-callout-content">${calloutText}</div>
        </div>
      `;
    
    case 'table':
      // Las tablas se renderizan de forma especial (ver renderBlocks)
      return '<div class="notion-table-container" data-table-id="' + block.id + '">Cargando tabla...</div>';
    
    case 'child_database':
      return '<div class="notion-database-placeholder">[Base de datos - Requiere implementación adicional]</div>';
    
    default:
      console.log('Tipo de bloque no soportado:', type, block);
      return '';
  }
}

// Función para renderizar todos los bloques
async function renderBlocks(blocks) {
  let html = '';
  let inList = false;
  let listType = null;
  let listItems = [];
  
  for (let index = 0; index < blocks.length; index++) {
    const block = blocks[index];
    const type = block.type;
    
    // Manejar listas agrupadas
    if (type === 'bulleted_list_item' || type === 'numbered_list_item') {
      const currentListType = type === 'bulleted_list_item' ? 'ul' : 'ol';
      
      if (!inList || listType !== currentListType) {
        // Cerrar lista anterior si existe
        if (inList && listItems.length > 0) {
          html += `<${listType === 'ul' ? 'ul' : 'ol'} class="notion-${listType === 'ul' ? 'bulleted' : 'numbered'}-list">${listItems.join('')}</${listType === 'ul' ? 'ul' : 'ol'}>`;
          listItems = [];
        }
        inList = true;
        listType = currentListType;
      }
      
      listItems.push(renderBlock(block));
    } else {
      // Cerrar lista si estábamos en una
      if (inList && listItems.length > 0) {
        html += `<${listType === 'ul' ? 'ul' : 'ol'} class="notion-${listType === 'ul' ? 'bulleted' : 'numbered'}-list">${listItems.join('')}</${listType === 'ul' ? 'ul' : 'ol'}>`;
        listItems = [];
        inList = false;
        listType = null;
      }
      
      // Manejar tablas de forma especial
      if (block.type === 'table') {
        try {
          const tableHtml = await renderTable(block);
          html += tableHtml;
        } catch (error) {
          console.error('Error al renderizar tabla:', error);
          html += '<div class="notion-table-placeholder">[Error al cargar tabla]</div>';
        }
      } else {
        html += renderBlock(block);
      }
    }
  }
  
  // Cerrar lista si queda abierta
  if (inList && listItems.length > 0) {
    html += `<${listType === 'ul' ? 'ul' : 'ol'} class="notion-${listType === 'ul' ? 'bulleted' : 'numbered'}-list">${listItems.join('')}</${listType === 'ul' ? 'ul' : 'ol'}>`;
  }
  
  return html;
}

// Función para renderizar una tabla completa
async function renderTable(tableBlock) {
  try {
    // Obtener las filas de la tabla
    const rows = await fetchNotionBlocks(tableBlock.id);
    
    if (!rows || rows.length === 0) {
      return '<div class="notion-table-placeholder">[Tabla vacía]</div>';
    }
    
    // Obtener el número de columnas de la primera fila
    const firstRow = rows[0];
    const columnCount = firstRow?.table_row?.cells?.length || 0;
    
    if (columnCount === 0) {
      return '<div class="notion-table-placeholder">[Tabla sin columnas]</div>';
    }
    
    let tableHtml = '<table class="notion-table">';
    
    // Renderizar cada fila
    rows.forEach((rowBlock, rowIndex) => {
      if (rowBlock.type === 'table_row') {
        const cells = rowBlock.table_row?.cells || [];
        tableHtml += '<tr>';
        
        // Renderizar cada celda
        for (let i = 0; i < columnCount; i++) {
          const cell = cells[i] || [];
          const cellContent = renderRichText(cell);
          // La primera fila suele ser el encabezado
          const isHeader = rowIndex === 0;
          const tag = isHeader ? 'th' : 'td';
          tableHtml += `<${tag}>${cellContent || '&nbsp;'}</${tag}>`;
        }
        
        tableHtml += '</tr>';
      }
    });
    
    tableHtml += '</table>';
    return tableHtml;
  } catch (error) {
    console.error('Error al renderizar tabla:', error);
    return '<div class="notion-table-placeholder">[Error al cargar tabla: ' + error.message + ']</div>';
  }
}

// Función para cargar y renderizar contenido de Notion desde la API
async function loadNotionContent(url, container) {
  const contentDiv = container.querySelector('#notion-content');
  const iframe = container.querySelector('#notion-iframe');
  
  if (!contentDiv) {
    console.error('No se encontró el contenedor de contenido');
    return;
  }
  
  // Mostrar loading
  contentDiv.innerHTML = '<div class="notion-loading">Cargando contenido...</div>';
  container.classList.add('show-content');
  
  try {
    // Extraer ID de la página
    const pageId = extractNotionPageId(url);
    if (!pageId) {
      throw new Error('No se pudo extraer el ID de la página desde la URL');
    }
    
    console.log('Obteniendo bloques para página:', pageId);
    
    // Obtener bloques
    const blocks = await fetchNotionBlocks(pageId);
    console.log('Bloques obtenidos:', blocks.length);
    
    if (blocks.length === 0) {
      contentDiv.innerHTML = '<div class="notion-loading">No se encontró contenido en esta página.</div>';
      return;
    }
    
    // Renderizar bloques (ahora es async)
    const html = await renderBlocks(blocks);
    contentDiv.innerHTML = html;
    
  } catch (error) {
    console.error('Error al cargar contenido de Notion:', error);
    contentDiv.innerHTML = `
      <div class="notion-error">
        <strong>Error al cargar el contenido:</strong><br>
        ${error.message}<br><br>
        <button onclick="window.open('${url}', '_blank')" style="
          background: #4a9eff;
          border: none;
          border-radius: 4px;
          padding: 8px 16px;
          color: #fff;
          cursor: pointer;
        ">Abrir en Notion</button>
      </div>
    `;
  }
}

// Función para mostrar mensaje cuando Notion bloquea el iframe
function showNotionBlockedMessage(container, url) {
  container.innerHTML = `
    <div style="padding: 40px 20px; text-align: center; color: #e0e0e0;">
      <div style="font-size: 48px; margin-bottom: 16px;">🔒</div>
      <h2 style="color: #fff; margin-bottom: 12px; font-size: 18px;">Notion bloquea el embedding</h2>
      <p style="color: #999; margin-bottom: 20px; font-size: 14px; line-height: 1.5;">
        Notion no permite que sus páginas se carguen en iframes por razones de seguridad.<br>
        Puedes abrir la página en una nueva ventana para verla.
      </p>
      <button id="open-notion-window" style="
        background: #4a9eff;
        border: none;
        border-radius: 8px;
        padding: 12px 24px;
        color: #fff;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
      ">Abrir en nueva ventana</button>
    </div>
  `;
  
  const openButton = container.querySelector('#open-notion-window');
  if (openButton) {
    openButton.addEventListener('click', () => {
      window.open(url, '_blank', 'noopener,noreferrer');
    });
    openButton.addEventListener('mouseenter', () => {
      openButton.style.background = '#5aaeff';
    });
    openButton.addEventListener('mouseleave', () => {
      openButton.style.background = '#4a9eff';
    });
  }
}

// Intentar inicializar Owlbear con manejo de errores
console.log('🔄 Intentando inicializar Owlbear SDK...');

try {
  OBR.onReady(() => {
    try {
      console.log('✅ Owlbear SDK listo');
      console.log('🌐 URL actual:', window.location.href);
      console.log('🔗 Origen:', window.location.origin);
      
      // Inicializar sistema de gestión de páginas
      const pagesConfig = initializeDefaultPages(NOTION_PAGES);
      
      // Obtener todas las páginas (desde localStorage o por defecto)
      const allPages = getAllPagesFlat();
      
      // Filtrar páginas válidas
      const validPages = allPages.filter(page => 
        page.url && 
        !page.url.includes('...') && 
        page.url.startsWith('http')
      );

      console.log('📊 Total de páginas:', validPages.length);
      console.log('📁 Categorías:', pagesConfig.categories.length);
      
      const pageList = document.getElementById("page-list");
      const header = document.getElementById("header");

      if (!pageList || !header) {
        console.error('❌ No se encontraron los elementos necesarios');
        return;
      }

      // Agregar botón de administración
      const adminButton = document.createElement("button");
      adminButton.className = "admin-button";
      adminButton.innerHTML = "⚙️";
      adminButton.title = "Gestionar páginas";
      adminButton.style.cssText = `
        background: #2d2d2d;
        border: 1px solid #404040;
        border-radius: 6px;
        padding: 6px 12px;
        color: #e0e0e0;
        cursor: pointer;
        font-size: 16px;
        margin-left: auto;
      `;
      adminButton.addEventListener("click", () => showAdminPanel(pagesConfig));
      header.appendChild(adminButton);

      if (validPages.length === 0) {
        pageList.innerHTML = `
          <div class="empty-state">
            <p>No hay páginas configuradas</p>
            <p>Clic en ⚙️ para agregar páginas</p>
          </div>
        `;
        return;
      }

      // Renderizar páginas agrupadas por categorías
      renderPagesByCategories(pagesConfig, pageList, validPages);
    } catch (error) {
      console.error('❌ Error dentro de OBR.onReady:', error);
      console.error('Stack:', error.stack);
      const pageList = document.getElementById("page-list");
      if (pageList) {
        pageList.innerHTML = `
          <div class="empty-state">
            <p>Error al cargar la extensión</p>
            <p>Verifica la consola para más detalles</p>
            <p style="font-size: 11px; margin-top: 8px; color: #888;">${error.message || 'Error desconocido'}</p>
          </div>
        `;
      }
    }
  });
} catch (error) {
  console.error('❌ Error crítico al cargar el SDK de Owlbear:', error);
  console.error('Stack:', error.stack);
  const pageList = document.getElementById("page-list");
  if (pageList) {
    pageList.innerHTML = `
      <div class="empty-state">
        <p>Error crítico al cargar la extensión</p>
        <p>Verifica la consola para más detalles</p>
        <p style="font-size: 11px; margin-top: 8px; color: #888;">${error.message || 'Error desconocido'}</p>
      </div>
    `;
  }
}

// Función para renderizar páginas agrupadas por categorías
function renderPagesByCategories(pagesConfig, pageList, validPages) {
  pageList.innerHTML = '';
  
  pagesConfig.categories.forEach(category => {
    // Filtrar páginas válidas de esta categoría
    const categoryPages = category.pages.filter(page => 
      validPages.some(vp => vp.id === page.id)
    );
    
    if (categoryPages.length === 0) return;
    
    // Crear contenedor de categoría
    const categoryDiv = document.createElement('div');
    categoryDiv.className = 'category-group';
    categoryDiv.style.cssText = 'margin-bottom: 24px;';
    
    // Título de categoría
    const categoryTitle = document.createElement('h2');
    categoryTitle.className = 'category-title';
    categoryTitle.textContent = category.name;
    categoryTitle.style.cssText = `
      font-size: 14px;
      font-weight: 600;
      color: #999;
      margin-bottom: 8px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    `;
    categoryDiv.appendChild(categoryTitle);
    
    // Contenedor de páginas de la categoría
    const pagesContainer = document.createElement('div');
    pagesContainer.className = 'category-pages';
    pagesContainer.style.cssText = 'display: flex; flex-direction: column; gap: 8px;';
    
    // Crear botones para cada página
    categoryPages.forEach(page => {
      const button = document.createElement("button");
      button.className = "page-button";
      button.innerHTML = `
        <div class="page-name">${page.name}</div>
        <div class="page-url">${page.url}</div>
      `;
      
      button.addEventListener("click", async () => {
        await loadPageContent(page.url, page.name);
      });
      
      pagesContainer.appendChild(button);
    });
    
    categoryDiv.appendChild(pagesContainer);
    pageList.appendChild(categoryDiv);
  });
}

// Función para cargar contenido de una página
async function loadPageContent(url, name) {
  const pageList = document.getElementById("page-list");
  const notionContainer = document.getElementById("notion-container");
  const backButton = document.getElementById("back-button");
  const pageTitle = document.getElementById("page-title");
  const notionContent = document.getElementById("notion-content");
  
  if (pageList && notionContainer && backButton && pageTitle && notionContent) {
    pageList.classList.add("hidden");
    notionContainer.classList.remove("hidden");
    backButton.classList.remove("hidden");
    pageTitle.textContent = name;
    
    await loadNotionContent(url, notionContainer);
    
    if (!backButton.dataset.listenerAdded) {
      backButton.addEventListener("click", () => {
        pageList.classList.remove("hidden");
        notionContainer.classList.add("hidden");
        backButton.classList.add("hidden");
        pageTitle.textContent = "📚 Páginas de Notion";
        notionContainer.classList.remove("show-content");
        if (notionContent) {
          notionContent.innerHTML = "";
        }
      });
      backButton.dataset.listenerAdded = "true";
    }
  }
}

// Función para mostrar el panel de administración
function showAdminPanel(pagesConfig) {
  // Importar funciones de gestión dinámicamente
  import('./pages-manager.js').then(module => {
    const {
      addCategory,
      deleteCategory,
      addPageToCategory,
      deletePage,
      updatePage,
      updateCategoryName,
      savePagesConfig,
      getPagesConfig,
      getAllPagesFlat
    } = module;
    
    // Crear modal de administración
    const modal = document.createElement('div');
    modal.id = 'admin-modal';
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.8);
      z-index: 1000;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    `;
    
    const modalContent = document.createElement('div');
    modalContent.style.cssText = `
      background: #2d2d2d;
      border-radius: 12px;
      padding: 24px;
      max-width: 600px;
      width: 100%;
      max-height: 80vh;
      overflow-y: auto;
      color: #e0e0e0;
    `;
    
    modalContent.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
        <h2 style="color: #fff; margin: 0;">⚙️ Gestionar Páginas</h2>
        <button id="close-admin" style="
          background: transparent;
          border: none;
          color: #999;
          font-size: 24px;
          cursor: pointer;
          padding: 0;
          width: 32px;
          height: 32px;
        ">×</button>
      </div>
      <div id="admin-content"></div>
    `;
    
    modal.appendChild(modalContent);
    document.body.appendChild(modal);
    
    // Función para recargar contenido
    const reloadAdmin = () => {
      const config = getPagesConfig();
      renderAdminContent(modalContent.querySelector('#admin-content'), config, module);
    };
    
    // Renderizar contenido de administración
    renderAdminContent(modalContent.querySelector('#admin-content'), pagesConfig, module, reloadAdmin);
    
    // Cerrar modal
    modal.querySelector('#close-admin').addEventListener('click', () => {
      document.body.removeChild(modal);
      // Recargar la lista de páginas
      const config = getPagesConfig();
      const allPages = getAllPagesFlat();
      const validPages = allPages.filter(page => 
        page.url && !page.url.includes('...') && page.url.startsWith('http')
      );
      const pageList = document.getElementById("page-list");
      if (pageList) {
        renderPagesByCategories(config, pageList, validPages);
      }
    });
    
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        document.body.removeChild(modal);
      }
    });
  });
}

// Función para renderizar el contenido del panel de administración
function renderAdminContent(container, pagesConfig, managerModule, reloadCallback) {
  container.innerHTML = '';
  
  // Botón para agregar categoría
  const addCategoryBtn = document.createElement('button');
  addCategoryBtn.textContent = '+ Agregar Categoría';
  addCategoryBtn.style.cssText = `
    background: #4a9eff;
    border: none;
    border-radius: 6px;
    padding: 10px 16px;
    color: #fff;
    cursor: pointer;
    font-size: 14px;
    font-weight: 600;
    margin-bottom: 20px;
    width: 100%;
  `;
  addCategoryBtn.addEventListener('click', () => {
    const name = prompt('Nombre de la categoría:');
    if (name && name.trim()) {
      managerModule.addCategory(name.trim());
      reloadCallback();
    }
  });
  container.appendChild(addCategoryBtn);
  
  // Renderizar cada categoría
  pagesConfig.categories.forEach(category => {
    const categoryDiv = document.createElement('div');
    categoryDiv.style.cssText = `
      background: #1a1a1a;
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 16px;
    `;
    
    categoryDiv.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
        <input type="text" value="${category.name}" id="cat-name-${category.id}" style="
          background: #2d2d2d;
          border: 1px solid #404040;
          border-radius: 4px;
          padding: 6px 12px;
          color: #fff;
          font-size: 14px;
          flex: 1;
          margin-right: 8px;
        ">
        <button class="delete-category" data-id="${category.id}" style="
          background: #dc3545;
          border: none;
          border-radius: 4px;
          padding: 6px 12px;
          color: #fff;
          cursor: pointer;
          font-size: 12px;
        ">Eliminar</button>
      </div>
      <div class="category-pages-list" style="margin-bottom: 12px;"></div>
      <button class="add-page" data-category="${category.id}" style="
        background: #28a745;
        border: none;
        border-radius: 4px;
        padding: 6px 12px;
        color: #fff;
        cursor: pointer;
        font-size: 12px;
        width: 100%;
      ">+ Agregar Página</button>
    `;
    
    // Actualizar nombre de categoría
    const nameInput = categoryDiv.querySelector(`#cat-name-${category.id}`);
    nameInput.addEventListener('blur', () => {
      if (nameInput.value !== category.name) {
        managerModule.updateCategoryName(category.id, nameInput.value);
      }
    });
    
    // Eliminar categoría
    categoryDiv.querySelector('.delete-category').addEventListener('click', () => {
      if (confirm(`¿Eliminar categoría "${category.name}" y todas sus páginas?`)) {
        managerModule.deleteCategory(category.id);
        reloadCallback();
      }
    });
    
    // Renderizar páginas de la categoría
    const pagesList = categoryDiv.querySelector('.category-pages-list');
    category.pages.forEach(page => {
      const pageDiv = document.createElement('div');
      pageDiv.style.cssText = `
        background: #2d2d2d;
        border-radius: 6px;
        padding: 12px;
        margin-bottom: 8px;
        display: flex;
        gap: 8px;
        align-items: center;
      `;
      
      pageDiv.innerHTML = `
        <div style="flex: 1;">
          <input type="text" value="${page.name}" class="page-name-input" data-page="${page.id}" style="
            background: #1a1a1a;
            border: 1px solid #404040;
            border-radius: 4px;
            padding: 4px 8px;
            color: #fff;
            font-size: 13px;
            width: 100%;
            margin-bottom: 4px;
          ">
          <input type="text" value="${page.url}" class="page-url-input" data-page="${page.id}" style="
            background: #1a1a1a;
            border: 1px solid #404040;
            border-radius: 4px;
            padding: 4px 8px;
            color: #999;
            font-size: 11px;
            width: 100%;
          ">
        </div>
        <button class="delete-page" data-category="${category.id}" data-page="${page.id}" style="
          background: #dc3545;
          border: none;
          border-radius: 4px;
          padding: 4px 8px;
          color: #fff;
          cursor: pointer;
          font-size: 11px;
        ">×</button>
      `;
      
      // Actualizar página
      const nameInput = pageDiv.querySelector('.page-name-input');
      const urlInput = pageDiv.querySelector('.page-url-input');
      const updatePage = () => {
        managerModule.updatePage(category.id, page.id, nameInput.value, urlInput.value);
      };
      nameInput.addEventListener('blur', updatePage);
      urlInput.addEventListener('blur', updatePage);
      
      // Eliminar página
      pageDiv.querySelector('.delete-page').addEventListener('click', () => {
        if (confirm(`¿Eliminar página "${page.name}"?`)) {
          managerModule.deletePage(category.id, page.id);
          reloadCallback();
        }
      });
      
      pagesList.appendChild(pageDiv);
    });
    
    // Agregar página
    categoryDiv.querySelector('.add-page').addEventListener('click', () => {
      const name = prompt('Nombre de la página:');
      if (!name || !name.trim()) return;
      
      const url = prompt('URL de la página de Notion:');
      if (!url || !url.trim()) return;
      
      managerModule.addPageToCategory(category.id, name.trim(), url.trim());
      reloadCallback();
    });
    
    container.appendChild(categoryDiv);
  });
}

// Log adicional para verificar que el script se ejecutó completamente
console.log('✅ index.js cargado completamente');

