/**
 * @fileoverview Controlador principal de la extensión GM Vault
 * 
 * Orquesta todos los servicios, renderers y componentes de la aplicación.
 */

import { log, logError, setOBRReference, setGetTokenFunction, initDebugMode, getUserRole } from '../utils/logger.js';
import { filterVisiblePages } from '../utils/helpers.js';

// Services
import { CacheService } from '../services/CacheService.js';
import { StorageService } from '../services/StorageService.js';
import { NotionService } from '../services/NotionService.js';
import { BroadcastService } from '../services/BroadcastService.js';

// Renderers
import { NotionRenderer } from '../renderers/NotionRenderer.js';
import { UIRenderer } from '../renderers/UIRenderer.js';

// Parsers & Builders
import { ConfigParser } from '../parsers/ConfigParser.js';
import { ConfigBuilder } from '../builders/ConfigBuilder.js';

// UI
import { ModalManager } from '../ui/ModalManager.js';
import { EventHandlers } from '../ui/EventHandlers.js';

/**
 * Controlador principal de la extensión
 */
export class ExtensionController {
  constructor() {
    // Referencia a OBR SDK
    this.OBR = null;
    
    // Estado de la aplicación
    this.isGM = true;
    this.roomId = null;
    this.playerId = null;
    this.playerName = null;
    this.config = null;
    this.isInitialized = false;

    // Servicios
    this.cacheService = new CacheService();
    this.storageService = new StorageService();
    this.notionService = new NotionService();
    this.broadcastService = new BroadcastService();

    // Renderers
    this.notionRenderer = new NotionRenderer();
    this.uiRenderer = new UIRenderer();

    // Parser & Builder
    this.configParser = new ConfigParser();
    this.configBuilder = null;

    // UI Components
    this.modalManager = new ModalManager();
    this.eventHandlers = new EventHandlers();

    // Elementos DOM
    this.pagesContainer = null;
    this.contentContainer = null;

    // Intervals
    this.heartbeatInterval = null;
    this.roleCheckInterval = null;
  }

  /**
   * Inicializa la extensión
   * @param {Object} OBR - Referencia al SDK de Owlbear Rodeo (ya debe estar listo)
   * @param {Object} options - Opciones de inicialización
   */
  async init(OBR, options = {}) {
    console.log('🚀 Inicializando ExtensionController...');
    
    this.OBR = OBR;
    
    // Debug: verificar estructura de OBR
    console.log('📦 OBR disponible:', !!OBR);
    console.log('📦 OBR.room:', OBR?.room);
    console.log('📦 OBR.player:', OBR?.player);
    console.log('📦 OBR keys:', OBR ? Object.keys(OBR) : 'N/A');
    
    // Configurar referencias
    setOBRReference(OBR);
    setGetTokenFunction(() => this.storageService.getUserToken());
    
    // Configurar servicios
    this._setupServices();
    
    // Inicializar modo debug
    await initDebugMode();

    // OBR ya está listo (main.js espera a onReady antes de llamar init)
    console.log('✅ Configurando extensión...');
    
    // Obtener información del jugador y room
    await this._fetchPlayerInfo();
    
    // Obtener configuración
    await this._loadConfig();
    
    // Configurar UI
    this._setupUI(options);
    
    // Configurar event handlers
    this._setupEventHandlers();
    
    // Configurar broadcast (si es GM)
    if (this.isGM) {
      this._setupGMBroadcast();
      this._startHeartbeat();
    } else {
      this._setupPlayerBroadcast();
    }
    
    // Iniciar detección de cambio de rol
    this._startRoleChangeDetection();
    
    // Renderizar UI inicial
    await this.render();
    
    this.isInitialized = true;
    log('✅ ExtensionController inicializado correctamente');
  }

  /**
   * Renderiza la interfaz
   */
  async render() {
    if (!this.pagesContainer || !this.config) return;

    log('🎨 Renderizando interfaz...');
    
    this.uiRenderer.renderAllCategories(
      this.config,
      this.pagesContainer,
      this.roomId,
      this.isGM
    );
  }

