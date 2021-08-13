var fs = require('fs');
var path = require('path');
var moment = require('moment');

var requestUtils = require('./utils/RequestUtils.js');
var dynamoUtils = require('./utils/DynamoUtils.js');
var handlebarsUtils = require('./utils/HandlebarsUtils.js');

const parseString = require('xml2js').parseString;
const stripNS = require('xml2js').processors.stripPrefix;

/**
 *Created by Lal Krishna
 * Lambda function that handles Kenan Execute Inventory Actions
 *For three different Inventory Actions(Resync Smart Card,Initialize Smart Card and Reboot Setupbox )
 */
exports.handler = async(event, context, callback) =>
{

  var contactId = undefined;

  try
  {
    requestUtils.logRequest(event);

    requestUtils.requireParameter('ContactId', event.ContactId);

    contactId = event.ContactId;    //Unique Contact ID for an calling customer

    // Load customer state
    var customerState = await dynamoUtils.getParsedCustomerState(process.env.STATE_TABLE, contactId);
    requestUtils.requireParameter('Inventory', customerState.Inventory);
    requestUtils.requireParameter('InventoryAction', customerState.Inventory);
    requestUtils.requireParameter('CurrentRule_functionOutputKey', customerState.CurrentRule_functionOutputKey);

    console.log(`[INFO] executing action: ${customerState.InventoryAction} against serial number: ${customerState.Inventory.SerialNumber}`)

    // Mark this integration as RUNNING
    var toUpdate = [ 'IntegrationStatus' ];
    customerState.IntegrationStatus = 'RUN';
    await dynamoUtils.persistCustomerState(process.env.STATE_TABLE, contactId, customerState, toUpdate);

    // Build a request message
    var template = getTemplate('IntegrationExecuteInventoryActionRequest');
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

      toUpdate = [ 'IntegrationStatus', 'IntegrationEnd', 'IntegrationErrorCause'];

      // TODO this is a better pattern to handle retries
      if (customerState.CurrentRule_functionOutputKey !== undefined)
      {
        customerState[customerState.CurrentRule_functionOutputKey] = undefined;
        toUpdate.push(customerState.CurrentRule_functionOutputKey);
      }

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
    var stateResponse = {
      Success: 'false'
    };

    var parsedResponse = await parseXML(rawResponse);

    console.log(`[INFO] got processed response: ${JSON.stringify(parsedResponse, null, 2)}`);
    if (parsedResponse.Request.ExecuteInventoryActionResponse.SuccessFlag === 'true')
    {
      stateResponse.Success = 'true';
    }
    else
    {
      console.log('[ERROR] found error response: ' + rawResponse);
      stateResponse.Success = 'false';
    }

    console.log(`[INFO] made state response: ${JSON.stringify(stateResponse, null, 2)}`);
    console.log("Operation Completed Successfully.");   
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
 * 101 resync
 * 103 initialise
 * 108 reboot
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
      '0': {
        Success: true,
        Delay: 1000,
        Template: 'IntegrationExecuteInventoryActionResponseSuccess'
      },
      '1': {
        Success: true,
        Delay: 1000,
        Template: 'IntegrationExecuteInventoryActionResponseSuccess'
      },
      '2': {
        Success: true,
        Delay: 1000,
        Template: 'IntegrationExecuteInventoryActionResponseSuccess'
      },
      '3': {
        Success: true,
        Delay: 1000,
        Template: 'IntegrationExecuteInventoryActionResponseError'
      },
      '4': {
        Success: true,
        Delay: 1000,
        Template: 'IntegrationExecuteInventoryActionResponseError'
      },
      '5': {
        Success: true,
        Delay: 1000,
        Template: 'IntegrationExecuteInventoryActionResponseError'
      },
      '6': {
        Success: true,
        Delay: 1000,
        Template: 'IntegrationExecuteInventoryActionResponseError'
      },
      '7': {
        Success: true,
        Delay: 1000,
        Template: 'IntegrationExecuteInventoryActionResponseError'
      },
      '8': {
        Success: true,
        Delay: 1000,
        Template: 'IntegrationExecuteInventoryActionResponseError'
      },
      '9': {
        Success: false,
        Delay: 3000,
        Template: 'IntegrationExecuteInventoryActionResponseError'
      }
    };

    var selectedAccount = accountMockData[customerScenario];

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
