/**
 * @fileoverview Servicio para interactuar con Google Drive API
 * 
 * Permite autenticarse con Google, listar carpetas y generar el vault
 * basándose en la estructura de carpetas y documentos en Drive.
 */

import { log, logError, logWarn } from '../utils/logger.js';

/**
 * Servicio para interactuar con Google Drive
 */
export class GoogleDriveService {
  constructor() {
    // Referencia a OBR (se inyecta)
    this.OBR = null;
    // Token de acceso OAuth
    this.accessToken = null;
    // ID de la carpeta seleccionada
    this.selectedFolderId = null;
    // Google API client cargado
    this.gapiLoaded = false;
    // Google Identity Services cargado
    this.gisLoaded = false;
    // Token client de Google Identity Services
    this.tokenClient = null;
  }

  /**
   * Inyecta la referencia a OBR SDK
   * @param {Object} obr - Referencia al SDK
   */
  setOBR(obr) {
    this.OBR = obr;
  }

  /**
   * Carga Google Identity Services y Google API Client
   * @returns {Promise<void>}
   */
  async loadGoogleAPIs() {
    if (this.gapiLoaded && this.gisLoaded) {
      return;
    }

    // Cargar Google Identity Services
    if (!window.google || !window.google.accounts) {
      await this._loadScript('https://accounts.google.com/gsi/client');
      this.gisLoaded = true;
      log('✅ Google Identity Services cargado');
    }

    // Cargar Google API Client
    if (!window.gapi) {
      await this._loadScript('https://apis.google.com/js/api.js');
    }

    return new Promise((resolve, reject) => {
      window.gapi.load('client', async () => {
        try {
          // Inicializar el cliente sin Client ID (lo obtendremos del token directamente)
          await window.gapi.client.init({
            discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest']
          });
          
          this.gapiLoaded = true;
          log('✅ Google API Client inicializado');
          resolve();
        } catch (error) {
          logError('Error inicializando Google API Client:', error);
          reject(error);
        }
      });
    });
  }

