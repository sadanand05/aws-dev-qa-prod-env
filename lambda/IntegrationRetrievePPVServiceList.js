var fs = require('fs');
var path = require('path');
var moment = require('moment');

var requestUtils = require('./utils/RequestUtils.js');
var dynamoUtils = require('./utils/DynamoUtils.js');
var handlebarsUtils = require('./utils/HandlebarsUtils.js');

const parseString = require('xml2js').parseString;
const stripNS = require('xml2js').processors.stripPrefix;

/**
 * Lambda function that handles retrieving the PPV services listing from
 * Kenan which represents the list of PPV enabled devices a customer has
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
    var template = getTemplate('IntegrationRetrievePPVServiceListRequest');
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

    var retrievePpvServiceListResponse = parsedResponse.Request.RetrievePpvServiceListResponse;

    // It succeeded, extract the list of services
    if (retrievePpvServiceListResponse.SuccessFlag === 'true')
    {
      console.log('[INFO] found success response: ' + rawResponse);
      
      stateResponse.Success = 'true';

      stateResponse.Services = [];
      stateResponse.Inventories = [];

      // Track unique serial numbers for inventories
      var serialNumbers = new Set();

      var serviceList = retrievePpvServiceListResponse.PpvAccount.PpvServiceList;

      if (!Array.isArray(serviceList.PpvService))
      {
        var temp = serviceList.PpvService;
        serviceList.PpvService = [];
        serviceList.PpvService.push(temp);
      }

      // Iterate each service copying out just the bits we need to place a PPV order
      serviceList.PpvService.forEach(service => 
      {
        stateResponse.Services.push({
          ViewId: service.ViewId,
          ServiceInternalId: service.ServiceInternalId,
          ServiceInternalIdResets: service.ServiceInternalIdResets
        });

        // Handle one or more inventories
        if (!Array.isArray(service.InventoryList.Inventory))
        {
          var temp = service.InventoryList.Inventory;
          service.InventoryList.Inventory = [];
          service.InventoryList.Inventory.push(temp);
        }

        // Extract unique accross all services
        service.InventoryList.Inventory.forEach(inventory => 
        {
          // Only collect unique serial numbers
          if (!serialNumbers.has(inventory.SerialNumber))
          {
            stateResponse.Inventories.push({
              InventoryTypeId: inventory.InventoryTypeId,
              SerialNumber: inventory.SerialNumber,
              ViewId: inventory.ViewId
            });
            serialNumbers.add(inventory.SerialNumber);
          }
        });

      });
    }
    // It failed so record the error
    else
    {
      console.log('[ERROR] found error response: ' + rawResponse);
      stateResponse.Success = 'false';
      var keys = Object.keys(retrievePpvServiceListResponse);
      keys.forEach(key => {
        stateResponse[key] = retrievePpvServiceListResponse[key];
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
        Delay: 0,
        Services: [
          {
            ViewId: '15162297000',
            ServiceInternalId: '69346600',
            ServiceInternalIdResets: '0',
            Inventories: [
              {
                InventoryTypeId: '210',
                SerialNumber: '000229547195',
                ViewId: '171488483'
              }
            ]
          }
        ],
        Template: 'IntegrationRetrievePPVServiceListResponseSuccess'
      },
      '1': {
        Success: true,
        Services: [
          {
            ViewId: '15162297010',
            ServiceInternalId: '69346610',
            ServiceInternalIdResets: '0',
            Inventories: [
              {
                InventoryTypeId: '210',
                SerialNumber: '000229547195',
                ViewId: '171488483'
              }
            ]
          },
          {
            ViewId: '15162297011',
            ServiceInternalId: '69346611',
            ServiceInternalIdResets: '0',
            Inventories: [
              {
                InventoryTypeId: '210',
                SerialNumber: '000229547195',
                ViewId: '171488483'
              }
            ]
          }
        ],
        Delay: 0,
        Template: 'IntegrationRetrievePPVServiceListResponseSuccess'
      },
      '2': {
        Success: true,
        Services: [
          {
            ViewId: '15162297020',
            ServiceInternalId: '69346620',
            ServiceInternalIdResets: '0',
            Inventories: [
              {
                InventoryTypeId: '209',
                SerialNumber: '000229547195',
                ViewId: '171488483'
              }
            ]
          },
          {
            ViewId: '15162297021',
            ServiceInternalId: '69346621',
            ServiceInternalIdResets: '0',
            Inventories: [
              {
                InventoryTypeId: '210',
                SerialNumber: '000229547196',
                ViewId: '171488483'
              }
            ]
          }
        ],
        Delay: 0,
        Template: 'IntegrationRetrievePPVServiceListResponseSuccess'
      },
      '3': {
        Success: true,
        Services: [
          {
            ViewId: '15162297030',
            ServiceInternalId: '69346630',
            ServiceInternalIdResets: '0',
            Inventories: [
              {
                InventoryTypeId: '210',
                SerialNumber: '000229547195',
                ViewId: '171488483'
              },
              {
                InventoryTypeId: '209',
                SerialNumber: '000229547196',
                ViewId: '171488484'
              }
            ]
          },
          {
            ViewId: '15162297031',
            ServiceInternalId: '69346631',
            ServiceInternalIdResets: '0',
            Inventories: [
              {
                InventoryTypeId: '210',
                SerialNumber: '000229547195',
                ViewId: '171488483'
              },
              {
                InventoryTypeId: '209',
                SerialNumber: '000229547196',
                ViewId: '171488484'
              }
            ]
          }
        ],
        Delay: 0,
        Template: 'IntegrationRetrievePPVServiceListResponseSuccess'
      },
      '4': {
        Success: true,
        Delay: 0,
        Services: [
          {
            ViewId: '15162297040',
            ServiceInternalId: '69346640',
            ServiceInternalIdResets: '0',
            Inventories: [
              {
                InventoryTypeId: '201',
                SerialNumber: '000229547195',
                ViewId: '171488483'
              }
            ]
          }
        ],
        Template: 'IntegrationRetrievePPVServiceListResponseSuccess'
      },
      '5': {
        Success: true,
        Delay: 0,
        Services: [
          {
            ViewId: '15162297050',
            ServiceInternalId: '69346650',
            ServiceInternalIdResets: '0',
            Inventories: [
              {
                InventoryTypeId: '202',
                SerialNumber: '000229547195',
                ViewId: '171488483'
              }
            ]
          }
        ],
        Template: 'IntegrationRetrievePPVServiceListResponseSuccess'
      },
      '6': {
        Success: true,
        Delay: 0,
        Services: [
          {
            ViewId: '15162297060',
            ServiceInternalId: '69346660',
            ServiceInternalIdResets: '0',
            Inventories: [
              {
                InventoryTypeId: '207',
                SerialNumber: '000229547195',
                ViewId: '171488483'
              }
            ]
          }
        ],
        Template: 'IntegrationRetrievePPVServiceListResponseSuccess'
      },
      '7': {
        Success: true,
        Delay: 0,
        Services: [
          {
            ViewId: '15162297070',
            ServiceInternalId: '69346670',
            ServiceInternalIdResets: '0',
            Inventories: [
              {
                InventoryTypeId: '501',
                SerialNumber: '000229547195',
                ViewId: '171488483'
              }
            ]
          }
        ],
        Template: 'IntegrationRetrievePPVServiceListResponseSuccess'
      },
      '8': {
        Success: true,
        Delay: 0,
        Services: [
          {
            ViewId: '15162297080',
            ServiceInternalId: '69346680',
            ServiceInternalIdResets: '0',
            Inventories: [
              {
                InventoryTypeId: '502',
                SerialNumber: '000229547195',
                ViewId: '171488483'
              }
            ]
          }
        ],
        Template: 'IntegrationRetrievePPVServiceListResponseSuccess'
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
