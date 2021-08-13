var fs = require('fs');
var path = require('path');
var moment = require('moment');

var requestUtils = require('./utils/RequestUtils.js');
var dynamoUtils = require('./utils/DynamoUtils.js');
var handlebarsUtils = require('./utils/HandlebarsUtils.js');

const parseString = require('xml2js').parseString;
const stripNS = require('xml2js').processors.stripPrefix;

/**
 * Lambda function that searches for a customer
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
    requestUtils.requireParameter('Customer', customerState.Customer);
    requestUtils.requireParameter('CurrentRule_functionOutputKey', customerState.CurrentRule_functionOutputKey);

    // Mark this integration as RUNNING
    var toUpdate = [ 'IntegrationStatus' ];
    customerState.IntegrationStatus = 'RUN';
    await dynamoUtils.persistCustomerState(process.env.STATE_TABLE, contactId, customerState, toUpdate);

    // Grab the account number
    var accountNumber = customerState.Customer.AccountNumber;

    // Build a request message
    var template = getTemplate('IntegrationSearchCustomerRequest');
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

    console.log(`[INFO] got parsed response: ${JSON.stringify(parsedResponse, null, 2)}`);

    if (parsedResponse.Request.SearchCustomerResponse.SuccessFlag === 'true')
    {
      // For now we are ony interested in inventory data from search customer

      stateResponse.AccountInternalId = parsedResponse.Request.SearchCustomerResponse.Account.AccountInternalId;
      stateResponse.ActiveDate = parsedResponse.Request.SearchCustomerResponse.Account.ActiveDate;
      stateResponse.AccountExternalId = parsedResponse.Request.SearchCustomerResponse.Account.AccountExternalId;
      stateResponse.AccountExternalIdType = parsedResponse.Request.SearchCustomerResponse.Account.AccountExternalIdType;
      stateResponse.AccountStatus = parsedResponse.Request.SearchCustomerResponse.Account.AccountStatus;
      stateResponse.AccountStatusDt = parsedResponse.Request.SearchCustomerResponse.Account.AccountStatusDt;
      stateResponse.AccountType = parsedResponse.Request.SearchCustomerResponse.Account.AccountType;
      stateResponse.AcctSegId = parsedResponse.Request.SearchCustomerResponse.Account.AcctSegId;
      stateResponse.BillAddress1 = parsedResponse.Request.SearchCustomerResponse.Account.BillAddress1;
      stateResponse.BillCity = parsedResponse.Request.SearchCustomerResponse.Account.BillCity;
      stateResponse.BillFname = parsedResponse.Request.SearchCustomerResponse.Account.BillFname;
      stateResponse.BillLname = parsedResponse.Request.SearchCustomerResponse.Account.BillLname;
      stateResponse.BillNamePre = parsedResponse.Request.SearchCustomerResponse.Account.BillNamePre;
      stateResponse.BillPeriod = parsedResponse.Request.SearchCustomerResponse.Account.BillPeriod;
      stateResponse.BillSequenceNum = parsedResponse.Request.SearchCustomerResponse.Account.BillSequenceNum;
      stateResponse.BillState = parsedResponse.Request.SearchCustomerResponse.Account.BillState;
      stateResponse.BillZip = parsedResponse.Request.SearchCustomerResponse.Account.BillZip;
      stateResponse.BillingFrequency = parsedResponse.Request.SearchCustomerResponse.Account.BillingFrequency;
      stateResponse.ChargeThreshold = parsedResponse.Request.SearchCustomerResponse.Account.ChargeThreshold;
      stateResponse.CollectionIndicator = parsedResponse.Request.SearchCustomerResponse.Account.CollectionIndicator;
      stateResponse.CollectionStatus = parsedResponse.Request.SearchCustomerResponse.Account.CollectionStatus;
      stateResponse.Converted = parsedResponse.Request.SearchCustomerResponse.Account.Converted;
      stateResponse.CreditRating = parsedResponse.Request.SearchCustomerResponse.Account.CreditRating;
      stateResponse.CustPhone1 = parsedResponse.Request.SearchCustomerResponse.Account.CustPhone1;
      stateResponse.CyclicalThreshol = parsedResponse.Request.SearchCustomerResponse.Account.CyclicalThreshol;
      stateResponse.DateActive = parsedResponse.Request.SearchCustomerResponse.Account.DateActive;
      stateResponse.DateCreated = parsedResponse.Request.SearchCustomerResponse.Account.DateCreated;
      stateResponse.ExrateClass = parsedResponse.Request.SearchCustomerResponse.Account.ExrateClass;
      stateResponse.LanguageCode = parsedResponse.Request.SearchCustomerResponse.Account.LanguageCode;
      stateResponse.MktCode = parsedResponse.Request.SearchCustomerResponse.Account.MktCode;
      stateResponse.NextBillDate = parsedResponse.Request.SearchCustomerResponse.Account.NextBillDate;
      stateResponse.NoBill = parsedResponse.Request.SearchCustomerResponse.Account.NoBill;
      stateResponse.AccountRateClass = parsedResponse.Request.SearchCustomerResponse.Account.AccountRateClass;
      stateResponse.VipCode = parsedResponse.Request.SearchCustomerResponse.Account.VipCode;
      stateResponse.PaymentProfileId = parsedResponse.Request.SearchCustomerResponse.Account.PaymentProfileId;
      stateResponse.EasyPaySetup = parsedResponse.Request.SearchCustomerResponse.Account.EasyPaySetup;
      stateResponse.EasyPayMethod = parsedResponse.Request.SearchCustomerResponse.Account.EasyPayMethod;
      if(parsedResponse.Request.SearchCustomerResponse.Account.ExtendedData !== undefined && parsedResponse.Request.SearchCustomerResponse.Account.ExtendedData.ExtendedDataParam !== undefined){
        var length = parsedResponse.Request.SearchCustomerResponse.Account.ExtendedData.ExtendedDataParam.length;
        for(var i = 0 ; i < length ; i++)
        {
            stateResponse.ExtendedData.ExtendedDataParam.ParamId = parsedResponse.Request.SearchCustomerResponse.Account.ExtendedData.ExtendedDataParam[i].ParamId;
            stateResponse.ExtendedData.ExtendedDataParam.ParamValue = parsedResponse.Request.SearchCustomerResponse.Account.ExtendedData.ExtendedDataParam[i].ParamValue;
            stateResponse.ExtendedData.ExtendedDataParam.ParamName = parsedResponse.Request.SearchCustomerResponse.Account.ExtendedData.ExtendedDataParam[i].ParamName;

        }
      }
      stateResponse.Success = 'true';
    }
    else
    {
      console.log('[ERROR] found error response: ' + rawResponse);
      var keys = Object.keys(retrievePpvServiceListResponse);
      keys.forEach(key => {
        stateResponse[key] = retrievePpvServiceListResponse[key];
      });
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
 // var resolved = path.resolve(process.env.LAMBDA_TASK_ROOT, 'lambda/mock/' + templateName + '.hbs');
 var resolved = path.resolve('KenanSearchCustomer', + templateName + '.hbs'); //Path of the file to be passed

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
    var accountMockData = 
    {
      // TODO add more example accounts mapping to various response scenarios
      '10682365': {
        Success: true,
        AccountInternalId: 16170525,
        ActiveDate: '2021-05-05T00:00:00',
        AccountExternalId: 16170525,
        AccountExternalIdType: 1,
        AccountStatus: -1,
        AccountStatusDt: '2021-05-05T20:59:08',
        AccountType: 1,
        AcctSegId: 1,
        BillAddress1: '15 STATION STREET',
        BillCity: 'CAMBERWELL',
        BillFname: 'AR HD',
        BillLname: 'IVR SMS',
        BillNamePre: 'Mr',
        BillPeriod: 'TBA',
        BillSequenceNum: 0,
        BillState: 'VIC',
        BillZip: 3124,
        BillingFrequency: 3,
        ChargeThreshold: 0,
        CollectionIndicator: 0,
        CollectionStatus: 0,
        Converted:0,
        CreditRating: 0,
        CustPhone1: 0321050502,
        CyclicalThreshol: 0,
        DateActive: '2021-05-05T00:00:00',
        DateCreated: '2021-05-05T20:59:08',
        ExrateClass: 1,
        LanguageCode: 1,
        MktCode: 1,
        NextBillDate: '2021-06-15T00:00:00',
        NoBill: false,
        AccountRateClass: 1000,
        VipCode: 0,
        PaymentProfileId: 32263900003,
        EasyPaySetup: false,
        EasyPayMethod: 1,
        ExtendedData : {
            ExtendedDataParam: [{
                ParamId: 9146,
                ParamValue: false,
                ParamName: 'WAIVE_PAPER_BILL_FEE'
            },
            {
                ParamId: 9136,
                ParamValue: 3,
                ParamName: 'Usage_Notification'
            },
            {
                ParamId: 10027,
                ParamValue: 1,
                ParamName: 'DISCLOSURE_PARAMID'
            },
            {
                ParamId: 9119,
                ParamValue: 0,
                ParamName: 'BUSINESS_UNIT_PARAMID'
            },
            {
                ParamId: 9121,
                ParamValue: 0,
                ParamName: 'COMPANY_NUMBER_PARAMID'
            },
            {
                ParamId: 9122,
                ParamValue: 0,
                ParamName: 'CONTACT_FAMILY_NAME_PARAMID'
            },
            {
                ParamId: 9123,
                ParamValue: 0,
                ParamName: 'CONTACT_GIVEN_NAME_PARAMID'
            },
            {
                ParamId: 9124,
                ParamValue: 0,
                ParamName: 'CONTACT_TITLE_PARAMID'
            },
            {
                ParamId: 9125,
                ParamValue: 0,
                ParamName: 'CONTACT_DOB_PARAMID'
            },
            {
                ParamId: 9126,
                ParamValue: 0,
                ParamName: 'CONTACT_PHONE_NUMBER_PARAMID'
            },
            {
                ParamId: 9117,
                ParamValue: false,
                ParamName: 'calc_monthlyrate'
            },
            {
                ParamId: 9112,
                ParamValue: 1,
                ParamName: 'MARKETING_PARAMID'
            },
            {
                ParamId: 9113,
                ParamValue: 4,
                ParamName: 'IDENTIFIER_QUESTION_PARAMID'
            },
            {
                ParamId: 9114,
                ParamValue: NA,
                ParamName: 'IDENTIFIER_ANSWER_PARAMID'
            },
            {
                ParamId: 9115,
                ParamValue: false,
                ParamName: 'PROSPECT_FLAG_PARAMID'
            },
            {
                ParamId: 10018,
                ParamValue: 0,
                ParamName: 'TENURE'
            },
            {
                ParamId: 9138,
                ParamValue: 0,
                ParamName: 'BUSINESS_CODE_PARAMID'
                }
            ]
        },
        Delay: 1000,
        Template: 'KenanSearchCustomerResponseSuccess'
    },
    '10682367': 
    {
        Success: false,
        Delay: 3000,
        Template: 'KenanSearchCustomerResponseError'
      }
    };

    var selectedAccount = accountMockData[customerState.Customer.AccountNumber];

     if (selectedAccount === undefined)
     {
       selectedAccount = accountMockData['10682365'];
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
    console.log('[ERROR] failed to load response template for customer: ' + customerState.Customer.AccountNumber);
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