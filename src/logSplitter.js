/**
 * Handles splitting combined test execution logs into individual test method results.
 * This is necessary because when running entire test classes (vs individual methods),
 * Salesforce returns a single combined log for all test methods.
 */
export class LogSplitter {
  /**
   * Splits a combined debug log into individual test method executions
   * @param {string} classLog - The complete debug log from test class execution
   * @returns {Array<{methodName: string, log: string}>} Array of individual test method logs
   */
  static splitTestLogs(classLog) {
    if (!classLog) return [];

    const testRuns = [];
    const lines = classLog.split('\n');
    let currentTestMethod = null;
    let currentLog = [];

    for (const line of lines) {
      // Identifies the start of a test method execution in Apex logs. 
      // Pattern is "CODE_UNIT_STARTED" followed by any characters until last "|" immediately followed by text.<captured_text>() 
      // Example log line: 12:21:45.56 (57002971)|CODE_UNIT_STARTED|[EXTERNAL]|01paj00000CUNUv|testclass.testmethod()
      const startMatch = line.match(/CODE_UNIT_STARTED\|.*\|\w+\.(\w+)\(\)/);
      if (startMatch) {
        const [, methodName] = startMatch;
        currentTestMethod = methodName;
        // start a new log section for this test method
        currentLog = [line];
        // move on to the next line
        continue;
      }

      // Identifies the end of a test method execution in Apex logs.
      // Pattern is "CODE_UNIT_FINISHED|" immediately followed by text.<captured_text>()
      // Example log line: 12:21:45.56 (64054058)|CODE_UNIT_FINISHED|testclass.testmethod()
      const endMatch = line.match(/CODE_UNIT_FINISHED\|\w+\.(\w+)\(\)/);
      if (endMatch && currentTestMethod && 
          endMatch[1] === currentTestMethod) {
        currentLog.push(line);
        // add completed test method log section to "testRuns" and then reset tracking variables
        testRuns.push({
          methodName: currentTestMethod,
          log: currentLog.join('\n')
        });
        currentTestMethod = null;
        currentLog = [];
        continue;
      }

      // Add line to current test method log, if we're currently collecting for a test method
      if (currentTestMethod) {
        currentLog.push(line);
      }
    }

    return testRuns;
  }
}
