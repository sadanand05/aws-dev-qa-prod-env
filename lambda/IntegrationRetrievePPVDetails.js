var fs = require('fs');
var path = require('path');
var moment = require('moment');

var requestUtils = require('./utils/RequestUtils.js');
var dynamoUtils = require('./utils/DynamoUtils.js');
var handlebarsUtils = require('./utils/HandlebarsUtils.js');

const parseString = require('xml2js').parseString;
const stripNS = require('xml2js').processors.stripPrefix;

/**
 * Lambda function that handles Pay Per View (PPV) event loading from Kenan
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
    //var accountInternalId = customerState.Customer.AccountInternalId;

    // Build a request message
    var template = getTemplate('KenanRetrievePPVDetailsRequest');
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

    console.log(`[INFO] got parsed response: ${JSON.stringify(processedResponse)}`);

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
    var stateResponse = {
      Success: false
    };

    var parsedResponse = await parseXML(rawResponse);

    console.log(`[INFO] got parsed response: ${JSON.stringify(parsedResponse, null, 2)}`);

    if (parsedResponse.Request.KenanRetrievePPVDetailsResponse.SuccessFlag === 'true')
    {
      stateResponse.OppvDeliveryId = parsedResponse.Request.KenanRetrievePPVDetailsResponse.OppvDeliveryId;
      stateResponse.OrderId = parsedResponse.Request.KenanRetrievePPVDetailsResponse.OrderId;
      stateResponse.AccountInternalId = parsedResponse.Request.KenanRetrievePPVDetailsResponse.AccountInternalId;
      stateResponse.AddressId = parsedResponse.Request.KenanRetrievePPVDetailsResponse.AddressId;
      stateResponse.ContentTypeId = parsedResponse.Request.KenanRetrievePPVDetailsResponse.ContentTypeId;
      stateResponse.CurrencyCode = parsedResponse.Request.KenanRetrievePPVDetailsResponse.CurrencyCode;
      stateResponse.CurrencyPrice = parsedResponse.Request.KenanRetrievePPVDetailsResponse.CurrencyPrice;
      stateResponse.DeviceAddress = parsedResponse.Request.KenanRetrievePPVDetailsResponse.DeviceAddress;
      stateResponse.GenerateUsageDt = parsedResponse.Request.KenanRetrievePPVDetailsResponse.GenerateUsageDt;
      stateResponse.InventoryId = parsedResponse.Request.KenanRetrievePPVDetailsResponse.InventoryId;
      stateResponse.InventoryIdResets = parsedResponse.Request.KenanRetrievePPVDetailsResponse.InventoryIdResets;
      stateResponse.InventoryTypeId = parsedResponse.Request.KenanRetrievePPVDetailsResponse.InventoryTypeId;
      stateResponse.LastCancelDt = parsedResponse.Request.KenanRetrievePPVDetailsResponse.LastCancelDt;
      stateResponse.OfferEndDt = parsedResponse.Request.KenanRetrievePPVDetailsResponse.OfferEndDt;
      stateResponse.OfferId = parsedResponse.Request.KenanRetrievePPVDetailsResponse.OfferId;
      stateResponse.OfferName = parsedResponse.Request.KenanRetrievePPVDetailsResponse.OfferName;
      stateResponse.OfferStartDt = parsedResponse.Request.KenanRetrievePPVDetailsResponse.OfferStartDt;
      stateResponse.OrderDt = parsedResponse.Request.KenanRetrievePPVDetailsResponse.OrderDt;
      stateResponse.OrderMethodId = parsedResponse.Request.KenanRetrievePPVDetailsResponse.OrderMethodId;
      stateResponse.POfferId = parsedResponse.Request.KenanRetrievePPVDetailsResponse.POfferId;
      stateResponse.PrimaryCategoryId = parsedResponse.Request.KenanRetrievePPVDetailsResponse.PrimaryCategoryId;
      stateResponse.ScheduleId = parsedResponse.Request.KenanRetrievePPVDetailsResponse.ScheduleId;
      stateResponse.ServiceInternalId = parsedResponse.Request.KenanRetrievePPVDetailsResponse.ServiceInternalId;
      stateResponse.ServiceInternalIdResets = parsedResponse.Request.KenanRetrievePPVDetailsResponse.ServiceInternalIdResets;
      stateResponse.Timezone = parsedResponse.Request.KenanRetrievePPVDetailsResponse.Timezone;
      stateResponse.TokenValue = parsedResponse.Request.KenanRetrievePPVDetailsResponse.TokenValue;
      stateResponse.Version = parsedResponse.Request.KenanRetrievePPVDetailsResponse.Version;
      stateResponse.AdultFg = parsedResponse.Request.KenanRetrievePPVDetailsResponse.AdultFg;
      stateResponse.ChgCode = parsedResponse.Request.KenanRetrievePPVDetailsResponse.ChgCode;
      stateResponse.LangCode = parsedResponse.Request.KenanRetrievePPVDetailsResponse.LangCode;
      stateResponse.ChgDt = parsedResponse.Request.KenanRetrievePPVDetailsResponse.ChgDt;
      stateResponse.Description = parsedResponse.Request.KenanRetrievePPVDetailsResponse.Description;
      stateResponse.DisplayName = parsedResponse.Request.KenanRetrievePPVDetailsResponse.DisplayName;
      stateResponse.DisplayStartDt = parsedResponse.Request.KenanRetrievePPVDetailsResponse.DisplayStartDt;
      stateResponse.EndDt = parsedResponse.Request.KenanRetrievePPVDetailsResponse.EndDt;
      stateResponse.ExtDescription = parsedResponse.Request.KenanRetrievePPVDetailsResponse.ExtDescription;
      stateResponse.ExternalId = parsedResponse.Request.KenanRetrievePPVDetailsResponse.ExternalId;
      stateResponse.FfId = parsedResponse.Request.KenanRetrievePPVDetailsResponse.FfId;
      stateResponse.IsDeleted = parsedResponse.Request.KenanRetrievePPVDetailsResponse.IsDeleted;
      stateResponse.MarketingMsg = parsedResponse.Request.KenanRetrievePPVDetailsResponse.MarketingMsg;
      stateResponse.StartDt = parsedResponse.Request.KenanRetrievePPVDetailsResponse.StartDt;
      stateResponse.CurrencyPrice = parsedResponse.Request.KenanRetrievePPVDetailsResponse.CurrencyPrice;
      stateResponse.TapingFg = parsedResponse.Request.KenanRetrievePPVDetailsResponse.TapingFg;
      stateResponse.FirstOrderDt = parsedResponse.Request.KenanRetrievePPVDetailsResponse.FirstOrderDt;
      stateResponse.LastOrderDt = parsedResponse.Request.KenanRetrievePPVDetailsResponse.LastOrderDt;
      stateResponse.ChoiceFg = parsedResponse.Request.KenanRetrievePPVDetailsResponse.ChoiceFg;
      stateResponse.Description = parsedResponse.Request.KenanRetrievePPVDetailsResponse.Description;
      stateResponse.DisplayName = parsedResponse.Request.KenanRetrievePPVDetailsResponse.DisplayName;
      stateResponse.Duration = parsedResponse.Request.KenanRetrievePPVDetailsResponse.Duration;
      stateResponse.ItemId = parsedResponse.Request.KenanRetrievePPVDetailsResponse.ItemId;
      stateResponse.LangCode = parsedResponse.Request.KenanRetrievePPVDetailsResponse.LangCode;
      stateResponse.MarketingMsg = parsedResponse.Request.KenanRetrievePPVDetailsResponse.MarketingMsg;
      stateResponse.NewFg = parsedResponse.Request.KenanRetrievePPVDetailsResponse.NewFg;
      stateResponse.OfferId = parsedResponse.Request.KenanRetrievePPVDetailsResponse.OfferId;
      stateResponse.PItemId = parsedResponse.Request.KenanRetrievePPVDetailsResponse.PItemId;
      stateResponse.PrimaryGenreId = parsedResponse.Request.KenanRetrievePPVDetailsResponse.PrimaryGenreId;
      stateResponse.SecondaryGenreId = parsedResponse.Request.KenanRetrievePPVDetailsResponse.SecondaryGenreId;
      stateResponse.RatingDisplayValue = parsedResponse.Request.KenanRetrievePPVDetailsResponse.RatingDisplayValue;
      stateResponse.Channel = parsedResponse.Request.KenanRetrievePPVDetailsResponse.Channel;
      stateResponse.EventStartDt = parsedResponse.Request.KenanRetrievePPVDetailsResponse.EventStartDt;
      stateResponse.ItemId = parsedResponse.Request.KenanRetrievePPVDetailsResponse.ItemId;
      stateResponse.EventId = parsedResponse.Request.KenanRetrievePPVDetailsResponse.EventId;
      stateResponse.PEventId = parsedResponse.Request.KenanRetrievePPVDetailsResponse.PEventId;

      /*if (parsedResponse.Request.KenanRetrievePPVDetailsResponse.PaymentProfileId !== undefined)
      {
        stateResponse.PaymentProfileId = parsedResponse.Request.KenanRetrievePPVDetailsResponse.PaymentProfileId;
      }*/

      stateResponse.Success = true;
    }
    else
    {
      console.log('[ERROR] found error response: ' + rawResponse);
      stateResponse.Success = false;
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
    var accountMockData = 
    {
      // TODO add more example accounts mapping to various response scenarios
      '10682365': {
        Success: true,
        count:1,
        OppvDeliveryId: 33022921003,
        OrderId:100359593003,
				AccountInternalId: 9035601,
				AddressId: 4595441001,
				ContentTypeId: 1,
				CurrencyCode: 1,
				CurrencyPrice: 800,
				DeviceAddress: '000201535366',
				GenerateUsageDt: '2017-10-09T12:30:00',
				InventoryId: 5465738,
				InventoryIdResets: 1,
				InventoryTypeId:101,
				LastCancelDt:'2017-10-09T12:30:00',
				OfferEndDt:'2017-10-09T14:30:00',
				OfferId: 7264097,
				OfferName:'Make Me Sweat',
				OfferStartDt:'2017-10-09T12:30:00',
				OrderDt:'2017-10-09T11:43:23',
				OrderMethodId:3,
				POfferId:3270659,
				PrimaryCategoryId:1,
				ScheduleId:4,
				ServiceInternalId:78569939,
				ServiceInternalIdResets:0,
				Timezone:18,
				TokenValue:160,
				Version:5,
        AdultFg:true,
        ChgCode:1,
        LangCode:1,
        ChgDt:'2017-10-09T02:03:04',
        Description:'Adult - On Demand **',
        DisplayName:'Make Me Sweat',
        DisplayStartDt:'2017-10-09T12:30:00',
        EndDt:'2017-10-09T14:30:00',
        ExtDescription:'Four sinful couples in a classic passionate erotic film. (2016) (l,t,ss,n) (61mins) Cast: Nathaly Heaven, Blanche',
        ExternalId:16367,
        FfId:9058,
        IsDeleted:false,
        MarketingMsg:'Four sinful couples in a classic passionate erotic film.',
        StartDt:'2017-10-09T12:30:00',
        CurrencyPrice:800,
        TapingFg:0,
        FirstOrderDt:'2017-10-05T02:03:26',
        LastOrderDt:'2017-10-09T14:30:00',
        ChoiceFg:false,
        Description:Adult - 'On Demand **',
        DisplayName:'Make Me Sweat',
        Duration:120,
        ExtDescription:'Four sinful couples in a classic passionate erotic film. (2016) (l,t,ss,n) (61mins) Cast: Nathaly Heaven, Blanche</ExtDescription',
        ItemId:10289017,
        LangCode:1,
        MarketingMsg:'Four sinful couples in a classic passionate erotic film.',
        NewFg:false,
        OfferId:7264097,
        PItemId:16257682,
        PrimaryGenreId:200,
        SecondaryGenreId:203,
        RatingDisplayValue:'R - Restricted 18+',
        Channel:518,
        EventStartDt:'2017-10-09T12:30:00',
        ItemId:10289017,
        EventId:10288923,
        PEventId:16257682,
        Delay: 1000,
        Template: 'KenanRetrievePPVDetailsResponseSuccess'
      },
      '10682366': {
        Success: true,
        count:1,
        OppvDeliveryId: 33022921003,
        OrderId:100359593003,
				AccountInternalId: 9035601,
				AddressId: 4595441001,
				ContentTypeId: 1,
				CurrencyCode: 1,
				CurrencyPrice: 800,
				DeviceAddress: '000201535366',
				GenerateUsageDt: '2017-10-09T12:30:00',
				InventoryId: 5465738,
				InventoryIdResets: 1,
				InventoryTypeId:101,
				LastCancelDt:'2017-10-09T12:30:00',
				OfferEndDt:'2017-10-09T14:30:00',
				OfferId: 7264097,
				OfferName:'Make Me Sweat',
				OfferStartDt:'2017-10-09T12:30:00',
				OrderDt:'2017-10-09T11:43:23',
				OrderMethodId:3,
				POfferId:3270659,
				PrimaryCategoryId:1,
				ScheduleId:4,
				ServiceInternalId:78569939,
				ServiceInternalIdResets:0,
				Timezone:18,
				TokenValue:160,
				Version:5,
        AdultFg:true,
        ChgCode:1,
        LangCode:1,
        ChgDt:'2017-10-09T02:03:04',
        Description:'Adult - On Demand **',
        DisplayName:'Make Me Sweat',
        DisplayStartDt:'2017-10-09T12:30:00',
        EndDt:'2017-10-09T14:30:00',
        ExtDescription:'Four sinful couples in a classic passionate erotic film. (2016) (l,t,ss,n) (61mins) Cast: Nathaly Heaven, Blanche',
        ExternalId:16367,
        FfId:9058,
        IsDeleted:false,
        MarketingMsg:'Four sinful couples in a classic passionate erotic film.',
        StartDt:'2017-10-09T12:30:00',
        CurrencyPrice:800,
        TapingFg:0,
        FirstOrderDt:'2017-10-05T02:03:26',
        LastOrderDt:'2017-10-09T14:30:00',
        ChoiceFg:false,
        Description:Adult - 'On Demand **',
        DisplayName:'Make Me Sweat',
        Duration:120,
        ExtDescription:'Four sinful couples in a classic passionate erotic film. (2016) (l,t,ss,n) (61mins) Cast: Nathaly Heaven, Blanche</ExtDescription',
        ItemId:10289017,
        LangCode:1,
        MarketingMsg:'Four sinful couples in a classic passionate erotic film.',
        NewFg:false,
        OfferId:7264097,
        PItemId:16257682,
        PrimaryGenreId:200,
        SecondaryGenreId:203,
        RatingDisplayValue:'R - Restricted 18+',
        Channel:518,
        EventStartDt:'2017-10-09T12:30:00',
        ItemId:10289017,
        EventId:10288923,
        PEventId:16257682,
        Delay: 1000,
        Template: 'KenanRetrievePPVDetailsResponseSuccess'
      },
      '10682367': {
        Success: false,
        Delay: 3000,
        Template: 'KenanRetrievePPVDetailsResponseError'
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