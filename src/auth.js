/**
 * Authentication module using OAuth 2.0 Client Credentials Flow
 * 
 * Read more: https://developer.salesforce.com/blogs/2023/03/using-the-client-credentials-flow-for-easier-api-authentication
 */

import jsforce from 'jsforce';

class AuthenticationError extends Error {
  constructor(message) {
    super('Authentication Error: ' + message);
  }
}

export async function authenticate(config) {

  if (!config.loginUrl?.startsWith('https://')) {
    throw new AuthenticationError('Login URL must use HTTPS protocol');
  }

  const requiredFields = ['clientId', 'clientSecret'];
  const missing = requiredFields.filter(field => !config[field]);

  if (missing.length) {
    throw new AuthenticationError(`Missing required fields: ${missing.join(', ')}`);
  }

  try {
    const conn = new jsforce.Connection({
      instanceUrl: config.loginUrl,
      oauth2: { 
        clientId : config.clientId,
        clientSecret : config.clientSecret,
        loginUrl: config.loginUrl
      },
    });
    
    await conn.authorize({ grant_type: "client_credentials" })

    return conn;
  } catch (error) {
    throw new AuthenticationError(
      `Auth Request failed. ${error}`
    );
  }
}
