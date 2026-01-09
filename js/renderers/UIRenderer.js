/**
 * @fileoverview Renderizador de UI para categorías y páginas
 * 
 * Genera el HTML para la navegación de categorías y páginas.
 * Compatible con el CSS existente (app.css)
 */

import { generateColorFromString, getInitial, extractNotionPageId } from '../utils/helpers.js';
import { log } from '../utils/logger.js';

/**
 * Renderizador de interfaz de usuario
 */
export class UIRenderer {
  constructor() {
    // Referencia al StorageService
    this.storageService = null;
    // Referencia al NotionService
    this.notionService = null;
    // Callbacks
    this.onPageClick = null;
    this.onVisibilityChange = null;
    this.onPageEdit = null;
    this.onPageDelete = null;
    this.onPageMove = null;
    this.onShowModal = null;
    // Es GM?
    this.isGM = true;
  }

  /**
   * Inyecta dependencias
   */
  setDependencies({ storageService, notionService }) {
    if (storageService) this.storageService = storageService;
    if (notionService) this.notionService = notionService;
  }

  /**
   * Establece callbacks de eventos
   */
  setCallbacks({ onPageClick, onVisibilityChange, onPageEdit, onPageDelete, onPageMove, onShowModal }) {
    if (onPageClick) this.onPageClick = onPageClick;
    if (onVisibilityChange) this.onVisibilityChange = onVisibilityChange;
    if (onPageEdit) this.onPageEdit = onPageEdit;
    if (onPageDelete) this.onPageDelete = onPageDelete;
    if (onPageMove) this.onPageMove = onPageMove;
    if (onShowModal) this.onShowModal = onShowModal;
  }

  /**
   * Verifica si una categoría tiene contenido visible para players
   */
  hasVisibleContentForPlayers(category) {
    if (category.pages && category.pages.some(p => p.visibleToPlayers === true)) {
      return true;
    }
    if (category.categories) {
      return category.categories.some(subcat => this.hasVisibleContentForPlayers(subcat));
    }
    return false;
  }

