import { Command } from 'commander';
import { ConfigManager } from './config.js';
import { authenticate } from './auth.js';
import { TestRunner } from './testRunner.js';
import { LogParser } from './logParser.js';
import { ResultsStorage } from './resultsStorage.js';
import jsforce from 'jsforce';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const program = new Command();

program
  .name('sf-limit-monitor')
  .description('Track changes in governor limit usage (e.g., SOQL queries) in a Salesforce org over time using automated Apex test execution and log analysis.')
  .version('1.0.0');

program
  .command('run')
  .description('Run tests and store governor limit usage metrics')
  .option('-c, --config <path>', 'Path to config file')
  .action(async (options) => {
    try {
      // Load config
      const configManager = new ConfigManager(options.config);
      await configManager.load();
      const config = configManager.get();

      // Authenticate
      const conn = await authenticate(config.auth);

      // Initialize test runner
      const runner = new TestRunner();
      await runner.initialize(conn);

      // Initialize storage
      const storage = new ResultsStorage(conn);

      // Run tests
      const testsToRun = config.tests.classes;
      if (testsToRun.length === 0) {
        throw new Error('No tests configured. Run "discover-tests" first or edit config.');
      }

      console.log('Running tests...');
      const results = await runner.runTestMethods(testsToRun);

      // Parse logs and extract metrics
      console.log('Processing results...');
      const processedResults = results.map(result => ({
        ...result,
        metrics: LogParser.parseLimitUsage(result.debugLog)
      }));

      // Store results
      console.log('Storing results...');
      const { jobId, resultIds } = await storage.storeResults(processedResults);

      console.log(`Test execution complete!`);
      console.log(`Job ID: ${jobId}`);
      console.log(`Results stored: ${resultIds.length}`);

    } catch (error) {
      console.error(error.message);
      process.exit(1);
    }
  });

program
  .command('discover-tests')
  .description('Discover all test classes and methods and update config file')
  .option('-c, --config <path>', 'Path to config file')
  .action(async (options) => {
    try {
      const configManager = new ConfigManager(options.config);
      await configManager.load();
      const config = configManager.get();
      console.log(`This command will update the config file at ${options.config} with discovered test classes.`);
      const authResult = await authenticate(config.auth);
      const conn = new jsforce.Connection({
        accessToken: authResult.accessToken,
        instanceUrl: authResult.instanceUrl
      });

      console.log('Discovering test classes...');
      const query = `
        SELECT Id, Name, Body 
        FROM ApexClass 
        WHERE NamespacePrefix = null 
        ORDER BY Name
      `;

      const classes = await conn.query(query);
      const testClasses = [];

      for (const cls of classes.records) {

        // Skip if class doesn't contain any test indicators
        if (!/(@istest|testmethod)/i.test(cls.Body)) {
          continue;
        }

        // Handles both @IsTest and testmethod. Additionally considers access modifiers, parentheses (SeeAllData=true), and unrelated annotations
        const methodRegex = /(?:@istest(?:\([^)]*\))?[\s\n\r]*(?:@\w+[\s\n\r]*)*(?:private|public|protected)?\s+static|(?:(?:private|public|protected)\s+)?static\s+testmethod)\s+void\s+(\w+)\s*\(/gim;        
        const methods = [];
        let match;
        
        while (match = methodRegex.exec(cls.Body)) {
          methods.push(match[1]);
        }

        if (methods.length > 0) {
          testClasses.push({
            className: cls.Name,
            methods
          });
        }
      }

      // Update config with discovered tests
      config.tests.classes = testClasses;
      await configManager.save();

      console.log('Test discovery complete!');
      console.log(`Found ${testClasses.length} test classes`);
      console.log('Updated configuration file');

    } catch (error) {
      console.error(error.message);
      process.exit(1);
    }
  });

program
  .command('deploy-metadata')
  .description('Deploy custom objects to your Salesforce org for storing test results')
  .option('--config <path>', 'Path to config file')
  .action(async (options) => {
    const scriptPath = fileURLToPath(new URL('../metadata-deploy/scripts/deploy-metadata.js', import.meta.url));
    const child = spawn('node', [scriptPath, '--config', options.config], { stdio: 'inherit' });
    child.on('close', (code) => process.exit(code));
  });

program.parse();