  /**
   * Abre una página de contenido
   * @param {Object} page - Página a abrir
   */
  async openPage(page) {
    if (!this.contentContainer) return;

    log('📖 Abriendo página:', page.name);

    // Mostrar loading
    this.contentContainer.innerHTML = `
      <div class="loading-container">
        <div class="loading-spinner"></div>
        <p>Loading ${page.name}...</p>
      </div>
    `;

    try {
      const pageId = page.getNotionPageId ? page.getNotionPageId() : null;
      
      if (page.isNotionPage && page.isNotionPage() && pageId) {
        await this._renderNotionPage(page, pageId);
      } else if (page.isImage && page.isImage()) {
        this._renderImagePage(page);
      } else if (page.isGoogleDoc && page.isGoogleDoc()) {
        this._renderGoogleDocPage(page);
      } else {
        this._renderExternalPage(page);
      }
    } catch (e) {
      logError('Error al abrir página:', e);
      this.contentContainer.innerHTML = `
        <div class="error-container">
          <p class="error-message">Error loading page: ${e.message}</p>
        </div>
      `;
    }
  }

  /**
   * Guarda la configuración actual
   * @param {Object} config - Configuración a guardar
   */
  async saveConfig(config) {
    log('💾 Guardando configuración...');

    this.config = config;
    this.configBuilder = new ConfigBuilder(config);

    // Guardar en localStorage
    this.storageService.saveLocalConfig(config.toJSON ? config.toJSON() : config);

    // Si es GM, guardar en room metadata y broadcast
    if (this.isGM) {
      await this.storageService.saveRoomConfig(config.toJSON ? config.toJSON() : config);
      
      // Broadcast páginas visibles
      const visibleConfig = filterVisiblePages(config.toJSON ? config.toJSON() : config);
      this.broadcastService.broadcastVisiblePages(visibleConfig);
    }

    // Re-renderizar
    await this.render();
  }

  /**
   * Obtiene la configuración actual
   * @returns {Object}
   */
  getConfig() {
    return this.config;
  }

  /**
   * Limpia recursos al cerrar
   */
  cleanup() {
    log('🧹 Limpiando recursos...');
    
    // Detener intervals
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    
    if (this.roleCheckInterval) {
      clearInterval(this.roleCheckInterval);
      this.roleCheckInterval = null;
    }
    
    // Limpiar broadcast
    this.broadcastService.cleanup();
    
    log('✅ Recursos limpiados');
  }

  // ============================================
  // MÉTODOS PRIVADOS - SETUP
  // ============================================

  /**
   * Configura los servicios
   * @private
   */
  _setupServices() {
    // Cache Service
    this.cacheService.setOBR(this.OBR);
    this.cacheService.setStorageLimitCallback((action) => {
      this.modalManager.showAlert({
        title: 'Storage Limit',
        message: `Storage limit reached while ${action}. Some data may not be saved.`,
        type: 'warning'
      });
    });

    // Storage Service
    this.storageService.setOBR(this.OBR);
    this.storageService.setStorageLimitCallback((action) => {
      this.modalManager.showAlert({
        title: 'Storage Limit',
        message: `Storage limit reached while ${action}.`,
        type: 'warning'
      });
    });

    // Notion Service
    this.notionService.setDependencies({
      OBR: this.OBR,
      cacheService: this.cacheService,
      storageService: this.storageService
    });

    // Broadcast Service
    this.broadcastService.setDependencies({
      OBR: this.OBR,
      cacheService: this.cacheService
    });

    // Notion Renderer
    this.notionRenderer.setDependencies({
      notionService: this.notionService
    });

    // UI Renderer
    this.uiRenderer.setDependencies({
      storageService: this.storageService
    });
  }

  /**
   * Configura la UI
   * @private
   */
  _setupUI(options) {
    // Contenedores DOM
    this.pagesContainer = options.pagesContainer 
      ? (typeof options.pagesContainer === 'string' 
        ? document.querySelector(options.pagesContainer) 
        : options.pagesContainer)
      : document.getElementById('pages-list');
    
    this.contentContainer = options.contentContainer
      ? (typeof options.contentContainer === 'string'
        ? document.querySelector(options.contentContainer)
        : options.contentContainer)
      : document.getElementById('content-area');

    // Modal Manager
    this.modalManager.init(document.body);
  }

