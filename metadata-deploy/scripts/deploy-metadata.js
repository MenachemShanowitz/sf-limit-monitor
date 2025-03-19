import jsforce from 'jsforce';
import { promises as fs } from 'fs';
import path from 'path';
import { authenticate } from '../../src/auth.js';
import JSZip from 'jszip';

class MetadataDeployError extends Error {
  constructor(message, details = null) {
    super(message);
    this.name = 'MetadataDeployError';
    this.details = details;
  }
}

class MetadataDeployer {
  static API_VERSION = '62.0';
  static POLL_INTERVAL = 1000; // 1 second
  static MAX_POLL_TIME = 600000; // 10 minutes

  constructor(conn) {
    if (!conn) {
      throw new MetadataDeployError('Connection is required');
    }
    this.conn = conn;
  }

  /**
   * Deploy metadata to Salesforce
   * @param {Object} metadata - Metadata configuration
   * @param {Object} options - Deployment options
   * @returns {Promise<Object>} Deployment status
   */
  async deploy(metadata, options = {}) {
    try {
      console.log('Starting metadata deployment...');
      
      const deployResult = await this.conn.metadata.deploy(metadata, {
        rollbackOnError: true,
        ...options
      });

      const status = await this.pollDeploymentStatus(deployResult.id);
      this.logDeploymentResult(status);
      
      if (!status.success) {
        throw new MetadataDeployError('Deployment failed', status.details);
      }

      return status;
    } catch (error) {
      if (error instanceof MetadataDeployError) {
        throw error;
      }
      throw new MetadataDeployError(`Deployment error: ${error}`, error);
    }
  }

  /**
   * Poll deployment status until complete or timeout
   * @param {string} deploymentId - The deployment ID to check
   * @returns {Promise<Object>} Final deployment status
   */
  async pollDeploymentStatus(deploymentId) {
    const startTime = Date.now();
    let status;

    do {
      if (Date.now() - startTime > MetadataDeployer.MAX_POLL_TIME) {
        throw new MetadataDeployError('Deployment timed out');
      }

      status = await this.conn.metadata.checkDeployStatus(deploymentId);
      
      if (!status.done) {
        await new Promise(resolve => setTimeout(resolve, MetadataDeployer.POLL_INTERVAL));
      }
    } while (!status.done);

    return status;
  }

  /**
   * Log deployment result details
   * @param {Object} status - Deployment status object
   */
  logDeploymentResult(status) {
    if (status.success) {
      console.log('✓ Deployment completed successfully!');
      if (status.numberComponentsDeployed) {
        console.log(`  Components deployed: ${status.numberComponentsDeployed}`);
      }
    } else {
      console.error('✗ Deployment failed:');
      if (status.details?.componentFailures) {
        const failures = Array.isArray(status.details.componentFailures) 
          ? status.details.componentFailures 
          : [status.details.componentFailures];
        
        failures.forEach(failure => {
          console.error(`  - ${failure.fileName}: ${failure.problem}`);
        });
      }
    }
  }
}

// CLI entry point
async function main() {
  const configPath = parseArgs(process.argv.slice(2));
  
  try {
    const config = await loadConfig(configPath);
    const authResult = await authenticate(config.auth);
    
    const conn = new jsforce.Connection({
      accessToken: authResult.accessToken,
      instanceUrl: authResult.instanceUrl
    });

    const deployer = new MetadataDeployer(conn);
    
    // Create zip file from package directory
    const zip = new JSZip();
    const PACKAGE_DIR = 'metadata-deploy/package';

    async function addFileToZip(filePath) {
      const content = await fs.readFile(filePath);
      const normalizedPath = filePath.replace(/\\/g, '/');
      const relativePath = normalizedPath.split(`${PACKAGE_DIR}/`)[1];
      zip.file(relativePath, content);
    }

    async function processDirectory(dir) {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      const processEntries = entries.map(entry => {
        const fullPath = path.join(dir, entry.name);
        return entry.isDirectory() ? processDirectory(fullPath) : addFileToZip(fullPath);
      });
      await Promise.all(processEntries);
    }

    await processDirectory(PACKAGE_DIR);
    
    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });

    await deployer.deploy(zipBuffer, {
      singlePackage: true,
      checkOnly: false
    });
    process.exit(0);
  } catch (error) {
    console.error(
     `Deployment failed. ${error}`
    );
    process.exit(1);
  }
}

/**
 * Parse command line arguments
 * @param {string[]} args - Command line arguments
 * @returns {string} Config file path
 */
function parseArgs(args) {
  const configIndex = args.indexOf('--config') + 1;
  if (!configIndex || !args[configIndex]) {
    throw new Error('Config file not provided. Use --config <path>');
  }
  return args[configIndex];
}

/**
 * Load and parse config file
 * @param {string} configPath - Path to config file
 * @returns {Promise<Object>} Parsed config
 */
async function loadConfig(configPath) {
  try {
    const content = await fs.readFile(configPath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    throw new Error(`Failed to load config: ${error.message}`);
  }
}

// Run if called directly
if (process.argv[1].endsWith('deploy-metadata.js')) {
  await main();
}