  /**
   * Carga un script dinámicamente
   * @param {string} src - URL del script
   * @returns {Promise<void>}
   * @private
   */
  _loadScript(src) {
    return new Promise((resolve, reject) => {
      // Verificar si ya está cargado
      const existing = document.querySelector(`script[src="${src}"]`);
      if (existing) {
        resolve();
        return;
      }

      const script = document.createElement('script');
      script.src = src;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`Error cargando script: ${src}`));
      document.head.appendChild(script);
    });
  }

  /**
   * Inicia sesión con Google usando OAuth 2.0 Token Model
   * Implementa el flujo de OAuth 2.0 para aplicaciones JavaScript del lado del cliente
   * según la documentación oficial: https://developers.google.com/identity/protocols/oauth2
   * 
   * Usa Google Identity Services con initTokenClient() que es el método recomendado
   * para aplicaciones JavaScript. No requiere client secret, solo Client ID.
   * 
   * @param {string} clientId - Client ID de Google OAuth (obtenido del usuario)
   * @returns {Promise<string>} - Token de acceso OAuth 2.0
   */
  async signInWithGoogle(clientId = null) {
    try {
      await this.loadGoogleAPIs();

      if (!window.google || !window.google.accounts) {
        throw new Error('Google Identity Services no está disponible');
      }

      // Obtener Client ID de localStorage si no se proporciona
      if (!clientId) {
        clientId = localStorage.getItem('google_drive_client_id');
        
        if (!clientId) {
          throw new Error('Client ID no configurado. Por favor, configura tu Client ID de Google OAuth.');
        }
      }

      // Usar Google Identity Services Token Model (recomendado por Google)
      // Documentación: https://developers.google.com/identity/oauth2/web/guides/use-token-model
      return new Promise((resolve, reject) => {
        this.tokenClient = window.google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: 'https://www.googleapis.com/auth/drive.readonly',
          callback: (response) => {
            if (response.error) {
              logError('Error en autenticación OAuth 2.0:', response.error);
              reject(new Error(response.error));
              return;
            }
            // El access token se obtiene directamente del callback
            // No se necesita client secret para aplicaciones JavaScript
            this.accessToken = response.access_token;
            log('✅ Autenticado con Google Drive usando OAuth 2.0');
            resolve(this.accessToken);
          }
        });
        
        // Solicitar token de acceso (abre ventana de autenticación de Google)
        this.tokenClient.requestAccessToken();
      });
    } catch (error) {
      logError('Error iniciando sesión con Google:', error);
      throw error;
    }
  }

  /**
   * Lista todas las carpetas del usuario en Google Drive
   * Usa el access token OAuth 2.0 para autenticar las peticiones a la API
   * 
   * @returns {Promise<Array>} - Array de carpetas {id, name}
   */
  async listFolders() {
    try {
      if (!this.accessToken) {
        throw new Error('No estás autenticado. Inicia sesión primero.');
      }

      // Configurar el token OAuth 2.0 en el cliente de Google API
      // El token se envía automáticamente en el header Authorization
      window.gapi.client.setToken({ access_token: this.accessToken });

      // Llamar a Google Drive API usando el token OAuth 2.0
      const response = await window.gapi.client.drive.files.list({
        q: "mimeType='application/vnd.google-apps.folder' and trashed=false",
        fields: 'files(id, name)',
        pageSize: 1000,
        orderBy: 'name'
      });

      const folders = (response.result.files || []).map(f => ({
        id: f.id,
        name: f.name
      }));

      log(`✅ ${folders.length} carpetas encontradas`);
      return folders;
    } catch (error) {
      logError('Error listando carpetas:', error);
      throw error;
    }
  }

  /**
   * Lista recursivamente el contenido de una carpeta
   * @param {string} folderId - ID de la carpeta
   * @param {string} [folderName] - Nombre de la carpeta (para logging)
   * @returns {Promise<Object>} - Estructura con carpetas y archivos
   */
  async listFolderContents(folderId, folderName = 'root') {
    try {
      log(`📁 Listando contenido de: ${folderName} (${folderId})`);
      
      if (!this.accessToken) {
        throw new Error('No estás autenticado');
      }

      // Configurar el token en el cliente
      window.gapi.client.setToken({ access_token: this.accessToken });
      
      const response = await window.gapi.client.drive.files.list({
        q: `'${folderId}' in parents and trashed=false`,
        fields: 'files(id, name, mimeType, webViewLink, webContentLink)',
        pageSize: 1000
      });

      const items = response.result.files || [];
      const folders = [];
      const files = [];

      for (const item of items) {
        if (item.mimeType === 'application/vnd.google-apps.folder') {
          folders.push(item);
        } else {
          files.push(item);
        }
      }

      log(`  📂 ${folders.length} carpetas, 📄 ${files.length} archivos`);

      const result = {
        folders: [],
        files: files.map(f => ({
          id: f.id,
          name: f.name,
          mimeType: f.mimeType,
          url: f.webViewLink || f.webContentLink
        }))
      };

      // Procesar subcarpetas recursivamente
      for (const folder of folders) {
        const subfolderContents = await this.listFolderContents(folder.id, folder.name);
        result.folders.push({
          id: folder.id,
          name: folder.name,
          mimeType: folder.mimeType,
          contents: subfolderContents
        });
      }

      return result;
    } catch (error) {
      logError(`Error listando carpeta ${folderName}:`, error);
      throw error;
    }
  }

  /**
   * Genera la configuración del vault desde la estructura de Drive
   * @param {string} folderId - ID de la carpeta raíz
   * @returns {Promise<Object>} - Configuración en formato del vault
   */
  async generateVaultFromFolder(folderId) {
    try {
      log('🔄 Generando vault desde Google Drive...');
      
      const structure = await this.listFolderContents(folderId, 'GM vault');
      
      // Convertir estructura de Drive a formato del vault
      const config = this._convertDriveStructureToVault(structure);
      
      log(`✅ Vault generado: ${config.categories.length} categorías raíz`);
      return config;
    } catch (error) {
      logError('Error generando vault:', error);
      throw error;
    }
  }

  /**
   * Convierte la estructura de Drive al formato del vault
   * @param {Object} structure - Estructura de Drive
   * @returns {Object} - Configuración del vault
   * @private
   */
  _convertDriveStructureToVault(structure) {
    const categories = [];

    // Procesar carpetas
    for (const folder of structure.folders || []) {
      const category = {
        name: folder.name,
        pages: [],
        categories: []
      };

      // Procesar archivos directamente en esta carpeta
      if (folder.contents && folder.contents.files) {
        for (const file of folder.contents.files) {
          if (this._isSupportedFileType(file.mimeType)) {
            category.pages.push({
              name: file.name,
              url: file.url || this._generateFileUrl(file.id, file.mimeType),
              visibleToPlayers: false
            });
          }
        }
      }

      // Procesar subcarpetas recursivamente
      if (folder.contents) {
        const subVault = this._convertDriveStructureToVault(folder.contents);
        category.categories = subVault.categories;
        // Los archivos de la raíz de subcarpetas (si no hay subcarpetas) se añaden a pages
        if (subVault.categories.length === 0 && subVault.pages && subVault.pages.length > 0) {
          category.pages.push(...subVault.pages);
        }
      }

      categories.push(category);
    }

    // Procesar archivos en la raíz (si no están dentro de carpetas)
    const rootPages = [];
    if (structure.files) {
      for (const file of structure.files) {
        if (this._isSupportedFileType(file.mimeType)) {
          rootPages.push({
            name: file.name,
            url: file.url || this._generateFileUrl(file.id, file.mimeType),
            visibleToPlayers: false
          });
        }
      }
    }

    return {
      categories,
      pages: rootPages
    };
  }

  /**
   * Verifica si un tipo de archivo es soportado
   * @param {string} mimeType - Tipo MIME del archivo
   * @returns {boolean}
   * @private
   */
  _isSupportedFileType(mimeType) {
    const supportedTypes = [
      'application/vnd.google-apps.document', // Google Docs
      'application/vnd.google-apps.spreadsheet', // Google Sheets
      'application/vnd.google-apps.presentation', // Google Slides
      'application/pdf', // PDFs
      'text/plain', // Texto plano
      'text/html' // HTML
    ];
    return supportedTypes.includes(mimeType);
  }

  /**
   * Genera la URL de un archivo de Google Drive
   * @param {string} fileId - ID del archivo
   * @param {string} mimeType - Tipo MIME
   * @returns {string}
   * @private
   */
  _generateFileUrl(fileId, mimeType) {
    if (mimeType === 'application/vnd.google-apps.document') {
      return `https://docs.google.com/document/d/${fileId}/edit`;
    } else if (mimeType === 'application/vnd.google-apps.spreadsheet') {
      return `https://docs.google.com/spreadsheets/d/${fileId}/edit`;
    } else if (mimeType === 'application/vnd.google-apps.presentation') {
      return `https://docs.google.com/presentation/d/${fileId}/edit`;
    } else {
      return `https://drive.google.com/file/d/${fileId}/view`;
    }
  }
}
