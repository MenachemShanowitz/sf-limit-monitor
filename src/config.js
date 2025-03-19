import fs from 'fs/promises';

export const API_VERSION = '58.0';

class ConfigError extends Error {
  constructor(message) {
    super('Config Error: ' + message);
  }
}

export class ConfigManager {
  constructor(configPath) {
    if (!configPath) {
      throw new ConfigError('Config path must be provided.');
    }
    this.configPath = configPath;
    this.config = null;
  }

  async load() {
    try {
      const content = await fs.readFile(this.configPath, 'utf8');
      this.config = this.normalizeConfig(JSON.parse(content));
      return this.config;
    } catch (error) {
      throw new ConfigError(`Failed to load config: ${error.message}`);
    }
  }

  async save() {
    try {
      await fs.writeFile(
        this.configPath,
        JSON.stringify(this.config, null, 2),
        'utf8'
      );
    } catch (error) {
      throw new ConfigError(`Failed to save config: ${error.message}`);
    }
  }

  normalizeConfig(userConfig) {
    if (!userConfig.auth || !userConfig.auth.type || !userConfig.auth.loginUrl) {
      throw new ConfigError('Auth configuration must specify type and loginUrl');
    }
    
    return {
      auth: userConfig.auth,
      tests: userConfig.tests || {}
    };
  }

  get() {
    if (!this.config) {
      throw new ConfigError('Config not loaded. Call load() first.');
    }
    return this.config;
  }

  set(newConfig) {
    this.config = this.normalizeConfig(newConfig);
  }
}
