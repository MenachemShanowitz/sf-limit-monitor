# Salesforce Limit Monitor

Track changes in governor limit usage (e.g., SOQL queries) in a Salesforce org over time using automated Apex test execution and log analysis.

## Features

- 🔐 Authenticate using Client Credentials OAuth Flow
- 📜 Choose any unit tests to track, including log heavy ones
- 📊 Captures all available metrics. Including: 
  - SOQL Queries and SOQL Rows
  - DML statements and DML rows
  - CPU time usage
  - Heap size
  - Number of queueable jobs
  - Actual run time
  - Success and errors
- 📦 Results stored in custom objects in the Salesforce org
- 🖥️ CLI interface for CI/CD compatibility

## Get Started

### Prerequisites
- Node.js 18+

### Installation
```bash
git clone https://github.com/MenachemShanowitz/sf-limit-monitor.git
cd sf-limit-monitor
npm install
```

### Authentication
Before using this tool, you must set up a connected app in your Salesforce org with the "Manage user data via APIs (api)" scope enabled. 

This tool currently supports only the OAuth 2.0 Client Credentials Flow for secure server-to-server authentication. Read more here: https://developer.salesforce.com/blogs/2023/03/using-the-client-credentials-flow-for-easier-api-authentication

### Configuration

To configure this program for your Salesforce org, create a JSON file adhering to the structure below. This configuration file serves two purposes:

**1. Authentication Details**  
Specifies the client credentials required to access your Salesforce org.

**2. Test Selection**  
Identifies which tests to track.

> **Note:**  
> To track all available tests, leave the tests section empty and run the `discover-tests` command to auto-populate it with existing tests.

The JSON file will be used with the `--config` flag in all CLI commands:

```json
{
  "auth": {
    "type": "client_credentials",
    "clientId": "YOUR_CONNECTED_APP_CLIENT_ID",
    "clientSecret": "YOUR_CONNECTED_APP_CLIENT_SECRET",
    "loginUrl": "https://mydomain.my.salesforce.com"
  },
  "tests": {
    "classes": [
      {
        "className": "MyTestClass",
        "methods": ["testMethod1", "testMethod2"]
      }
    ]
  }
}
```

### Post Install
1. Run below once to deploy custom objects to org to store results
```bash
npx sf-limit-monitor deploy-metadata --config config/settings.example.json
```
2. Assign "Limit Monitor User" permission set to the connecting user (designated in the client credentials connected app)

### Usage
```bash

# OPTIONAL: Discover available test classes (this command will update the tests section of your config file)
npx sf-limit-monitor discover-tests --config config/settings.example.json
 
# Execute all configured tests and store results
npx sf-limit-monitor run --config config/settings.example.json
```

## Data Model
Results are stored in these objects:

### Limit_Monitor_Test_Job__c
Tracks overall test execution jobs

| Field           | Type      | Description                     |
|-----------------|-----------|---------------------------------|
| Status__c       | Picklist  | Job status (Completed/Failed)   |

### Limit_Monitor_Test_Result__c
Stores detailed metrics for individual test method executions

| Field                | Type          | Description                           |
|---------------------|---------------|---------------------------------------|
| Job__c              | Lookup        | Reference to parent Test Job          |
| Class_Name__c       | Text(255)     | Apex test class name                  |
| Method_Name__c      | Text(255)     | Test method name                      |
| Success__c          | Checkbox      | Test execution status                 |
| Execution_Time__c   | Number        | Total execution time (ms)             |
| CPU_Time__c         | Number        | CPU time consumed (ms)                |
| SOQL_Queries__c     | Number        | Number of SOQL queries executed       |
| Query_Rows__c       | Number        | Total rows retrieved by SOQL          |
| SOSL_Queries__c     | Number        | Number of SOSL queries executed       |
| DML_Statements__c   | Number        | Number of DML operations              |
| DML_Rows__c         | Number        | Total rows modified by DML            |
| Heap_Size__c        | Number        | Maximum heap size used (bytes)        |
| Callouts__c         | Number        | Number of callouts made               |
| Email_Invocations__c| Number        | Number of emails sent                 |
| Future_Calls__c     | Number        | Number of future method calls         |
| Queueable_Jobs__c   | Number        | Number of queueable jobs enqueued     |
| Failure_Message__c  | Long Text Area| Error details if test failed          |

## Reports and Alerts
In the current version, the program stores results from each job run and individual test run separately. It does not, however, link the current job to the immediately preceding one.

For alerts on changes, you will need to set up custom automation in Salesforce or sync the job data to another system. 

I did, however, include a report "Limit Monitor Results over Time" that clearly displays SOQL changes over time per unit test. This report can be adapted to track other metrics on a timescale of you choosing, allowing you observe trends at a glance.

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.
