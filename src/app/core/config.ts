import { isDevMode } from '@angular/core';

/**
 * URL base de la API.
 * - Desarrollo (`ng serve`): '/api', que proxy.conf.json reenvia al backend (sin CORS).
 * - Produccion (`ng build`): URL absoluta del App Service. El origen del frontend publicado
 *   debe estar en CORS_ORIGINS del backend.
 */
export const API_URL = isDevMode() ? '/api' : 'https://app-kyndryl-jose.azurewebsites.net/api';
