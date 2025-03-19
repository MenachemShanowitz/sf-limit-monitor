const LIMIT_MAPPINGS = {
  'Number of SOQL queries': 'SOQLQueries',
  'Number of query rows': 'QueryRows',
  'Number of SOSL queries': 'SOSLQueries',
  'Number of DML statements': 'DMLStatements',
  'Number of DML rows': 'DMLRows',
  'Maximum CPU time': 'CPUTime',
  'Maximum heap size': 'HeapSize',
  'Number of callouts': 'Callouts',
  'Number of Email Invocations': 'EmailInvocations',
  'Number of future calls': 'FutureCalls',
  'Number of queueable jobs added to the queue': 'QueueableJobs',
  'Number of Mobile Apex push calls': 'MobilePushCalls'
};

export class LogParser {
  static parseLimitUsage(log) {
    if (!log) return null;

    // Looks for all lines immediately following "|LIMIT_USAGE_FOR_NS|(default)|" until it hits the next timestamp.
    // All lines that contain the limit information for the default namespace (i.e. not a managed package) follow this pattern
    const limitSections = [...log.matchAll(/\|LIMIT_USAGE_FOR_NS\|\(default\)\|\n((?:.*\n)*?)(\d{2}:\d{2}:\d{2}|$)/g)];
    if (!limitSections.length) return null;

    const metrics = {};
    
    // Processes all limit sections and gets the highest value of all of them (per each individual limit), instead of looking only
    // at the last section. This is because a test with Test.startTest() Test.stopTest() can have the more important code situated
    // in the startTest context and thus the more important limits will be in the middle of the log.
    // The area with the limit with the highest usage is likely the more important one to track.
    limitSections.forEach(match => {
      const section = match[1];
      section.split('\n').forEach(line => {
        // The pattern is essentially: <captured_text> then a colon, then whitespace then <captured_digits> then "out of" then <captured_digits>
        // Example from log: Number of SOQL queries: 0 out of 100
        const metricMatch = line.match(/([^:]+):\s*(\d+)\s+out of\s+(\d+)/);

        if (metricMatch) {
          const [, metricName, value, limit] = metricMatch;
          const normalizedName = LIMIT_MAPPINGS[metricName.trim()];
          
          if (normalizedName) {
            const numValue = parseInt(value, 10);
            if (!metrics[normalizedName] || numValue > metrics[normalizedName].value) {
              metrics[normalizedName] = {
                value: numValue,
                limit: parseInt(limit, 10)
              };
            }
          }
        }
      });
    });
    
    return metrics;
  }
}