  /**
   * Configura event handlers
   * @private
   */
  _setupEventHandlers() {
    // Inyectar dependencias
    this.eventHandlers.setDependencies({
      storageService: this.storageService,
      cacheService: this.cacheService,
      broadcastService: this.broadcastService,
      notionService: this.notionService,
      uiRenderer: this.uiRenderer,
      notionRenderer: this.notionRenderer,
      modalManager: this.modalManager,
      configBuilder: this.configBuilder
    });

    // Configurar estado
    this.eventHandlers.setState({
      config: this.config,
      isGM: this.isGM,
      roomId: this.roomId
    });

    // Configurar callbacks
    this.eventHandlers.setCallbacks({
      onConfigChange: async (newConfig) => {
        await this.saveConfig(newConfig);
      },
      onPageOpen: (page) => {
        this.openPage(page);
      }
    });

    // Conectar UI Renderer con Event Handlers
    this.uiRenderer.setCallbacks({
      onPageClick: (page, categoryPath, pageIndex) => {
        this.eventHandlers.handlePageClick(page, categoryPath, pageIndex);
      },
      onVisibilityChange: (page, categoryPath, pageIndex, visible) => {
        this.eventHandlers.handleVisibilityChange(page, categoryPath, pageIndex, visible);
      },
      onPageEdit: (page, categoryPath, pageIndex) => {
        this.eventHandlers.handlePageEdit(page, categoryPath, pageIndex);
      },
      onPageDelete: (page, categoryPath, pageIndex) => {
        this.eventHandlers.handlePageDelete(page, categoryPath, pageIndex);
      },
      onAddPage: (categoryPath) => {
        this.eventHandlers.handleAddPage(categoryPath);
      }
    });
  }

  // ============================================
  // MÉTODOS PRIVADOS - DATOS
  // ============================================

  /**
   * Obtiene información del jugador
   * @private
   */
  async _fetchPlayerInfo() {
    try {
      // Verificar que OBR está disponible
      if (!this.OBR || !this.OBR.room || !this.OBR.player) {
        throw new Error('OBR SDK no disponible');
      }

      // Intentar obtener roomId (puede ser propiedad o método)
      if (this.OBR.room.id) {
        this.roomId = this.OBR.room.id;
      } else if (typeof this.OBR.room.getId === 'function') {
        this.roomId = await this.OBR.room.getId();
      } else {
        this.roomId = 'default';
      }

      // Obtener info del jugador
      if (typeof this.OBR.player.getId === 'function') {
        this.playerId = await this.OBR.player.getId();
      }
      if (typeof this.OBR.player.getName === 'function') {
        this.playerName = await this.OBR.player.getName();
      }
      
      this.isGM = await getUserRole();
      
      this.storageService.setRoomId(this.roomId);
      
      log('👤 Info del jugador:', {
        roomId: this.roomId,
        playerId: this.playerId,
        playerName: this.playerName,
        isGM: this.isGM
      });
    } catch (e) {
      logError('Error obteniendo info del jugador:', e);
      this.roomId = 'default';
      this.isGM = true; // Asumir GM por defecto
    }
  }

  /**
   * Carga la configuración
   * @private
   */
  async _loadConfig() {
    log('📥 Cargando configuración...');

    // Intentar cargar de localStorage primero
    let config = this.storageService.getLocalConfig();

    // Si es GM, intentar cargar de room metadata
    if (this.isGM) {
      const roomConfig = await this.storageService.getRoomConfig();
      if (roomConfig) {
        config = roomConfig;
      }
    } else {
      // Si es jugador, solicitar al GM
      const visibleConfig = await this.broadcastService.requestVisiblePages();
      if (visibleConfig) {
        config = visibleConfig;
      }
    }

    // Parsear y validar
    if (config) {
      const validation = this.configParser.validate(config);
      if (!validation.valid) {
        log('⚠️ Configuración inválida, migrando...');
        config = this.configParser.migrate(config);
      }
      this.config = this.configParser.parse(config);
    } else {
      // Crear configuración vacía
      this.config = ConfigBuilder.createDefault().build();
    }

    this.configBuilder = new ConfigBuilder(this.config);
    
    log('✅ Configuración cargada:', this.config.getTotalPageCount(), 'páginas');
  }

  // ============================================
  // MÉTODOS PRIVADOS - BROADCAST
  // ============================================

