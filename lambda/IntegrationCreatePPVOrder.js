var fs = require('fs');
var path = require('path');
var moment = require('moment');

var requestUtils = require('./utils/RequestUtils.js');
var dynamoUtils = require('./utils/DynamoUtils.js');
var handlebarsUtils = require('./utils/HandlebarsUtils.js');

const parseString = require('xml2js').parseString;
const stripNS = require('xml2js').processors.stripPrefix;

/**
 * Lambda function that handles Kenan Create PPV Order
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

    // TODO enable these required request parameters
    // requestUtils.requireParameter('Customer', customerState.Customer);
    // requestUtils.requireParameter('SelectedEvent', customerState.SelectedEvent);
    // requestUtils.requireParameter('PPVServiceList', customerState.PPVServiceList);

    // Mark this integration as RUNNING
    var toUpdate = [ 'IntegrationStatus' ];
    customerState.IntegrationStatus = 'RUN';
    await dynamoUtils.persistCustomerState(process.env.STATE_TABLE, contactId, customerState, toUpdate);

    // Build a request message
    var template = getTemplate('IntegrationCreatePPVOrderRequest');
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
       //response = await executeRequest(process.env.END_POINT, template);
      throw new Error('Integration not implemented, use MOCK_MODE');
    }

    console.log(`[INFO] got raw response: ${response}`);

    // Parse the response
    var processedResponse = await parseResponse(response);

    console.log(`[INFO] got processed response: ${JSON.stringify(processedResponse)}`);

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
Parsing the response  
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
 
     if (parsedResponse.Request.CreatePpvOrderResponse.SuccessFlag === 'true')
     {
       stateResponse.OrderId = parsedResponse.Request.CreatePpvOrderResponse.OrderId;
    
       stateResponse.Success = 'true';
     }
     else
     {
       console.log('[ERROR] found error response: ' + rawResponse);
       stateResponse.Success = 'false';
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
        //Success Response when order has been created with Service Internal ID
      '0': {
        Success: true,
        OrderId: '134085255000',
        Delay: 0,
        Template: 'IntegrationCreatePPVOrderResponseSuccess'
      },
      '1': {
        Success: true,
        OrderId: '134085255001',
        Delay: 0,
        Template: 'IntegrationCreatePPVOrderResponseSuccess'
      },
      '2': {
        Success: true,
        OrderId: '134085255002',
        Delay: 0,
        Template: 'IntegrationCreatePPVOrderResponseSuccess'
      },
      '3': {
        Success: true,
        OrderId: '134085255003',
        Delay: 0,
        Template: 'IntegrationCreatePPVOrderResponseSuccess'
      },
      '4': {
        Success: true,
        OrderId: '134085255004',
        Delay: 0,
        Template: 'IntegrationCreatePPVOrderResponseSuccess'
      },
      '5': {
        Success: true,
        OrderId: '134085255005',
        Delay: 0,
        Template: 'IntegrationCreatePPVOrderResponseSuccess'
      },
      '6': {
        Success: true,
        OrderId: '134085255006',
        Delay: 0,
        Template: 'IntegrationCreatePPVOrderResponseSuccess'
      },
      '7': {
        Success: true,
        OrderId: '134085255007',
        Delay: 0,
        Template: 'IntegrationCreatePPVOrderResponseSuccess'
      },
      '8': {
        Success: true,
        OrderId: '134085255008',
        Delay: 0,
        Template: 'IntegrationCreatePPVOrderResponseSuccess'
      },
      // Error response
      '9': {
        Success: false,
        Delay: 5000,
        Template: 'IntegrationCreatePPVOrderResponseError'
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