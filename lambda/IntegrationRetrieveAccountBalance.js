var fs = require('fs');
var path = require('path');
var moment = require('moment');

var requestUtils = require('./utils/RequestUtils.js');
var dynamoUtils = require('./utils/DynamoUtils.js');
var handlebarsUtils = require('./utils/HandlebarsUtils.js');

const parseString = require('xml2js').parseString;
const stripNS = require('xml2js').processors.stripPrefix;

/**
 * Lambda function that handles loading customer account balance
 */
exports.handler = async(event, context, callback) =>
{

  var contactId = undefined;

  try
  {
    requestUtils.logRequest(event);

    requestUtils.requireParameter('ContactId', event.ContactId);

    contactId = event.ContactId;

    // Load customer state
    var customerState = await dynamoUtils.getParsedCustomerState(process.env.STATE_TABLE, contactId);
    requestUtils.requireParameter('CurrentRule_functionOutputKey', customerState.CurrentRule_functionOutputKey);

    // Mark this integration as RUNNING
    var toUpdate = [ 'IntegrationStatus' ];
    customerState.IntegrationStatus = 'RUN';
    await dynamoUtils.persistCustomerState(process.env.STATE_TABLE, contactId, customerState, toUpdate);

    // Build a request message
    var template = getTemplate('IntegrationRetrieveAccountBalanceRequest');
    var request = handlebarsUtils.template(template, customerState);

    console.log('[INFO] made request: ' + request);

    var response = undefined;

    // Execute the request in mock mode
    if (process.env.MOCK_MODE === 'true')
    {
      response = await buildMockResponse(customerState);
    }
    // Execute the request in end to end mode
    else
    {
      requestUtils.requireParameter('Customer', customerState.Customer);
       //response = await executeRequest(process.env.END_POINT, template);
      throw new Error('Integration not implemented, use MOCK_MODE');
    }

    console.log(`[INFO] got raw response: ${response}`);

    // Parse the response
    var processedResponse = await parseResponse(response);

    console.log(`[INFO] got processed response: ${JSON.stringify(processedResponse)}`);

    // Update state and mark this as complete writing the result into the requested state key
    customerState[customerState.CurrentRule_functionOutputKey] = processedResponse;
    customerState.IntegrationStatus = 'DONE';
    customerState.IntegrationErrorCause = undefined;
    customerState.IntegrationEnd = moment().utc().format();
    toUpdate = [ 'IntegrationStatus', 'IntegrationEnd', 'IntegrationErrorCause', customerState.CurrentRule_functionOutputKey ];
    await dynamoUtils.persistCustomerState(process.env.STATE_TABLE, contactId, customerState, toUpdate);
  }
  catch (error)
  {
    // Update the failure state
    if (contactId !== undefined)
    {
      console.log('[ERROR] recording failure in state', error);
      customerState.IntegrationStatus = 'ERROR';
      customerState.IntegrationErrorCause = error.message;
      customerState.IntegrationEnd = moment().utc().format();
      customerState[customerState.CurrentRule_functionOutputKey] = undefined;
      toUpdate = [ 'IntegrationStatus', 'IntegrationEnd', 'IntegrationErrorCause', customerState.CurrentRule_functionOutputKey ];
      await dynamoUtils.persistCustomerState(process.env.STATE_TABLE, contactId, customerState, toUpdate);
    }
    // Log the failure but skip state recording due to missing contact id
    else
    {
      console.log('[ERROR] Skipping recording failure as no ContactId available', error);
    }

    throw error;
  }
};

/**
 * Parses an XML response and returns the state to set
 */
async function parseResponse(rawResponse)
{
  try
  {
    var stateResponse = {};

    var parsedResponse = await parseXML(rawResponse);

    console.log(`[INFO] got parsed response: ${JSON.stringify(parsedResponse, null, 2)}`);

    var retrieveAccountBalanceResponse = parsedResponse.Request.RetrieveAccountBalanceResponse;

    // It succeeded, extract the account balance
    if (retrieveAccountBalanceResponse.SuccessFlag === 'true')
    {
      console.log('[INFO] found success response: ' + rawResponse);
      
      stateResponse.Success = 'true';

      var accountBalance = retrieveAccountBalanceResponse.AccountBalance;
      var sumOverdue = 0;

      var keys = Object.keys(accountBalance);

      keys.forEach(key => {
        stateResponse[key] = accountBalance[key];

        if (key.startsWith('PastDue'))
        {
          sumOverdue += +accountBalance[key];
        }
      });

      stateResponse.PastDueTotal = '' + sumOverdue;
    }
    // It failed record the error
    else
    {
      console.log('[ERROR] found error response: ' + rawResponse);
      stateResponse.Success = 'false';
      var keys = Object.keys(retrieveAccountBalanceResponse);
      keys.forEach(key => {
        stateResponse[key] = retrieveAccountBalanceResponse[key];
      });
    }

    console.log(`[INFO] made state response: ${JSON.stringify(stateResponse, null, 2)}`);

    return stateResponse;
  }
  catch (error)
  {
    console.log('[ERROR] failed to parse XML response', error);
    throw error;
  }    
}

