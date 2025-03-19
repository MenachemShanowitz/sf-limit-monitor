import soap from 'soap';
import path from 'path';
import { fileURLToPath } from 'url';
import { API_VERSION } from './config.js';
import { LogSplitter } from './logSplitter.js';

const DEFAULT_LOG_LEVELS = {
  Db: 'NONE',
  Workflow: 'NONE',
  Validation: 'NONE',
  Callout: 'NONE',
  Apex_code: 'NONE',
  Apex_profiling: 'INFO',
  Visualforce: 'NONE',
  System: 'NONE'
};

export class TestRunner {
  constructor() {
    this.config = {
      apiVersion: API_VERSION,
      logLevels: DEFAULT_LOG_LEVELS
    };
  }

  async initialize(conn) {
    const wsdlPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '../resources/apex.wsdl');
    
    this.client = await soap.createClientAsync(wsdlPath, {
      endpoint: `${conn.instanceUrl}/services/Soap/s/${this.config.apiVersion}`
    });

    this.client.addSoapHeader({
      SessionHeader: { sessionId: conn.accessToken }
    }, '', '', "http://soap.sforce.com/2006/08/apex");

    this.client.addSoapHeader({
      DebuggingHeader: {
        categories: Object.entries(this.config.logLevels).map(([category, level]) => ({
          category,
          level
        }))
      }
    }, '', '', "http://soap.sforce.com/2006/08/apex");

    // Fix SOAP namespace issues
    this.client.soapHeaders = this.client.soapHeaders.map(header => 
      header.replace('xmlns:="http://soap.sforce.com/2006/08/apex"', '')
    );
  }

  /**
   * Runs all test methods in a given class.
   * 
   * We run entire test classes instead of individual methods because this is the only way to have specified debug 
   * log levels properly respected by the Apex SOAP API. None of the API formulations that allow for
   * specification of individual test methods respect specified log levels.
   * 
   * This is very important because large logs can be cropped by Salesforce. This ensures minimal log size, 
   * kept to exactly and only what's needed. Minimal log levels more than compensates for all method logs being combined.
   * 
   * After the entire class is run, the single class log file is split into its individual method runs
   */
  async runTestClass(className) {
    if (!this.client) {
      throw new Error('TestRunner not initialized. Call initialize() first.');
    }

    const request = {
      RunTestsRequest: {
        classes: [className],
        maxFailedTests: -1,
        skipCodeCoverage: true
      }
    };

    try {
      const result = await this.client.runTestsAsync(request);
      const fullTestClassLog = result[2]?.DebuggingInfo?.debugLog;
      const individualTestMethodLogs = LogSplitter.splitTestLogs(fullTestClassLog);
      const logSectionByTestMethodName = new Map(individualTestMethodLogs.map(log => [log.methodName, log.log]));
      
      // Combine successes and failures into one array with source type
      const allTests = [
        ...(result[0].result.successes || []).map(test => ({ ...test, success: true })),
        ...(result[0].result.failures || []).map(test => ({ ...test, success: false }))
      ];

      return allTests.map(test => ({
        className,
        methodName: test.methodName,
        success: test.success,
        failureMessage: !test.success ? test.message : null,
        time: test.time,
        debugLog: logSectionByTestMethodName.get(test.methodName) || '',
        classRunResult: {
          ...result
        }
      }));
    } catch (error) {
      throw new Error(`Test execution failed: ${error.message}`);
    }
  }

  async runTestMethods(tests) {
    const allResults = [];
    for (const test of tests) {
      const allMethodResultsInClass = await this.runTestClass(test.className);
      // Filter to only requested methods
      allResults.push(...allMethodResultsInClass.filter(r => test.methods.includes(r.methodName)));
    }
    return allResults;
  }
}
