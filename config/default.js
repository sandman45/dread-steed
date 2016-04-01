/**
 * Created by matthew.sanders on 1/8/16.
 */
module.exports = {
  maxConnDuration:10.000,
  maxRetries:2,
  errorTypes:['INVALID_SESSION_ID','INVALID_LOGIN','DUPLICATE_VALUE'],
  maxEventListeners:100,
  salesforce: {
    newConn:         true,
    Username:        'geminisysapi@vivint.com.stg',
    Password:        '1wLqgoIf&mHu',
    Endpoint:        'https://test.salesforce.com',
    LastChanged:     '2014-01-01T07:00:00.000Z',
    TargetSystem:    'Salesforce.com STG test sandbox',
    SecurityToken:   'u2lvACtgXXlCNFNGUt481u44',
    IntegrationName: 'SFDCSTG'
  }
};