  /**
   * Renderiza todas las categorías desde config
   */
  renderAllCategories(config, container, roomId, isGM = true) {
    this.isGM = isGM;
    container.innerHTML = '';

    if (!config || !config.categories || config.categories.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📚</div>
          <p class="empty-state-text">No pages configured</p>
          <p class="empty-state-hint">Click + to add your first page</p>
        </div>
      `;
      return;
    }

    config.categories.forEach(category => {
      this.renderCategory(category, container, 0, roomId, [], isGM);
    });
  }

  /**
   * Renderiza una categoría completa
   */
  renderCategory(category, parentElement, level = 0, roomId = null, categoryPath = [], isGM = true) {
    // Si es jugador, verificar contenido visible
    if (!isGM && !this.hasVisibleContentForPlayers(category)) {
      return;
    }

    if (!category.name) return;

    // Filtrar páginas válidas
    let categoryPages = (category.pages || []).filter(page => 
      page.url && 
      !page.url.includes('...') && 
      (page.url.startsWith('http') || page.url.startsWith('/'))
    );

    // Si es jugador, filtrar solo páginas visibles
    if (!isGM) {
      categoryPages = categoryPages.filter(page => page.visibleToPlayers === true);
    }

    const hasPages = categoryPages.length > 0;
    const hasSubcategories = category.categories && category.categories.length > 0;
    const hasContent = hasPages || hasSubcategories;

    // Crear contenedor de categoría (usa clases del CSS original)
    const categoryDiv = document.createElement('div');
    categoryDiv.className = 'category-group';
    categoryDiv.dataset.level = level;
    categoryDiv.dataset.categoryName = category.name;

    // === TÍTULO CON BOTÓN DE COLAPSAR ===
    const titleContainer = document.createElement('div');
    titleContainer.className = 'category-title-container';

    // Botón de colapsar
    const collapseButton = document.createElement('button');
    collapseButton.className = 'category-collapse-button';
    
    const collapseIcon = document.createElement('img');
    collapseIcon.className = 'category-collapse-icon';
    
    const collapseStateKey = `category-collapsed-${category.name}-level-${level}`;
    const isCollapsed = localStorage.getItem(collapseStateKey) === 'true';
    collapseIcon.src = isCollapsed ? 'img/folder-close.svg' : 'img/folder-open.svg';
    collapseIcon.alt = isCollapsed ? 'Expand' : 'Collapse';
    collapseButton.appendChild(collapseIcon);
    titleContainer.appendChild(collapseButton);

    // Título
    const headingLevel = Math.min(level + 2, 6);
    const categoryTitle = document.createElement(`h${headingLevel}`);
    categoryTitle.className = 'category-title';
    categoryTitle.textContent = category.name;
    titleContainer.appendChild(categoryTitle);

    categoryDiv.appendChild(titleContainer);

    // === CONTENIDO ===
    const contentContainer = document.createElement('div');
    contentContainer.className = 'category-content';
    contentContainer.style.display = isCollapsed ? 'none' : 'block';

    // Renderizar páginas
    categoryPages.forEach((page, pageIndex) => {
      const pageButton = this._createPageButton(page, roomId, [...categoryPath, category.name], pageIndex, isGM);
      contentContainer.appendChild(pageButton);
    });

    // Renderizar subcategorías
    if (hasSubcategories) {
      category.categories.forEach(subcat => {
        this.renderCategory(subcat, contentContainer, level + 1, roomId, [...categoryPath, category.name], isGM);
      });
    }

    categoryDiv.appendChild(contentContainer);

    // === EVENT LISTENERS ===
    // Click para colapsar/expandir
    titleContainer.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      
      const newIsCollapsed = contentContainer.style.display !== 'none';
      contentContainer.style.display = newIsCollapsed ? 'none' : 'block';
      collapseIcon.src = newIsCollapsed ? 'img/folder-close.svg' : 'img/folder-open.svg';
      localStorage.setItem(collapseStateKey, newIsCollapsed);
    });

    parentElement.appendChild(categoryDiv);
  }

  /**
   * Crea un botón de página (compatible con CSS original)
   * @private
   */
  _createPageButton(page, roomId, categoryPath, pageIndex, isGM) {
    const button = document.createElement('button');
    button.className = 'page-button';
    button.dataset.pageIndex = pageIndex;
    button.dataset.pageName = page.name;
    button.dataset.pageUrl = page.url;

    // Generar color e inicial del placeholder
    const placeholderColor = generateColorFromString(page.name);
    const placeholderInitial = getInitial(page.name);

    // Determinar icono de tipo de link
    let linkIconHtml = '';
    if (page.url.includes('notion.so') || page.url.includes('notion.site')) {
      linkIconHtml = '<img src="img/icon-notion.svg" alt="Notion" class="page-link-icon">';
    } else if (page.url.includes('dndbeyond.com')) {
      linkIconHtml = '<img src="img/icon-dnd.svg" alt="D&D Beyond" class="page-link-icon">';
    } else if (page.url.includes('youtube.com') || page.url.includes('youtu.be')) {
      linkIconHtml = '<img src="img/icon-youtube.svg" alt="YouTube" class="page-link-icon">';
    } else if (page.url.includes('drive.google.com') || page.url.includes('docs.google.com')) {
      linkIconHtml = '<img src="img/icon-google-docs.svg" alt="Google Docs" class="page-link-icon">';
    }

    // Indicador de visible para players
    const visibleIndicator = page.visibleToPlayers ? ' <span style="opacity:0.6">(Player)</span>' : '';

    // HTML del botón
    button.innerHTML = `
      <div class="page-button-inner">
        <div class="page-icon-placeholder" style="background: ${placeholderColor};">${placeholderInitial}</div>
        <div class="page-name-text">${page.name}${visibleIndicator}</div>
        ${linkIconHtml}
      </div>
    `;

    // Botones de acción (solo GM)
    if (isGM) {
      // Botón de visibilidad
      const visibilityButton = document.createElement('button');
      visibilityButton.className = 'page-visibility-button';
      visibilityButton.innerHTML = `<img src="img/${page.visibleToPlayers ? 'icon-eye-open' : 'icon-eye-close'}.svg" alt="Visibility">`;
      visibilityButton.title = page.visibleToPlayers ? 'Visible to players' : 'Hidden from players';
      visibilityButton.style.cssText = 'position: absolute; right: 32px; top: 50%; transform: translateY(-50%); opacity: 0; transition: opacity 0.2s; background: transparent; border: none; cursor: pointer; padding: 4px;';
      
      visibilityButton.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.onVisibilityChange) {
          this.onVisibilityChange(page, categoryPath, pageIndex, !page.visibleToPlayers);
        }
      });

      // Botón de menú contextual (editar/eliminar)
      const contextMenuButton = document.createElement('button');
      contextMenuButton.className = 'page-context-menu-button';
      contextMenuButton.innerHTML = '<img src="img/icon-contextualmenu.svg" alt="Menu">';
      contextMenuButton.title = 'Options';
      contextMenuButton.style.cssText = 'position: absolute; right: 8px; top: 50%; transform: translateY(-50%); opacity: 0; transition: opacity 0.2s; background: transparent; border: none; cursor: pointer; padding: 4px;';
      
      contextMenuButton.addEventListener('click', (e) => {
        e.stopPropagation();
        this._showPageContextMenu(contextMenuButton, page, categoryPath, pageIndex);
      });

      button.style.position = 'relative';
      button.appendChild(visibilityButton);
      button.appendChild(contextMenuButton);

      // Mostrar botones en hover
      button.addEventListener('mouseenter', () => {
        visibilityButton.style.opacity = '1';
        contextMenuButton.style.opacity = '1';
      });
      button.addEventListener('mouseleave', () => {
        if (!button.classList.contains('context-menu-open')) {
          visibilityButton.style.opacity = '0';
          contextMenuButton.style.opacity = '0';
        }
      });
    }

    // Click para abrir página
    button.addEventListener('click', (e) => {
      if (e.target.closest('.page-visibility-button')) return;
      
      if (this.onPageClick) {
        this.onPageClick(page, categoryPath, pageIndex);
      }
    });

    // Intentar cargar icono real de Notion
    const pageId = extractNotionPageId(page.url);
    if (pageId && this.notionService) {
      this._loadPageIcon(button, pageId, page.name, linkIconHtml);
    }

    return button;
  }

  /**
   * Carga el icono real de una página de Notion
   * @private
   */
  async _loadPageIcon(button, pageId, pageName, linkIconHtml) {
    try {
      const pageInfo = await this.notionService.fetchPageInfo(pageId);
      if (pageInfo && pageInfo.icon) {
        let iconHtml = '';
        if (pageInfo.icon.type === 'emoji') {
          iconHtml = `<span class="page-icon-emoji">${pageInfo.icon.emoji || '📄'}</span>`;
        } else if (pageInfo.icon.type === 'external' && pageInfo.icon.external?.url) {
          iconHtml = `<img src="${pageInfo.icon.external.url}" alt="${pageName}" class="page-icon-image" />`;
        } else if (pageInfo.icon.type === 'file' && pageInfo.icon.file?.url) {
          iconHtml = `<img src="${pageInfo.icon.file.url}" alt="${pageName}" class="page-icon-image" />`;
        }

        if (iconHtml) {
          const inner = button.querySelector('.page-button-inner');
          if (inner) {
            inner.innerHTML = `
              <div style="display: flex; align-items: center; gap: var(--spacing-md); width: 100%;">
                ${iconHtml}
                <div class="page-name" style="flex: 1; text-align: left;">${pageName}</div>
                ${linkIconHtml}
              </div>
            `;
          }
        }
      }
    } catch (e) {
      // Ignorar errores de carga de icono
    }
  }

  /**
   * Muestra el menú contextual de una página
   * @private
   */
  _showPageContextMenu(button, page, categoryPath, pageIndex) {
    // Cerrar menú anterior
    const existingMenu = document.getElementById('context-menu');
    if (existingMenu) existingMenu.remove();

    // Marcar botón como activo
    const pageButton = button.closest('.page-button');
    if (pageButton) pageButton.classList.add('context-menu-open');
    button.classList.add('context-menu-active');

    const rect = button.getBoundingClientRect();
    
    // Crear menú usando createContextMenu
    const menuItems = [
      { 
        icon: 'img/icon-arrow.svg', 
        text: 'Move up',
        rotation: 'rotate(90deg)',
        action: () => {
          if (this.onPageMove) {
            this.onPageMove(page, categoryPath, pageIndex, 'up');
          }
        }
      },
      { 
        icon: 'img/icon-arrow.svg', 
        text: 'Move down',
        rotation: 'rotate(-90deg)',
        action: () => {
          if (this.onPageMove) {
            this.onPageMove(page, categoryPath, pageIndex, 'down');
          }
        }
      },
      { separator: true },
      { 
        icon: 'img/icon-edit.svg', 
        text: 'Edit', 
        action: () => this._showEditPageModal(page, categoryPath, pageIndex)
      },
      { separator: true },
      { 
        icon: 'img/icon-delete.svg', 
        text: 'Delete', 
        action: () => this._confirmDeletePage(page, categoryPath, pageIndex)
      }
    ];

    const menu = this._createContextMenu(menuItems, { x: rect.left, y: rect.bottom + 4 }, () => {
      // Callback al cerrar
      button.classList.remove('context-menu-active');
      if (pageButton) pageButton.classList.remove('context-menu-open');
    });
  }

  /**
   * Crea un menú contextual (similar al original)
   * @private
   */
  _createContextMenu(items, position, onClose) {
    // Remover menú existente
    const existingMenu = document.getElementById('context-menu');
    if (existingMenu) existingMenu.remove();

    const menu = document.createElement('div');
    menu.id = 'context-menu';
    // Posición inicial (se ajustará después)
    menu.style.left = `${position.x}px`;
    menu.style.top = `${position.y}px`;

    // Cerrar al click fuera
    const closeMenu = (e) => {
      if (!menu.contains(e.target)) {
        menu.remove();
        document.removeEventListener('click', closeMenu);
        if (onClose) onClose();
      }
    };

    items.forEach(item => {
      if (item.separator) {
        const separator = document.createElement('div');
        separator.className = 'context-menu__separator';
        menu.appendChild(separator);
        return;
      }

      const menuItem = document.createElement('div');
      menuItem.className = 'context-menu__item';

      // Icono
      let iconHtml = '';
      if (item.icon && item.icon.startsWith('img/')) {
        const rotation = item.rotation ? `transform: ${item.rotation};` : '';
        iconHtml = `<img src="${item.icon}" alt="" class="context-menu__icon" style="${rotation}" />`;
      } else {
        iconHtml = `<span class="context-menu__icon">${item.icon || ''}</span>`;
      }

      menuItem.innerHTML = `${iconHtml}<span>${item.text}</span>`;

      menuItem.addEventListener('click', async (e) => {
        e.stopPropagation();
        menu.remove();
        document.removeEventListener('click', closeMenu);
        if (onClose) onClose();
        if (item.action) {
          try {
            await item.action();
          } catch (error) {
            console.error('Error ejecutando acción del menú:', error);
          }
        }
      });

      menu.appendChild(menuItem);
    });

    // Usar setTimeout para evitar cierre inmediato
    setTimeout(() => {
      document.addEventListener('click', closeMenu);
    }, 0);

    document.body.appendChild(menu);

    // Ajustar posición si se sale de la pantalla
    const rect = menu.getBoundingClientRect();
    // Ajustar hacia la izquierda si se sale por la derecha
    if (rect.right > window.innerWidth) {
      menu.style.left = `${position.x - rect.width}px`;
    }
    // Ajustar hacia arriba si se sale por abajo
    if (rect.bottom > window.innerHeight) {
      menu.style.top = `${position.y - rect.height}px`;
    }

    return menu;
  }

  /**
   * Muestra modal de edición de página
   * @private
   */
  _showEditPageModal(page, categoryPath, pageIndex) {
    if (this.onShowModal) {
      this.onShowModal('edit-page', {
        title: 'Edit Page',
        fields: [
          { name: 'name', label: 'Name', type: 'text', value: page.name, required: true },
          { name: 'url', label: 'URL', type: 'url', value: page.url, required: true },
          { name: 'visibleToPlayers', label: 'Visible to players', type: 'checkbox', value: page.visibleToPlayers }
        ],
        onSubmit: (data) => {
          if (this.onPageEdit) {
            this.onPageEdit(page, categoryPath, pageIndex, data);
          }
        }
      });
    }
  }

  /**
   * Confirma eliminación de página
   * @private
   */
  _confirmDeletePage(page, categoryPath, pageIndex) {
    if (confirm(`Delete "${page.name}"?`)) {
      if (this.onPageDelete) {
        this.onPageDelete(page, categoryPath, pageIndex);
      }
    }
  }
}

export default UIRenderer;
