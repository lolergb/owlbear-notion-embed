#!/usr/bin/env node

/**
 * Script de prueba para verificar que la API de Notion funciona
 * 
 * Uso:
 *   node test-notion-api.js
 * 
 * Asegúrate de que config.js tenga tu token configurado
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Leer config.js
let config;
try {
  const configPath = join(__dirname, 'config.js');
  const configContent = readFileSync(configPath, 'utf8');
  
  // Extraer el token usando regex (simple, para pruebas)
  const tokenMatch = configContent.match(/NOTION_API_TOKEN\s*=\s*["']([^"']+)["']/);
  const pagesMatch = configContent.match(/NOTION_PAGES\s*=\s*\[([\s\S]*?)\];/);
  
  if (!tokenMatch) {
    console.error('❌ No se encontró NOTION_API_TOKEN en config.js');
    console.log('💡 Asegúrate de que config.js tenga tu token configurado');
    process.exit(1);
  }
  
  const token = tokenMatch[1];
  
  if (token === 'tu_token_de_notion_aqui' || !token) {
    console.error('❌ El token no está configurado en config.js');
    console.log('💡 Edita config.js y reemplaza "tu_token_de_notion_aqui" con tu token real');
    process.exit(1);
  }
  
  console.log('✅ Token encontrado en config.js');
  console.log(`   Token: ${token.substring(0, 10)}...${token.substring(token.length - 5)}`);
  
  // Extraer URLs de páginas
  if (pagesMatch) {
    const pagesContent = pagesMatch[1];
    const urlMatches = pagesContent.matchAll(/url:\s*["']([^"']+)["']/g);
    const urls = Array.from(urlMatches).map(m => m[1]);
    
    if (urls.length > 0) {
      console.log(`\n✅ ${urls.length} página(s) configurada(s):`);
      urls.forEach((url, i) => {
        console.log(`   ${i + 1}. ${url}`);
      });
      
      // Probar con la primera URL
      if (urls[0] && !urls[0].includes('...')) {
        console.log('\n🧪 Probando API con la primera página...');
        await testNotionAPI(token, urls[0]);
      } else {
        console.log('\n⚠️  No hay URLs válidas para probar (algunas tienen "...")');
      }
    } else {
      console.log('\n⚠️  No se encontraron URLs de páginas en config.js');
    }
  }
  
} catch (error) {
  if (error.code === 'ENOENT') {
    console.error('❌ No se encontró config.js');
    console.log('💡 Copia config.example.js a config.js y completa los datos:');
    console.log('   cp config.example.js config.js');
  } else {
    console.error('❌ Error:', error.message);
  }
  process.exit(1);
}

async function testNotionAPI(token, url) {
  try {
    // Extraer ID de página
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('-');
    if (pathParts.length === 0) {
      console.error('❌ No se pudo extraer el ID de la URL');
      return;
    }
    
    const lastPart = pathParts[pathParts.length - 1];
    const pageId = lastPart.substring(0, 32);
    const formattedId = `${pageId.substring(0, 8)}-${pageId.substring(8, 12)}-${pageId.substring(12, 16)}-${pageId.substring(16, 20)}-${pageId.substring(20, 32)}`;
    
    console.log(`   ID extraído: ${formattedId}`);
    
    // Hacer petición a la API
    console.log('   Haciendo petición a la API de Notion...');
    const response = await fetch(`https://api.notion.com/v1/blocks/${formattedId}/children`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error(`\n❌ Error de API: ${response.status} ${response.statusText}`);
      
      if (errorData.code === 'unauthorized') {
        console.error('   El token no es válido o no tiene permisos');
        console.log('   💡 Verifica que:');
        console.log('      1. El token sea correcto');
        console.log('      2. La integración tenga acceso a esta página');
        console.log('      3. La página esté compartida con la integración en Notion');
      } else if (errorData.code === 'object_not_found') {
        console.error('   La página no existe o no es accesible');
        console.log('   💡 Verifica que la URL sea correcta');
      } else {
        console.error('   Detalles:', JSON.stringify(errorData, null, 2));
      }
      return;
    }
    
    const data = await response.json();
    const blocks = data.results || [];
    
    console.log(`\n✅ ¡Éxito! Se obtuvieron ${blocks.length} bloque(s)`);
    
    if (blocks.length > 0) {
      console.log('\n📋 Tipos de bloques encontrados:');
      const blockTypes = {};
      blocks.forEach(block => {
        const type = block.type;
        blockTypes[type] = (blockTypes[type] || 0) + 1;
      });
      
      Object.entries(blockTypes).forEach(([type, count]) => {
        console.log(`   - ${type}: ${count}`);
      });
      
      console.log('\n✅ La API de Notion está funcionando correctamente');
      console.log('💡 Ahora puedes probar la extensión en Owlbear Rodeo');
    } else {
      console.log('\n⚠️  La página no tiene bloques (puede estar vacía)');
    }
    
  } catch (error) {
    console.error('\n❌ Error al probar la API:', error.message);
    if (error.message.includes('fetch')) {
      console.log('   💡 Verifica tu conexión a internet');
    }
  }
}