/**
 * Parses XML converting to JSON objects
 */
function parseXML(xml) 
{
  var parserConfig = {
    tagNameProcessors: [stripNS],
    ignoreAttrs: true,
    explicitArray: false,
    emptyTag: null
  };

  return new Promise((resolve, reject) => {
    parseString(xml, parserConfig, function (err, json) {
      if (err)
      {
        reject(err);
      }
      else
      {
        resolve(json);
      }
    });
  });
}

/**
 * Loads a templated mock message
 */
function getTemplate(templateName)
{
  var resolved = path.resolve(process.env.LAMBDA_TASK_ROOT, 'lambda/mock/' + templateName + '.hbs');

  console.log('[INFO] found resolved: ' + resolved);

  try
  {
    var content = fs.readFileSync(resolved, 'utf8');
    console.log('[INFO] found content: ' + content);
    return content;
  }
  catch (error)
  {
    console.log('[ERROR] Failed to load template: ' + resolved, error);
    throw error;
  }
};

/**
 * Given customer state, build a valid service response
 */
async function buildMockResponse(customerState)
{
  try
  {

    var customerScenario = '0';

    if (customerState.CustomerScenario !== undefined)
    {
      customerScenario = customerState.CustomerScenario;
    }

    var accountMockData = 
    {
      // TODO add more example accounts mapping to various response scenarios
      '0': {
        Success: true,
        SumBalance: 0,
        Delay: 0,
        Template: 'IntegrationRetrieveAccountBalanceResponseSuccess'
      },
      '1': {
        Success: true,
        SumBalance: 10000,
        Delay: 0,
        Template: 'IntegrationRetrieveAccountBalanceResponseSuccess'
      },
      '2': {
        Success: true,
        SumBalance: 20000,
        PastDueDays1To30: 1000,
        Delay: 0,
        Template: 'IntegrationRetrieveAccountBalanceResponseSuccess'
      },
      '3': {
        Success: true,
        SumBalance: 30000,
        PastDueDays1To30: 1000,
        PastDueDays30To60: 1000,
        Delay: 3000,
        Template: 'IntegrationRetrieveAccountBalanceResponseSuccess'
      },  
      '4': {
        Success: true,
        SumBalance: 30000,
        PastDueDays1To30: 1000,
        PastDueDays30To60: 1000,
        PastDueDays60To90: 1000,
        Delay: 1000,
        Template: 'IntegrationRetrieveAccountBalanceResponseSuccess'
      },
      '5': {
        Success: true,
        SumBalance: 10000,
        Delay: 1000,
        Template: 'IntegrationRetrieveAccountBalanceResponseSuccess'
      },
      '6': {
        Success: true,
        SumBalance: 20000,
        PastDueDays1To30: 1000,
        Delay: 1000,
        Template: 'IntegrationRetrieveAccountBalanceResponseSuccess'
      },
      '7': {
        Success: true,
        SumBalance: 30000,
        PastDueDays1To30: 1000,
        PastDueDays30To60: 1000,
        Delay: 3000,
        Template: 'IntegrationRetrieveAccountBalanceResponseSuccess'
      },  
      '8': {
        Success: true,
        SumBalance: 30000,
        PastDueDays1To30: 1000,
        PastDueDays30To60: 1000,
        PastDueDays60To90: 1000,
        Delay: 1000,
        Template: 'IntegrationRetrieveAccountBalanceResponseSuccess'
      },
      '9': {
        Success: false,
        Delay: 3000,
        Template: 'IntegrationRetrieveAccountBalanceResponseError'
      }
    };

    var selectedAccount = accountMockData[customerState.CustomerScenario];

    if (selectedAccount === undefined)
    {
      selectedAccount = accountMockData['0'];
    }

    await sleep(selectedAccount.Delay);

    customerState.Mock = selectedAccount;
    var responseTemplate = getTemplate(selectedAccount.Template);

    console.log('[INFO] got template raw: ' + responseTemplate);

    var templateResult = handlebarsUtils.template(responseTemplate, customerState);

    console.log('[INFO] got templated result: ' + templateResult);

    return templateResult;
  }
  catch (error)
  {
    console.log('[ERROR] failed to template mock response', error);
    throw error;
  }
}

/**
 * Sleep for time millis
 */
function sleep (time) 
{
  console.log('[INFO] sleeping for: ' + time);
  return new Promise((resolve) => setTimeout(resolve, time));
}
