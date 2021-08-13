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
    var template = getTemplate('IntegrationRetrievePaymentProfileRequest');
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
    var retrievePaymentProfileResponse = await parseResponse(response);

    console.log(`[INFO] got processed response: ${JSON.stringify(retrievePaymentProfileResponse)}`);

    customerState[customerState.CurrentRule_functionOutputKey] = retrievePaymentProfileResponse;
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
 * Parses an XML response and returns a simplified response:
 * {
 *   "Success": "true|false",
 *   "PaymentProfileType": "NONE|CARD|BANK|OTHER"
 * }
 * 
 * This can be used to determine if the customer has a recurring 
 * direct debit.
 */
async function parseResponse(rawResponse)
{
  try
  {
    var stateResponse = {
      PaymentProfileType: 'NONE', // CARD, BANK
    };

    var parsedResponse = await parseXML(rawResponse);

    console.log(`[INFO] got parsed response: ${JSON.stringify(parsedResponse, null, 2)}`);

    // TODO note that this could be a list of payment profile responses
    var retrievePaymentProfileResponse = parsedResponse.Request.RetrievePaymentProfileResponse;

    if (retrievePaymentProfileResponse.SuccessFlag === 'true')
    {
      console.log('[ERROR] found success response: ' + rawResponse);
      stateResponse.Success = 'true';

      var paymentProfileList = retrievePaymentProfileResponse.PaymentProfileList;

      if (paymentProfileList === undefined || paymentProfileList === null || paymentProfileList.length === 0)
      {
        console.log('[INFO] no payment profiles found');
      }
      else
      {
        console.log('[INFO] found payment profiles');

        /**
         * TODO is it valid to just look at the first recurring payment here?
         */
        var recurring = undefined;

        // TODO rhis needs testing for multiple payment profiles
        if (Array.isArray(paymentProfileList))
        {
          recurring = paymentProfileList.find(profile => profile.PaymentProfile.OngoingFlag === ' true');
        }
        else if (paymentProfileList.PaymentProfile.OngoingFlag === 'true')
        {
          recurring = paymentProfileList;
        }

        if (recurring !== undefined)
        {
          console.log('[INFO] found recurring: ' + JSON.stringify(recurring, null, 2));

          if (recurring.PaymentProfile.CardType !== undefined)
          {
            stateResponse.PaymentProfileType = 'CARD';
          }
          else if (recurring.PaymentProfile.BankAccountNumber !== undefined)
          {
            stateResponse.PaymentProfileType = 'BANK';
          }
          /**
           * TODO are we missing a scenario for debit cards here?
           */
          else
          {
            console.log('[ERROR] unhandled scenario for ongoing payment with unknown type: ' + JSON.stringify(recurring, null, 2));
            stateResponse.PaymentProfileType = 'OTHER';
          }

        }
        else
        {
          console.log('[INFO] found no recurring payment profile');
        }
      }
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
      // No direct debit - TODO confirm this scenario
      '0': {
        Success: true,
        OngoingFlag: false,
        Delay: 0,
        Template: 'IntegrationRetrievePaymentProfileNoneResponseSuccess'
      },
      // Bank account number
      '1': {
        Success: true,
        OngoingFlag: true,
        PaymentProfileId: '32539430000',
        BankAccountNumber: '10682365',
        BSBNumber: '064000',
        Delay: 0,
        Template: 'IntegrationRetrievePaymentProfileBankAccountResponseSuccess'
      },
      // Credit card
      '2': {
        Success: true,
        OngoingFlag: true,
        PaymentProfileId: '32539430001',
        CardNumber: '4673647364763746376', // Tokenised card number?
        MaskedCardNumber: '4534112...342', // TODO is this the card token?
        CardExpiryDate: '1223',
        CardType: 'MSC',
        Delay: 0,
        Template: 'IntegrationRetrievePaymentProfileCreditCardResponseSuccess'
      },
      // No direct debit - TODO confirm this scenario
      '3': {
        Success: true,
        OngoingFlag: false,
        Delay: 2000,
        Template: 'IntegrationRetrievePaymentProfileNoneResponseSuccess'
      },
      // Bank account number
      '4': {
        Success: true,
        OngoingFlag: true,
        PaymentProfileId: '32539430000',
        BankAccountNumber: '10682365',
        BSBNumber: '064000',
        Delay: 3000,
        Template: 'IntegrationRetrievePaymentProfileBankAccountResponseSuccess'
      },
      // Credit card
      '5': {
        Success: true,
        OngoingFlag: true,
        PaymentProfileId: '32539430001',
        CardNumber: '4673647364763746376', // Tokenised card number?
        MaskedCardNumber: '4534112...342', // TODO is this the card token?
        CardExpiryDate: '1223',
        CardType: 'MSC',
        Delay: 5000,
        Template: 'IntegrationRetrievePaymentProfileCreditCardResponseSuccess'
      },
      // No direct debit - TODO confirm this scenario
      '6': {
        Success: true,
        OngoingFlag: false,
        Delay: 1000,
        Template: 'IntegrationRetrievePaymentProfileNoneResponseSuccess'
      },
      // Bank account number
      '7': {
        Success: true,
        OngoingFlag: true,
        PaymentProfileId: '32539430000',
        BankAccountNumber: '10682365',
        BSBNumber: '064000',
        Delay: 3000,
        Template: 'IntegrationRetrievePaymentProfileBankAccountResponseSuccess'
      },
      // Timeout response
      '8': {
        Success: true,
        OngoingFlag: true,
        PaymentProfileId: '32539430001',
        CardNumber: '4673647364763746376', // Tokenised card number?
        MaskedCardNumber: '4534112...342', // TODO is this the card token?
        CardExpiryDate: '1223',
        CardType: 'MSC',
        Delay: 16000,
        Template: 'IntegrationRetrievePaymentProfileCreditCardResponseSuccess'
      },
      // Error response
      '9': {
        Success: false,
        Delay: 5000,
        Template: 'IntegrationRetrievePaymentProfileResponseError'
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