  /**
   * Configura broadcast para GM
   * @private
   */
  _setupGMBroadcast() {
    // Responder a solicitudes de contenido
    this.broadcastService.setupGMContentResponder(async (pageId) => {
      return this.cacheService.getHtmlFromLocalCache(pageId);
    });

    // Responder a solicitudes de páginas visibles
    this.broadcastService.setupGMVisiblePagesResponder(async () => {
      if (!this.config) return null;
      return filterVisiblePages(this.config.toJSON ? this.config.toJSON() : this.config);
    });
  }

  /**
   * Configura broadcast para jugador
   * @private
   */
  _setupPlayerBroadcast() {
    // Escuchar actualizaciones de páginas visibles
    this.broadcastService.listenForVisiblePagesUpdates(async (config) => {
      this.config = this.configParser.parse(config);
      await this.render();
    });
  }

  /**
   * Inicia heartbeat del vault owner
   * @private
   */
  _startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      this.storageService.updateOwnerHeartbeat();
    }, 120000); // 2 minutos
  }

  /**
   * Inicia detección de cambio de rol
   * @private
   */
  _startRoleChangeDetection() {
    let lastRole = this.isGM ? 'GM' : 'PLAYER';

    this.roleCheckInterval = setInterval(async () => {
      try {
        const currentRole = await this.OBR.player.getRole();
        
        if (lastRole !== currentRole) {
          log(`🔄 Cambio de rol detectado: ${lastRole} → ${currentRole}`);
          window.location.reload();
        }
        
        lastRole = currentRole;
      } catch (e) {
        // Ignorar errores de conexión
      }
    }, 3000);
  }

  // ============================================
  // MÉTODOS PRIVADOS - RENDER
  // ============================================

  /**
   * Renderiza una página de Notion
   * @private
   */
  async _renderNotionPage(page, pageId) {
    const blocks = await this.notionService.fetchBlocks(pageId);
    const html = await this.notionRenderer.renderBlocks(blocks, page.blockTypes);
    
    this.contentContainer.innerHTML = `
      <div class="notion-content">
        <h1 class="page-title">${page.name}</h1>
        ${html}
      </div>
    `;

    // Guardar HTML en caché
    this.cacheService.saveHtmlToLocalCache(pageId, html);

    // Attach event handlers para imágenes
    this._attachImageHandlers();
  }

  /**
   * Renderiza una página de imagen
   * @private
   */
  _renderImagePage(page) {
    this.contentContainer.innerHTML = `
      <div class="image-page">
        <h1 class="page-title">${page.name}</h1>
        <div class="image-container">
          <img src="${page.url}" alt="${page.name}" />
        </div>
      </div>
    `;
  }

  /**
   * Renderiza una página de Google Docs
   * @private
   */
  _renderGoogleDocPage(page) {
    // Convertir URL de Google Docs a embed
    let embedUrl = page.url;
    if (embedUrl.includes('/edit')) {
      embedUrl = embedUrl.replace('/edit', '/preview');
    } else if (!embedUrl.includes('/preview')) {
      embedUrl = embedUrl + '/preview';
    }

    this.contentContainer.innerHTML = `
      <div class="google-doc-page">
        <iframe src="${embedUrl}" frameborder="0"></iframe>
      </div>
    `;
  }

  /**
   * Renderiza una página externa
   * @private
   */
  _renderExternalPage(page) {
    this.contentContainer.innerHTML = `
      <div class="external-page">
        <h1 class="page-title">${page.name}</h1>
        <iframe src="${page.url}" frameborder="0"></iframe>
      </div>
    `;
  }

  /**
   * Attach event handlers para imágenes
   * @private
   */
  _attachImageHandlers() {
    const images = this.contentContainer.querySelectorAll('.notion-image-clickable');
    
    images.forEach(img => {
      img.addEventListener('click', () => {
        const url = img.dataset.imageUrl;
        const caption = img.dataset.imageCaption;
        this.eventHandlers.handleOpenImageModal(url, caption);
      });
    });

    const shareButtons = this.contentContainer.querySelectorAll('.notion-image-share-button');
    
    shareButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const url = btn.dataset.imageUrl;
        const caption = btn.dataset.imageCaption;
        this.eventHandlers.handleShareImage(url, caption);
      });
    });
  }
}

export default ExtensionController;

