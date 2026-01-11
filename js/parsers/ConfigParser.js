/**
 * @fileoverview Parser de configuración
 * 
 * Parsea y valida configuraciones JSON del vault.
 */

import { Config } from '../models/Config.js';
import { Category } from '../models/Category.js';
import { Page } from '../models/Page.js';
import { log, logWarn, logError } from '../utils/logger.js';

/**
 * Parser de configuración del vault
 */
export class ConfigParser {
  /**
   * Parsea un objeto JSON a un modelo Config
   * @param {Object} json - JSON de configuración
   * @returns {Config}
   */
  parse(json) {
    if (!json) {
      log('ConfigParser: JSON vacío, retornando config vacía');
      return new Config();
    }

    try {
      const categories = this._parseCategories(json.categories || []);
      return new Config({ 
        categories,
        order: json.order || null
      });
    } catch (e) {
      logError('Error parseando configuración:', e);
      return new Config();
    }
  }

  /**
   * Parsea un array de categorías
   * @private
   */
  _parseCategories(categoriesJson) {
    if (!Array.isArray(categoriesJson)) {
      return [];
    }

    return categoriesJson
      .filter(cat => cat && cat.name)
      .map(cat => this._parseCategory(cat));
  }

  /**
   * Parsea una categoría individual
   * @private
   */
  _parseCategory(categoryJson) {
    const pages = this._parsePages(categoryJson.pages || []);
    const subcategories = this._parseCategories(categoryJson.categories || []);

    return new Category(categoryJson.name, {
      pages,
      categories: subcategories,
      collapsed: categoryJson.collapsed || false,
      order: categoryJson.order || null
    });
  }

  /**
   * Parsea un array de páginas
   * @private
   */
  _parsePages(pagesJson) {
    if (!Array.isArray(pagesJson)) {
      return [];
    }

    return pagesJson
      .filter(page => page && page.name && page.url)
      .map(page => this._parsePage(page));
  }

  /**
   * Parsea una página individual
   * @private
   */
  _parsePage(pageJson) {
    return new Page(pageJson.name, pageJson.url, {
      visibleToPlayers: pageJson.visibleToPlayers || false,
      blockTypes: pageJson.blockTypes || null,
      icon: pageJson.icon || null,
      linkedTokenId: pageJson.linkedTokenId || null
    });
  }

  /**
   * Valida una configuración JSON
   * @param {Object} json - JSON a validar
   * @returns {{valid: boolean, errors: string[]}}
   */
  validate(json) {
    const errors = [];

    if (!json) {
      errors.push('Configuración vacía');
      return { valid: false, errors };
    }

    if (!json.categories) {
      errors.push('Falta el campo "categories"');
      return { valid: false, errors };
    }

    if (!Array.isArray(json.categories)) {
      errors.push('"categories" debe ser un array');
      return { valid: false, errors };
    }

    // Validar cada categoría
    json.categories.forEach((cat, index) => {
      const catErrors = this._validateCategory(cat, `categories[${index}]`);
      errors.push(...catErrors);
    });

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Valida una categoría
   * @private
   */
  _validateCategory(category, path) {
    const errors = [];

    if (!category) {
      errors.push(`${path}: categoría vacía`);
      return errors;
    }

    if (!category.name || typeof category.name !== 'string') {
      errors.push(`${path}: falta nombre o no es string`);
    }

    if (category.pages && !Array.isArray(category.pages)) {
      errors.push(`${path}.pages: debe ser un array`);
    } else if (category.pages) {
      category.pages.forEach((page, index) => {
        const pageErrors = this._validatePage(page, `${path}.pages[${index}]`);
        errors.push(...pageErrors);
      });
    }

    if (category.categories && !Array.isArray(category.categories)) {
      errors.push(`${path}.categories: debe ser un array`);
    } else if (category.categories) {
      category.categories.forEach((subcat, index) => {
        const subcatErrors = this._validateCategory(subcat, `${path}.categories[${index}]`);
        errors.push(...subcatErrors);
      });
    }

    return errors;
  }

  /**
   * Valida una página
   * @private
   */
  _validatePage(page, path) {
    const errors = [];

    if (!page) {
      errors.push(`${path}: página vacía`);
      return errors;
    }

    if (!page.name || typeof page.name !== 'string') {
      errors.push(`${path}: falta nombre o no es string`);
    }

    if (!page.url || typeof page.url !== 'string') {
      errors.push(`${path}: falta URL o no es string`);
    }

    if (page.blockTypes && !Array.isArray(page.blockTypes)) {
      errors.push(`${path}.blockTypes: debe ser un array`);
    }

    return errors;
  }

  /**
   * Migra una configuración antigua al formato actual
   * @param {Object} json - JSON antiguo
   * @returns {Object} - JSON migrado
   */
  migrate(json) {
    if (!json) return { categories: [] };

    // Clonar para no modificar el original
    const migrated = JSON.parse(JSON.stringify(json));

    // Asegurar que tiene categories
    if (!migrated.categories) {
      migrated.categories = [];
    }

    // Migrar cada categoría
    migrated.categories = migrated.categories.map(cat => this._migrateCategory(cat));

    return migrated;
  }

  /**
   * Migra una categoría
   * @private
   */
  _migrateCategory(category) {
    if (!category) return null;

    // Asegurar campos requeridos
    const migrated = {
      name: category.name || 'Unnamed Category',
      pages: (category.pages || []).map(p => this._migratePage(p)).filter(p => p),
      categories: (category.categories || []).map(c => this._migrateCategory(c)).filter(c => c)
    };

    // Preservar collapsed si existe
    if (category.collapsed !== undefined) {
      migrated.collapsed = category.collapsed;
    }

    // Preservar order si existe
    if (category.order) {
      migrated.order = category.order;
    }

    return migrated;
  }

  /**
   * Migra una página
   * @private
   */
  _migratePage(page) {
    if (!page || !page.url) return null;

    return {
      name: page.name || 'Unnamed Page',
      url: page.url,
      visibleToPlayers: page.visibleToPlayers || page.visible || false,
      ...(page.blockTypes && { blockTypes: page.blockTypes }),
      ...(page.icon && { icon: page.icon }),
      ...(page.linkedTokenId && { linkedTokenId: page.linkedTokenId })
    };
  }
}

export default ConfigParser;

