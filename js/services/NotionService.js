/**
 * @fileoverview Servicio para interactuar con la API de Notion
 * 
 * Gestiona las llamadas a la API de Notion a través del proxy de Netlify.
 */

import { ROOM_CONTENT_CACHE_KEY } from '../utils/constants.js';
import { log, logError, logWarn } from '../utils/logger.js';

/**
 * Servicio para interactuar con Notion
 */
export class NotionService {
  constructor() {
    // Referencia a OBR (se inyecta)
    this.OBR = null;
    // Referencia al CacheService
    this.cacheService = null;
    // Referencia al StorageService
    this.storageService = null;
  }

  /**
   * Inyecta dependencias
   * @param {Object} deps - Dependencias
   */
  setDependencies({ OBR, cacheService, storageService }) {
    if (OBR) this.OBR = OBR;
    if (cacheService) this.cacheService = cacheService;
    if (storageService) this.storageService = storageService;
  }

  /**
   * Obtiene los bloques de una página de Notion
   * @param {string} pageId - ID de la página
   * @param {boolean} useCache - Si usar caché
   * @returns {Promise<Array>}
   */
  async fetchBlocks(pageId, useCache = true) {
    // Intentar obtener del caché local primero
    if (useCache && this.cacheService) {
      const cachedBlocks = this.cacheService.getCachedBlocks(pageId);
      if (cachedBlocks && cachedBlocks.length > 0) {
        log('✅ Usando caché persistente para:', pageId, '-', cachedBlocks.length, 'bloques');
        return cachedBlocks;
      }
      log('⚠️ No hay caché para:', pageId, '- se pedirá a la API');
    } else if (!useCache) {
      log('🔄 Recarga forzada - ignorando caché para:', pageId);
    }

    try {
      // Obtener token del usuario
      const userToken = this.storageService?.getUserToken();
      
      if (!userToken) {
        // Sin token, intentar obtener del caché compartido
        const sharedBlocks = await this._getFromSharedCache(pageId);
        if (sharedBlocks) {
          return sharedBlocks;
        }
        // Retornar null para que el controlador solicite al GM
        log('⚠️ No hay token, el contenido debe ser solicitado al GM');
        return null;
      }

      log('🌐 Obteniendo bloques desde la API para:', pageId);
      
      const apiUrl = `/.netlify/functions/notion-api?pageId=${encodeURIComponent(pageId)}&token=${encodeURIComponent(userToken)}`;
      
      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        
        if (response.status === 401) {
          throw new Error('Invalid token or no permissions. Verify that the configured token is correct.');
        } else if (response.status === 404) {
          throw new Error('Page not found. Verify that the URL is correct.');
        } else {
          throw new Error(`Error de API: ${response.status} - ${errorData.message || response.statusText}`);
        }
      }

      const data = await response.json();
      const blocks = data.results || [];
      
      log('📦 Bloques recibidos de la API:', blocks.length);

      // Guardar en caché
      if (this.cacheService && blocks.length > 0) {
        await this.cacheService.setCachedBlocks(pageId, blocks);
      }

      return blocks;
    } catch (e) {
      logError('Error al obtener bloques:', e);
      throw e;
    }
  }

  /**
   * Obtiene información de una página (icono, última edición)
   * @param {string} pageId - ID de la página
   * @param {boolean} useCache - Si usar caché (default: true)
   * @returns {Promise<Object>}
   */
  async fetchPageInfo(pageId, useCache = true) {
    if (!pageId || pageId === 'null' || pageId === 'undefined') {
      log('⚠️ fetchPageInfo: pageId inválido');
      return { lastEditedTime: null, icon: null };
    }

    // Intentar obtener del caché
    if (useCache && this.cacheService) {
      const cached = this.cacheService.getCachedPageInfo(pageId);
      if (cached) {
        log('📄 PageInfo del caché:', { 
          hasCover: !!cached.cover, 
          hasIcon: !!cached.icon,
          coverType: cached.cover?.type || 'none'
        });
        return cached;
      }
    } else if (!useCache) {
      log('🔄 Recarga forzada - ignorando caché de PageInfo para:', pageId);
    }

    try {
      const userToken = this.storageService?.getUserToken();
      
      if (!userToken) {
        return { lastEditedTime: null, icon: null };
      }

      const apiUrl = `/.netlify/functions/notion-api?pageId=${encodeURIComponent(pageId)}&token=${encodeURIComponent(userToken)}&type=page`;
      
      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        return { lastEditedTime: null, icon: null };
      }

      const data = await response.json();
      const pageInfo = {
        lastEditedTime: data.last_edited_time || null,
        icon: data.icon || null,
        cover: data.cover || null,
        properties: data.properties || null
      };

      log('📄 PageInfo obtenido de API:', { 
        hasCover: !!pageInfo.cover, 
        hasIcon: !!pageInfo.icon,
        hasProperties: !!pageInfo.properties,
        coverType: pageInfo.cover?.type || 'none',
        iconType: pageInfo.icon?.type || 'none'
      });

      // Guardar en caché
      if (this.cacheService) {
        this.cacheService.setCachedPageInfo(pageId, pageInfo);
      }

      return pageInfo;
    } catch (e) {
      logError('Error al obtener info de página:', e);
      return { lastEditedTime: null, icon: null };
    }
  }

  /**
   * Obtiene los bloques hijos de un bloque
   * @param {string} blockId - ID del bloque padre
   * @param {boolean} useCache - Si usar caché
   * @returns {Promise<Array>}
   */
  async fetchChildBlocks(blockId, useCache = true) {
    // Intentar obtener del caché primero
    if (useCache && this.cacheService) {
      const cachedBlocks = this.cacheService.getCachedBlocks(blockId);
      if (cachedBlocks && cachedBlocks.length > 0) {
        log('✅ Usando caché para hijos del bloque:', blockId);
        return cachedBlocks;
      }
    }

    try {
      const userToken = this.storageService?.getUserToken();
      
      if (!userToken) {
        return [];
      }

      // Usar el mismo endpoint que para páginas - la API de Notion usa el mismo endpoint
      // para obtener hijos de bloques, pasando el blockId como pageId
      const apiUrl = `/.netlify/functions/notion-api?pageId=${encodeURIComponent(blockId)}&token=${encodeURIComponent(userToken)}`;
      
      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        logWarn('Error al obtener hijos del bloque:', blockId, response.status);
        return [];
      }

      const data = await response.json();
      const blocks = data.results || [];
      
      // Guardar en caché
      if (this.cacheService && blocks.length > 0) {
        await this.cacheService.setCachedBlocks(blockId, blocks);
      }
      
      return blocks;
    } catch (e) {
      logError('Error al obtener bloques hijos:', e);
      return [];
    }
  }

  /**
   * Verifica si el token actual es válido
   * @returns {Promise<boolean>}
   */
  async validateToken() {
    try {
      const userToken = this.storageService?.getUserToken();
      
      if (!userToken) {
        return false;
      }

      // Hacer una llamada simple para verificar el token
      const response = await fetch(`/.netlify/functions/notion-api?validate=true&token=${encodeURIComponent(userToken)}`);
      
      return response.ok;
    } catch (e) {
      return false;
    }
  }

  /**
   * Busca páginas en el workspace del usuario
   * @param {string} query - Término de búsqueda (opcional)
   * @returns {Promise<Array>} - Lista de páginas encontradas
   */
  async searchWorkspacePages(query = '') {
    try {
      const userToken = this.storageService?.getUserToken();
      
      if (!userToken) {
        throw new Error('No Notion token configured. Please add your token in Settings.');
      }

      log('🔍 Buscando páginas en workspace...');
      
      const params = new URLSearchParams({
        action: 'search',
        token: userToken,
        filter: 'page'
      });
      
      if (query.trim()) {
        params.append('query', query);
      }
      
      const response = await fetch(`/.netlify/functions/notion-api?${params.toString()}`);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Error ${response.status}`);
      }

      const data = await response.json();
      const pages = data.results || [];
      
      log('📄 Páginas encontradas:', pages.length);
      
      // Mapear a formato simplificado
      return pages.map(page => {
        const title = this._extractPageTitle(page);
        return {
          id: page.id,
          title,
          icon: page.icon,
          cover: page.cover,
          url: this._buildNotionUrl(title, page.id),
          lastEdited: page.last_edited_time,
          parent: page.parent
        };
      });
    } catch (e) {
      logError('Error al buscar páginas:', e);
      throw e;
    }
  }

  /**
   * Obtiene las páginas hijas de una página
   * @param {string} pageId - ID de la página padre
   * @returns {Promise<Array>} - Lista de páginas hijas
   */
  async fetchChildPages(pageId) {
    try {
      const userToken = this.storageService?.getUserToken();
      
      if (!userToken) {
        throw new Error('No Notion token configured');
      }

      log('📂 Obteniendo páginas hijas de:', pageId);
      
      const params = new URLSearchParams({
        action: 'children',
        pageId: pageId,
        token: userToken
      });
      
      const response = await fetch(`/.netlify/functions/notion-api?${params.toString()}`);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Error ${response.status}`);
      }

      const data = await response.json();
      const childPages = data.results || [];
      
      log('📂 Páginas hijas encontradas:', childPages.length);
      
      // Mapear a formato simplificado
      return childPages.map(block => {
        const title = block.child_page?.title || 'Untitled';
        return {
          id: block.id,
          title,
          url: this._buildNotionUrl(title, block.id),
          type: 'child_page'
        };
      });
    } catch (e) {
      logError('Error al obtener páginas hijas:', e);
      throw e;
    }
  }

  /**
   * Genera la estructura de vault recursivamente desde una página
   * @param {string} pageId - ID de la página raíz
   * @param {string} pageTitle - Título de la página raíz
   * @param {number} maxDepth - Profundidad máxima (default: 3)
   * @param {Function} onProgress - Callback de progreso
   * @returns {Promise<Object>} - Estructura de vault
   */
  async generateVaultFromPage(pageId, pageTitle, maxDepth = 3, onProgress = null) {
    const stats = {
      pagesImported: 0,
      pagesSkipped: 0,
      unsupportedTypes: new Set()
    };

    const processPage = async (id, title, depth = 0) => {
      if (depth >= maxDepth) {
        stats.pagesSkipped++;
        return null;
      }

      try {
        // Reportar progreso
        if (onProgress) {
          onProgress({ 
            message: `Processing: ${title}...`, 
            depth,
            pagesImported: stats.pagesImported 
          });
        }

        // Obtener páginas hijas
        const childPages = await this.fetchChildPages(id);
        
        // Si no hay hijas, es una página final
        if (childPages.length === 0) {
          stats.pagesImported++;
          return {
            type: 'page',
            name: title,
            url: this._buildNotionUrl(title, id),
            visibleToPlayers: false
          };
        }

        // Si hay hijas, crear una categoría con las páginas
        const category = {
          name: title,
          pages: [],
          categories: []
        };

        // Añadir la página principal como primera página de la categoría
        category.pages.push({
          type: 'page',
          name: title,
          url: this._buildNotionUrl(title, id),
          visibleToPlayers: false
        });
        stats.pagesImported++;

        // Procesar cada página hija
        for (const child of childPages) {
          const result = await processPage(child.id, child.title, depth + 1);
          
          if (result) {
            if (result.type === 'page') {
              category.pages.push(result);
            } else {
              // Es una subcategoría
              category.categories.push(result);
            }
          }
        }

        // Devolver la categoría (siempre tiene al menos la página principal)
        return category;

        return null;
      } catch (e) {
        logWarn(`Error procesando página ${title}:`, e);
        stats.pagesSkipped++;
        return null;
      }
    };

    // Procesar desde la página raíz
    const rootResult = await processPage(pageId, pageTitle, 0);

    // Construir configuración final
    let config;
    if (rootResult && rootResult.type !== 'page') {
      // La raíz es una categoría (tiene hijos)
      config = {
        categories: rootResult.categories.length > 0 || rootResult.pages.length > 0
          ? [rootResult]
          : []
      };
    } else if (rootResult) {
      // La raíz es una página simple, crear categoría contenedora
      config = {
        categories: [{
          name: pageTitle,
          pages: [rootResult],
          categories: []
        }]
      };
    } else {
      // No se pudo procesar
      config = { categories: [] };
    }

    return {
      config,
      stats: {
        pagesImported: stats.pagesImported,
        pagesSkipped: stats.pagesSkipped,
        unsupportedTypes: Array.from(stats.unsupportedTypes)
      }
    };
  }

  /**
   * Extrae el título de una página de Notion
   * @private
   */
  _extractPageTitle(page) {
    // Intentar obtener título de las propiedades
    if (page.properties) {
      // Buscar propiedad "title" o "Name"
      const titleProp = page.properties.title || page.properties.Title || page.properties.Name || page.properties.name;
      if (titleProp && titleProp.title && titleProp.title[0]) {
        return titleProp.title[0].plain_text || 'Untitled';
      }
      
      // Buscar cualquier propiedad tipo title
      for (const prop of Object.values(page.properties)) {
        if (prop.type === 'title' && prop.title && prop.title[0]) {
          return prop.title[0].plain_text || 'Untitled';
        }
      }
    }
    
    return 'Untitled';
  }

  /**
   * Construye una URL de Notion con el formato correcto
   * Formato: https://www.notion.so/Title-Slug-pageIdSinGuiones
   * @param {string} title - Título de la página
   * @param {string} pageId - ID de la página (con o sin guiones)
   * @returns {string} URL de Notion
   * @private
   */
  _buildNotionUrl(title, pageId) {
    // Limpiar el ID (quitar guiones)
    const cleanId = pageId.replace(/-/g, '');
    
    // Crear slug del título
    const slug = title
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Quitar acentos
      .replace(/[^a-zA-Z0-9\s-]/g, '') // Solo alfanuméricos, espacios y guiones
      .trim()
      .replace(/\s+/g, '-') // Espacios a guiones
      .replace(/-+/g, '-'); // Múltiples guiones a uno
    
    // Si hay slug, usarlo; si no, solo el ID
    if (slug && slug !== '-') {
      return `https://www.notion.so/${slug}-${cleanId}`;
    }
    return `https://www.notion.so/${cleanId}`;
  }

  /**
   * Intenta obtener del caché compartido
   * @private
   */
  async _getFromSharedCache(pageId) {
    if (!this.OBR) return null;

    try {
      const metadata = await this.OBR.room.getMetadata();
      const sharedCache = metadata && metadata[ROOM_CONTENT_CACHE_KEY];
      
      if (sharedCache && sharedCache[pageId] && sharedCache[pageId].blocks) {
        log('✅ Usando caché compartido (room metadata) para:', pageId);
        return sharedCache[pageId].blocks;
      }
    } catch (e) {
      logWarn('No se pudo obtener caché compartido:', e);
    }
    return null;
  }
}

export default NotionService;

