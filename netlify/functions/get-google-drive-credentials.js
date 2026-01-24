/**
 * Netlify Function para obtener las credenciales de Google Drive
 * Solo disponible cuando hay OWNER_TOKEN (verificado en el cliente)
 * Controlado por variables de entorno:
 * - GM_VAULT_GOOGLE_API_KEY: API Key de Google
 * - GM_VAULT_GOOGLE_CLIENT_ID: Client ID de OAuth
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS'
};

exports.handler = async (event, context) => {
  // Manejar CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: ''
    };
  }

  // Solo permitir método GET
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    // Obtener las credenciales desde variables de entorno
    const apiKey = process.env.GM_VAULT_GOOGLE_API_KEY;
    const clientId = process.env.GM_VAULT_GOOGLE_CLIENT_ID;
    
    // Si no hay credenciales configuradas, retornar null
    if (!apiKey || !clientId) {
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          ...CORS_HEADERS
        },
        body: JSON.stringify({ 
          apiKey: null,
          clientId: null,
          error: 'Google Drive credentials not configured'
        })
      };
    }
    
    // Retornar las credenciales
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        ...CORS_HEADERS
      },
      body: JSON.stringify({ 
        apiKey,
        clientId
      })
    };
  } catch (error) {
    console.error('Error getting Google Drive credentials:', error);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ 
        error: error.message || 'Internal server error',
        apiKey: null,
        clientId: null
      })
    };
  }
};
