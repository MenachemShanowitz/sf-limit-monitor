class StorageError extends Error {
  constructor(message) {
    super('Storage Error: ' + message);
  }
}

export class ResultsStorage {
  constructor(conn) {
    if (!conn) {
      throw new StorageError('Connection is required');
    }
    this.conn = conn;
  }

  async createJob() {
    try {
      const result = await this.conn.sobject('Limit_Monitor_Test_Job__c').create({
        Status__c: 'In Progress'
      });

      if (!result.id) {
        throw new StorageError('Failed to create Limit_Monitor_Test_Job__c');
      }

      return result.id;
      // jsforce will throw an error upon a non-success response when a (single) object is passed into create
    } catch (error) {
      if (error instanceof StorageError) {
        throw error;
      }
      throw new StorageError(`Failed to create Limit_Monitor_Test_Job__c: ${error?.data?.message}`);
    }
  }

  async updateJobStatus(jobId, status, error = null) {
    try {
      const update = {
        Id: jobId,
        Status__c: status,
        ...(error && { Error_Message__c: error.message || String(error) })
      };

      await this.conn.sobject('Limit_Monitor_Test_Job__c').update(update);

      // jsforce will throw an error upon a non-success response when a (single) object is passed into update
    } catch (error) {
      throw new StorageError(`Failed to update Limit_Monitor_Test_Job__c's Job Status: ${error?.data?.message}`);
    }
  }

  async storeTestResult(jobId, testResult) {
    const metrics = testResult.metrics || {};
    
    try {
      const record = {
        Job__c: jobId,
        Class_Name__c: testResult.className,
        Method_Name__c: testResult.methodName,
        Success__c: testResult.success,
        Execution_Time__c: testResult.time,
        Failure_Message__c: testResult.failureMessage || null,
        SOQL_Queries__c: metrics.SOQLQueries?.value,
        Query_Rows__c: metrics.QueryRows?.value,
        SOSL_Queries__c: metrics.SOSLQueries?.value,
        DML_Statements__c: metrics.DMLStatements?.value,
        DML_Rows__c: metrics.DMLRows?.value,
        CPU_Time__c: metrics.CPUTime?.value,
        Heap_Size__c: metrics.HeapSize?.value,
        Callouts__c: metrics.Callouts?.value,
        Email_Invocations__c: metrics.EmailInvocations?.value,
        Future_Calls__c: metrics.FutureCalls?.value,
        Queueable_Jobs__c: metrics.QueueableJobs?.value
      };

      const result = await this.conn.sobject('Limit_Monitor_Test_Result__c').create(record);

      if (!result.id) {
        throw new StorageError('Failed to create Limit_Monitor_Test_Result__c');
      }

      return result.id;

      // jsforce will throw an error upon a non-success response when a (single) object is passed into create
    } catch (error) {
      throw new StorageError(`Failed to create Limit_Monitor_Test_Result__c: ${error?.data?.message}`);
    }
  }

  async storeResults(results) {
    const jobId = await this.createJob();
    
    try {
      const resultIds = [];
      for (const result of results) {
        const resultId = await this.storeTestResult(jobId, result);
        resultIds.push(resultId);
      }

      await this.updateJobStatus(jobId, 'Completed');
      return { jobId, resultIds };
    } catch (error) {
      await this.updateJobStatus(jobId, 'Failed', error);
      throw error;
    }
  }
}
