var fs = require('fs');
var path = require('path');
var moment = require('moment');

var requestUtils = require('./utils/RequestUtils.js');
var dynamoUtils = require('./utils/DynamoUtils.js');

/**
 * Lambda function that handles validation of BSB numbers
 * API documentation: 
 *  https://foxsportsau.atlassian.net/wiki/spaces/IPDP/pages/18309609643/BSB+API+Design#BSBAPIDesign-1.5InvokingtheAPI
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
    requestUtils.requireParameter('BankAccountBSB', customerState.BankAccountBSB);
    requestUtils.requireParameter('CurrentRule_functionOutputKey', customerState.CurrentRule_functionOutputKey);

    // Mark this integration as RUNNING
    var toUpdate = [ 'IntegrationStatus' ];
    customerState.IntegrationStatus = 'RUN';
    await dynamoUtils.persistCustomerState(process.env.STATE_TABLE, contactId, customerState, toUpdate);

    // Build a request message
    var requestUrl = getRequestUrl(customerState);

    console.log('[INFO] made request url: ' + requestUrl);

    var response = undefined;

    // Execute the request in mock mode
    if (process.env.MOCK_MODE === 'true')
    {
      response = await buildMockResponse(customerState);
    }
    // Execute the request in end to end mode
    else
    {
       //response = await executeRequest(process.env.END_POINT, requestUrl);
      throw new Error('Integration not implemented, use MOCK_MODE');
    }

    console.log(`[INFO] got raw response: ${response}`);

    // Parse the response
    var processedResponse = await processResponse(response);

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
 * Builds a request url
 */
function getRequestUrl(customerState)
{
  var requestUrl = `${process.env.BSB_VALIDATE_URL}${customerState.BankAccountBSB}`;

  console.log('[INFO] made request url: ' + requestUrl);

  return requestUrl;
}

/**
 * Processes a response form the BSB validation service
 * Details are a bit light on, we only have a happy case
 */
async function processResponse(rawResponse, customerState)
{
  try
  {
    var stateResponse = {};

    if (rawResponse !== undefined)
    {
      stateResponse.Success = 'true';

      // Copy in the BSB response data
      var keys = Object.keys(rawResponse);

      keys.forEach(key => {
        stateResponse[key] = rawResponse[key];
      });
    }
    else
    {
      stateResponse.Success = 'false';
    }

    console.log(`[INFO] made state response: ${JSON.stringify(stateResponse, null, 2)}`);

    return stateResponse;
  }
  catch (error)
  {
    console.log('[ERROR] failed to process BSB Validation response', error);
    throw error;
  }    
}

/**
 * Given customer state, build a valid service response
 */
async function buildMockResponse(customerState)
{
  try
  {
    var bsbNumber = customerState.BankAccountBSB;

    var mockData = 
    {
      // ANZ
      '012002': {
        Delay: 1000,
        BSBData: {
          BSB: '012002',
          BankCode: 'ANZ',
          BSBName: 'ANZ Smart Choice',
          BSBAddress: '115 Pitt Street',
          BSBSuburb: 'Sydney',
          BSBState: 'NSW',
          BSBPostCode: '2000'
        }
      },
      // CBA
      '064000': {
        Delay: 5000,
        BSBData: {
          BSB: '064000',
          BankCode: 'CBA',
          BSBName: 'Commonwealth Bank of Australia',
          BSBAddress: '240 Queen St Brisbane',
          BSBSuburb: 'Brisbane',
          BSBState: 'QLD',
          BSBPostCode: '4000'
        }
      },
      // NAB
      '082001': {
        Delay: 2000,
        BSBData: {
          BSB: '082001',
          BankCode: 'NAB',
          BSBName: 'National Australia Bank',
          BSBAddress: 'Ground Floor 333 George St',
          BSBSuburb: 'Sydney',
          BSBState: 'QLD',
          BSBPostCode: '2000'
        }
      },
      'nomatch': {
        Delay: 3000
      }
    };

    var matchedBSB = mockData[bsbNumber];

    // I am just making this up untilmwe get the 
    // full error specification from Dhana (TCS)
    if (matchedBSB === undefined)
    {
      matchedBSB = mockData['nomatch'];
    }

    await sleep(matchedBSB.Delay);

    console.log('Got matched result: ' + JSON.stringify(matchedBSB, null, 2));

    return matchedBSB.BSBData;
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
