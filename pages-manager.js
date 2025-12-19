/**
 * Sistema de gestión de páginas y categorías
 * Guarda la configuración en localStorage para evitar deploys
 */

const STORAGE_KEY = 'notion-pages-config';

// Estructura de datos:
// {
//   categories: [
//     {
//       id: "uuid",
//       name: "Categoría",
//       pages: [
//         { id: "uuid", name: "Página", url: "https://..." }
//       ]
//     }
//   ]
// }

/**
 * Obtener la configuración desde localStorage
 */
export function getPagesConfig() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.error('Error al leer configuración:', e);
  }
  return { categories: [] };
}

/**
 * Guardar la configuración en localStorage
 */
export function savePagesConfig(config) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    return true;
  } catch (e) {
    console.error('Error al guardar configuración:', e);
    return false;
  }
}

/**
 * Inicializar con páginas por defecto si no hay configuración
 */
export function initializeDefaultPages(defaultPages) {
  const config = getPagesConfig();
  
  // Si no hay categorías, crear una por defecto con las páginas iniciales
  if (config.categories.length === 0 && defaultPages && defaultPages.length > 0) {
    config.categories = [
      {
        id: generateId(),
        name: "General",
        pages: defaultPages.map(page => ({
          id: generateId(),
          name: page.name,
          url: page.url
        }))
      }
    ];
    savePagesConfig(config);
  }
  
  return config;
}

/**
 * Generar un ID único
 */
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

/**
 * Agregar una categoría
 */
export function addCategory(name) {
  const config = getPagesConfig();
  const newCategory = {
    id: generateId(),
    name: name,
    pages: []
  };
  config.categories.push(newCategory);
  savePagesConfig(config);
  return newCategory;
}

/**
 * Eliminar una categoría
 */
export function deleteCategory(categoryId) {
  const config = getPagesConfig();
  config.categories = config.categories.filter(cat => cat.id !== categoryId);
  savePagesConfig(config);
}

/**
 * Agregar una página a una categoría
 */
export function addPageToCategory(categoryId, pageName, pageUrl) {
  const config = getPagesConfig();
  const category = config.categories.find(cat => cat.id === categoryId);
  
  if (category) {
    category.pages.push({
      id: generateId(),
      name: pageName,
      url: pageUrl
    });
    savePagesConfig(config);
    return true;
  }
  return false;
}

/**
 * Eliminar una página
 */
export function deletePage(categoryId, pageId) {
  const config = getPagesConfig();
  const category = config.categories.find(cat => cat.id === categoryId);
  
  if (category) {
    category.pages = category.pages.filter(page => page.id !== pageId);
    savePagesConfig(config);
    return true;
  }
  return false;
}

/**
 * Actualizar una página
 */
export function updatePage(categoryId, pageId, pageName, pageUrl) {
  const config = getPagesConfig();
  const category = config.categories.find(cat => cat.id === categoryId);
  
  if (category) {
    const page = category.pages.find(p => p.id === pageId);
    if (page) {
      page.name = pageName;
      page.url = pageUrl;
      savePagesConfig(config);
      return true;
    }
  }
  return false;
}

/**
 * Actualizar nombre de categoría
 */
export function updateCategoryName(categoryId, newName) {
  const config = getPagesConfig();
  const category = config.categories.find(cat => cat.id === categoryId);
  
  if (category) {
    category.name = newName;
    savePagesConfig(config);
    return true;
  }
  return false;
}

/**
 * Obtener todas las páginas planas (sin categorías)
 */
export function getAllPagesFlat() {
  const config = getPagesConfig();
  return config.categories.flatMap(category => 
    category.pages.map(page => ({
      ...page,
      categoryName: category.name
    }))
  );
}

