/**
 * @fileoverview Tests unitarios para ConfigParser
 */

import { describe, it, expect } from '@jest/globals';
import { ConfigParser } from '../../../js/parsers/ConfigParser.js';

describe('ConfigParser', () => {
  let parser;

  beforeEach(() => {
    parser = new ConfigParser();
  });

  describe('parse', () => {
    it('debe parsear configuración válida', () => {
      const json = {
        categories: [
          {
            name: 'NPCs',
            pages: [
              { name: 'Gandalf', url: 'https://notion.so/gandalf' }
            ]
          }
        ]
      };

      const config = parser.parse(json);

      expect(config.categories).toHaveLength(1);
      expect(config.categories[0].name).toBe('NPCs');
      expect(config.categories[0].pages).toHaveLength(1);
      expect(config.categories[0].pages[0].name).toBe('Gandalf');
    });

    it('debe retornar config vacía para JSON nulo', () => {
      const config = parser.parse(null);
      expect(config.categories).toEqual([]);
    });

    it('debe parsear categorías anidadas', () => {
      const json = {
        categories: [
          {
            name: 'Characters',
            categories: [
              {
                name: 'NPCs',
                pages: [{ name: 'Test', url: 'https://...' }]
              }
            ]
          }
        ]
      };

      const config = parser.parse(json);
      
      expect(config.categories[0].categories).toHaveLength(1);
      expect(config.categories[0].categories[0].name).toBe('NPCs');
    });

    it('debe parsear opciones de página', () => {
      const json = {
        categories: [
          {
            name: 'Test',
            pages: [
              {
                name: 'Page',
                url: 'https://notion.so/page',
                visibleToPlayers: true,
                blockTypes: ['quote', 'callout']
              }
            ]
          }
        ]
      };

      const config = parser.parse(json);
      const page = config.categories[0].pages[0];
      
      expect(page.visibleToPlayers).toBe(true);
      expect(page.blockTypes).toEqual(['quote', 'callout']);
    });
  });

  describe('validate', () => {
    it('debe validar configuración correcta', () => {
      const json = {
        categories: [
          { name: 'Test', pages: [{ name: 'Page', url: 'https://...' }] }
        ]
      };

      const result = parser.validate(json);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('debe detectar configuración nula', () => {
      const result = parser.validate(null);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Configuración vacía');
    });

    it('debe detectar categories faltante', () => {
      const result = parser.validate({});
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Falta el campo "categories"');
    });

    it('debe detectar página sin nombre', () => {
      const json = {
        categories: [
          { name: 'Test', pages: [{ url: 'https://...' }] }
        ]
      };

      const result = parser.validate(json);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('falta nombre'))).toBe(true);
    });

    it('debe detectar página sin URL', () => {
      const json = {
        categories: [
          { name: 'Test', pages: [{ name: 'Page' }] }
        ]
      };

      const result = parser.validate(json);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('falta URL'))).toBe(true);
    });
  });

  describe('migrate', () => {
    it('debe migrar campo "visible" a "visibleToPlayers"', () => {
      const json = {
        categories: [
          {
            name: 'Test',
            pages: [{ name: 'Page', url: 'https://...', visible: true }]
          }
        ]
      };

      const migrated = parser.migrate(json);
      expect(migrated.categories[0].pages[0].visibleToPlayers).toBe(true);
    });

    it('debe añadir categories si no existe', () => {
      const migrated = parser.migrate({});
      expect(migrated.categories).toEqual([]);
    });

    it('debe filtrar páginas sin URL', () => {
      const json = {
        categories: [
          {
            name: 'Test',
            pages: [
              { name: 'Valid', url: 'https://...' },
              { name: 'Invalid' }
            ]
          }
        ]
      };

      const migrated = parser.migrate(json);
      expect(migrated.categories[0].pages).toHaveLength(1);
      expect(migrated.categories[0].pages[0].name).toBe('Valid');
    });
  });
});

