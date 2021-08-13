
var fs = require('fs');
var path = require('path');
var moment = require('moment-timezone');

var LRU = require("lru-cache");
var AWS = require('aws-sdk');

var lambdaUtils = require('./LambdaUtils.js');
var handlebarsUtils = require('./HandlebarsUtils.js');
var configUtils = require('./ConfigUtils.js');
var operatingHoursUtils = require('./OperatingHoursUtils.js');

AWS.config.update({region: process.env.REGION});
var connect = new AWS.Connect();

/**
 * 5 minute LRU cache for Connect objects
 */
var connectCacheOptions = { max: 100, maxAge: 1000 * 60 * 5 };
var connectCache = new LRU(connectCacheOptions);

/**
 * 1 hour LRU cache for Connect objects
 */
var oneHourConnectCacheOptions = { max: 100, maxAge: 1000 * 60 * 60 };
var oneHourConnectCache = new LRU(oneHourConnectCacheOptions);

/**
 * The available action types
 */
module.exports.actionTypes = [
  'Bootstrap',
  'Main',
  'AuditCall',
  'Error',
  // 'Callback',
  'DTMFInput',
  'DTMFMenu',
  'DTMFSelector',
  'ExternalNumber',
  'Flow',
  'FlowPrompt',
  'Integration',
  'Message',
  'Metric',
  'Queue',
  'QueuePrompt',
  'RuleSet',
  'RuleSetBail',
  'RuleSetPrompt',
  'SetAttribute',
  'SMSMessage',
  'Terminate',
  'UpdateState',
  // 'Voicemail'
];

/**
 * Sets a contact attribute for this contact
 */
module.exports.setContactAttribute = async function(instanceId, contactId, key, value)
{
  try
  {
    var request = {
      InstanceId: instanceId,
      InitialContactId: contactId,
      Attributes: {}
    };

    if (value === undefined || value === null)
    {
      value = '';
    }

    request.Attributes[key] = value;

    await connect.updateContactAttributes(request).promise();
  }
  catch (error)
  {
    console.log('[ERROR] failed to set contact attribute', error);
    throw error;
  }
}

/**
 * Loads a list of queues
 */
module.exports.listQueues = async function(instanceId)
{
  try
  {

    var cachedQueues = connectCache.get('queues');

    if (cachedQueues !== undefined)
    {
      return cachedQueues;
    }

    console.log('[INFO] loading uncached queues');

    var queues = [];

    var params = {
      InstanceId: instanceId,
      QueueTypes: ['STANDARD']
    };

    var results = await connect.listQueues(params).promise();
    queues = queues.concat(results.QueueSummaryList);

    while (results.NextToken)
    {
      params.NextToken = results.NextToken;
      results = await connect.listQueues(params).promise();
      queues = queues.concat(results.QueueSummaryList);
    }

    queues.sort(function (a, b) {
      return a.Name.toLowerCase().localeCompare(b.Name.toLowerCase());
    });

    connectCache.set('queues', queues);

    return queues;
  }
  catch (error)
  {
    console.log('[ERROR] failed to list queues', error);
    throw error;
  }
};

/**
 * Loads a list of contact flows
 */
module.exports.listPhoneNumbers = async function(instanceId)
{
  try
  {
    var cachedPhoneNumbers = connectCache.get('phoneNumbers');

    if (cachedPhoneNumbers !== undefined)
    {
      return cachedPhoneNumbers;
    }

    console.log('[INFO] loading uncached phone numbers');

    var phoneNumbers = [];

    var params = {
      InstanceId: instanceId
    };

    var results = await connect.listPhoneNumbers(params).promise();
    phoneNumbers = phoneNumbers.concat(results.PhoneNumberSummaryList);

    while (results.NextToken)
    {
      params.NextToken = results.NextToken;
      results = await connect.listPhoneNumbers(params).promise();
      phoneNumbers = phoneNumbers.concat(results.PhoneNumberSummaryList);
    }

    phoneNumbers.sort(function (a, b) {
      return a.PhoneNumber.localeCompare(b.PhoneNumber);
    });

    console.log('[INFO] loaded phone numbers: ' + JSON.stringify(phoneNumbers));

    connectCache.set('phoneNumbers', phoneNumbers);

    return phoneNumbers;
  }
  catch (error)
  {
    console.log('[ERROR] failed to list phone numbers', error);
    throw error;
  }
};

/**
 * Loads a list of installed prompts
 */
module.exports.listPrompts = async function(instanceId)
{
  try
  {
    var cachedPrompts = connectCache.get('prompts');

    if (cachedPrompts !== undefined)
    {
      return cachedPrompts;
    }

    console.log('[INFO] loading uncached prompts');

    var prompts = [];

    var params = {
      InstanceId: instanceId
    };

    var results = await connect.listPrompts(params).promise();
    prompts = prompts.concat(results.PromptSummaryList);

    while (results.NextToken)
    {
      params.NextToken = results.NextToken;
      results = await connect.listPhoneNumbers(params).promise();
      prompts = prompts.concat(results.PromptSummaryList);
    }

    prompts.sort(function (a, b) {
      return a.Name.localeCompare(b.Name);
    });

    console.log('[INFO] loaded prompts: ' + JSON.stringify(prompts));

    connectCache.set('prompts', prompts);

    return prompts;
  }
  catch (error)
  {
    console.log('[ERROR] failed to list prompts', error);
    throw error;
  }
};

/**
 * Loads a list of contact flows
 */
module.exports.listContactFlows = async function(instanceId, refreshCache = false)
{
  try
  {
    if (!refreshCache)
    {
      var cachedContactFlows = connectCache.get('contactFlows');

      if (cachedContactFlows !== undefined)
      {
        return cachedContactFlows;
      }
    }

    console.log('[INFO] loading uncached contact flows');

    var contactFlows = [];

    var params = {
      InstanceId: instanceId,
      ContactFlowTypes: ['CONTACT_FLOW']
    };

    var results = await connect.listContactFlows(params).promise();
    contactFlows = contactFlows.concat(results.ContactFlowSummaryList);

    while (results.NextToken)
    {
      params.NextToken = results.NextToken;
      results = await connect.listContactFlows(params).promise();
      contactFlows = contactFlows.concat(results.ContactFlowSummaryList);
    }

    contactFlows.sort(function (a, b) {
      return a.Name.toLowerCase().localeCompare(b.Name.toLowerCase());
    });

    connectCache.set('contactFlows', contactFlows);

    return contactFlows;
  }
  catch (error)
  {
    console.log('[ERROR] failed to list contact flows', error);
    throw error;
  }
};

/**
 * Starts an outbound call and returns the contact id
 */
module.exports.intiateOutboundCall = async function(
  instanceId, 
  contactFlowId, 
  sourcePhone, 
  phoneNumber)
{
  try
  {
    console.log('[INFO] Initiating outbound call');

    var params = {
      DestinationPhoneNumber: phoneNumber,
      InstanceId: instanceId,
      Attributes: 
      {
      },
      SourcePhoneNumber: sourcePhone,
      ContactFlowId: contactFlowId
    };

    console.log('[INFO] about to make outbound call: ' + JSON.stringify(params, null, '  '));

    var response = await connect.startOutboundVoiceContact(params).promise();

    console.log('[INFO] Outbound call initiated: ' + JSON.stringify(response, null, 2));

    return response.ContactId;
  }
  catch (error)
  {
    console.log('[ERROR] failed to initiate outbound call', error);
    throw error;
  }
};

/**
 * Creates an empty contact flow
 */
module.exports.createContactFlow = async function (instanceId, flowName, flowContent)
{
  try
  {
    var request = {
      Content: flowContent,
      InstanceId: instanceId,
      Name: flowName,
      Type: 'CONTACT_FLOW',
      Description: 'Rules engine managed contact flow'
    };

    var response = await connect.createContactFlow(request).promise();

    console.log('[INFO] got create contact flow response: ' + JSON.stringify(response, null, 2));

    return response;
  }
  catch (error)
  {
    console.log('[ERROR] failed to create contact flow', error);
    throw error;
  }
};

/**
 * Describes a contact flow
 */
module.exports.describeContactFlow = async function (instanceId, contactFlowId)
{
  try
  {
    var request = {
      InstanceId: instanceId,
      ContactFlowId: contactFlowId
    };

    var response = await connect.describeContactFlow(request).promise();

    return response.ContactFlow;
  }
  catch (error)
  {
    console.log('[ERROR] failed to describe contact flow: ' + contactFlowId, error);
    throw error;
  }
};

/**
 * Updates the content of a specific contact flow
 */
module.exports.updateContactFlowContent = async function (instanceId, contactFlowId, flowContent)
{
  try
  {
    var request = {
      Content: flowContent,
      InstanceId: instanceId,
      ContactFlowId: contactFlowId
    };

    var response = await connect.updateContactFlowContent(request).promise();

    console.log('[INFO] got update contact flow content response: ' + JSON.stringify(response, null, 2));

    return response;
  }
  catch (error)
  {
    console.log('[ERROR] failed to update contact flow content', error);
    throw error;
  }
};

/**
 * Lists the Lambda functions associated with this instance
 */
module.exports.listLambdaFunctions = async function (instanceId)
{
  try
  {
    var request = {
      InstanceId: instanceId,
    };

    var functions = [];

    var results = await connect.listLambdaFunctions(request).promise();

    functions = functions.concat(results.LambdaFunctions);

    while (results.NextToken)
    {
      request.NextToken = results.NextToken;
      results = await connect.listLambdaFunctions(request).promise();
      functions = functions.concat(results.LambdaFunctions);
    }

    functions.sort();

    console.log('[INFO] list of functions for instance: ' + JSON.stringify(functions, null, 2));

    return functions;
  }
  catch (error)
  {
    console.log('[ERROR] failed to list functions for instance', error);
    throw error;
  }
};

/**
 * Associates the Lambda function with the requested instance
 */
module.exports.associateLambdaFunction = async function (instanceId, functionArn)
{
  try
  {
    var request = {
      InstanceId: instanceId,
      FunctionArn: functionArn
    };

    await connect.associateLambdaFunction(request).promise();
  }
  catch (error)
  {
    console.log('[ERROR] failed to associate lambda function with instance', error);
    throw error;
  }
};

/**
 * Loads a templated contact flow from the deployed package
 */
module.exports.loadContactFlowTemplate = function (flowName)
{
  var resolved = path.resolve(process.env.LAMBDA_TASK_ROOT, 'connect/contactflows/' + flowName + '.json');

  try
  {
    return fs.readFileSync(resolved, 'utf8');
  }
  catch (error)
  {
    console.log('[ERROR] failed to load contact flow from template: ' + resolved, error);
    throw error;
  }
};

/**
 * Get a map of contact flow names against ARNs and Ids
 */
module.exports.getContactFlowsMap = function (contactFlows)
{
  var results = {};

  contactFlows.forEach(contactFlow => {
    results[contactFlow.Name] = {
      arn: contactFlow.Arn,
      id: contactFlow.Id
    };
  });

  return results;
};

/**
 * List all of the functions of interest and check they are associated
 * with this Connect instance
 */
module.exports.checkLambdaFunctionStatus = async function(instanceId, stage, service)
{
  try
  {
    var result = {
      status: 'UNKNOWN',
      lambdaFunctions: []
    };

    var unhealthyFunctions = 0;

    // Find all Lambda functions in the environment
    var lambdaFunctions = await lambdaUtils.listConnectLambdaFunctions(stage, service, true);

    var connectPrefix = `${stage}-${service}-connect`;

    // Filter Lambda functions to Connect specific prefix
    var connectLambdaFunctions = lambdaFunctions.filter(lambdaFunction => lambdaFunction.FunctionName.startsWith(connectPrefix));

    // Find the Lambda functions associated with this Connect instance
    var associatedLambdaFunctions = await module.exports.listLambdaFunctions(instanceId);

    // Walk each Lambda function checking it is installed
    connectLambdaFunctions.forEach(lambdaFunction => {

      if (!associatedLambdaFunctions.includes(lambdaFunction.FunctionArn))
      {
        result.lambdaFunctions.push({
          name: lambdaFunction.FunctionName,
          arn: lambdaFunction.FunctionArn,
          status: 'MISSING'
        });
        unhealthyFunctions++;
      }
      else
      {
        result.lambdaFunctions.push({
          name: lambdaFunction.FunctionName,
          arn: lambdaFunction.FunctionArn,
          status: 'HEALTHY'
        });
      }
    });

    if (unhealthyFunctions === 0) 
    {
      result.status = 'HEALTHY';
    }
    else
    {
      result.status = 'UNHEALTHY';
    }

    return result;
  }
  catch (error)
  {
    console.log('[ERROR] failed to determine health of Lambda functions', error);
    throw error;
  }
};

/**
 * Repairs Lambda function association with a Connect instance
 */
module.exports.repairLambdaFunctions = async function(instanceId, stage, service)
{
  try
  {
    // Check the Lambda function status
    var lambdaFunctionStatus = await module.exports.checkLambdaFunctionStatus(instanceId, stage, service);

    var healthyFunctions = 0;
    var repairedFunctions = 0;

    console.log('[INFO] loaded status: ' + JSON.stringify(lambdaFunctionStatus, null, 2));

    // If all Lambda functions are healthy then we are done
    if (lambdaFunctionStatus.status === 'HEALTHY')
    {
      console.log('[INFO] lambda functions are all healthy');
      return {
        status: {
          healthyFunctions: lambdaFunctionStatus.lambdaFunctions.length,
          repairedFunctions: 0
        }
      };
    }

    // Check the status of each Lambda function and repair any that need it
    for (var i = 0; i < lambdaFunctionStatus.lambdaFunctions.length; i++)
    {
      var lambdaFunction = lambdaFunctionStatus.lambdaFunctions[i];

      if (lambdaFunction.status === 'HEALTHY')
      {
        healthyFunctions++;
      }
      else
      {
        await module.exports.associateLambdaFunction(instanceId, lambdaFunction.arn);
        repairedFunctions++;
      }
    }

    var result = {
      status: {
        healthyFunctions: healthyFunctions,
        repairedFunctions: repairedFunctions
      }
    };

    console.log('[INFO] lambda function repair status: ' + JSON.stringify(result, null, 2));

    return result;
  }
  catch (error)
  {
    console.log('[ERROR] failed to repair Lambda functions', error);
    throw error;
  }
};

/**
 * Checks to see if all contact flows have been installed correctly
 */
module.exports.checkContactFlowStatus = async function (instanceId, stage, service)
{
  try
  {
    var response = {
      status: 'UNKNOWN',
      contactFlows: []
    };

    var contactFlows = await module.exports.listContactFlows(instanceId, true);

    var unhealthyFlows = 0;

    var lambdaFunctionsMap = await lambdaUtils.getConnectLambdaFunctionMap(stage, service, true);
    var contactFlowsMap = module.exports.getContactFlowsMap(contactFlows);

    var connectParams = {
      lambdaFunctions: lambdaFunctionsMap,
      contactFlows: contactFlowsMap
    };

    /**
     * Walk each contact flow, checking it exists
     * and checking it's content if exists
     */
    for (var i = 0; i < module.exports.actionTypes.length; i++)
    {
      var actionType = module.exports.actionTypes[i];
      var contactFlowName = 'RulesEngine' + actionType;

      var existingFlow = contactFlows.find(contactFlow => contactFlow.Name === contactFlowName);

      if (existingFlow !== undefined)
      {
        await sleep(250);
        var contactFlowDescription = await module.exports.describeContactFlow(instanceId, existingFlow.Id);
        var contactFlowTemplate = module.exports.loadContactFlowTemplate(contactFlowName);
        var expectedContent = handlebarsUtils.template(contactFlowTemplate, connectParams);

        if (contactFlowDescription.Content === expectedContent)
        {
          response.contactFlows.push({
            name: contactFlowName,
            arn: existingFlow.Arn,
            id: existingFlow.Id,
            status: 'HEALTHY'
          });
        }
        else
        {
          response.contactFlows.push({
            name: contactFlowName,
            arn: existingFlow.Arn,
            id: existingFlow.Id,
            status: 'UNHEALTHY'
          });
          unhealthyFlows++;
        }
      }
      else
      {
        response.contactFlows.push({
          name: contactFlowName,
          status: 'MISSING'
        });
        unhealthyFlows++;
      }
    }  

    if (unhealthyFlows === 0) 
    {
      response.status = 'HEALTHY';
    }
    else
    {
      response.status = 'UNHEALTHY';
    }

    return response;
  }
  catch (error)
  {
    console.log('[ERROR] failed to determine health of contact flows', error);
    throw error;
  }
};

/**
 * Repairs contact flows that don't exist or have invalid content
 */
module.exports.repairContactFlows = async function (instanceId, stage, service)
{
  try
  {
    // Check the status of contact flows
    var contactFlowStatus = await module.exports.checkContactFlowStatus(instanceId, stage, service);

    var healthyFlows = 0;
    var createdFlows = 0;
    var repairedFlows = 0;

    // If all contact flows are healthy then we are done
    if (contactFlowStatus.status === 'HEALTHY')
    {
      console.log('[INFO] contact flows are all healthy');
      return {
        status: {
          healthyFlows: contactFlowStatus.contactFlows.length,
          createdFlows: 0,
          repairedFlows: 0
        }
      };
    }

    var emptyTemplate = module.exports.loadContactFlowTemplate('empty_flow');

    // Check for any flows that need to be created
    for (var i = 0; i < contactFlowStatus.contactFlows.length; i++)
    {
      let contactFlow = contactFlowStatus.contactFlows[i];

      if (contactFlow.status === 'MISSING')
      {
        console.log('[INFO] about to create missing contact flow: ' + contactFlow.name);
        await module.exports.createContactFlow(instanceId, contactFlow.name, emptyTemplate);
        createdFlows++;
      }
    }

    // If we have created any contact flows reload the status
    if (createdFlows > 0)
    {
      contactFlowStatus = await module.exports.checkContactFlowStatus(instanceId, stage, service);
    }

    // Build the parameters map
    var lambdaFunctionsMap = await lambdaUtils.getConnectLambdaFunctionMap(stage, service, true);
    var contactFlows = await module.exports.listContactFlows(instanceId, true);
    var contactFlowsMap = module.exports.getContactFlowsMap(contactFlows);

    var connectParams = {
      lambdaFunctions: lambdaFunctionsMap,
      contactFlows: contactFlowsMap
    };

    // Check for any flows that need to be repaired and repair them
    for (var i = 0; i < contactFlowStatus.contactFlows.length; i++)
    {
      let contactFlow = contactFlowStatus.contactFlows[i];

      if (contactFlow.status === 'HEALTHY')
      {
        healthyFlows++;
      }
      else
      {
        var contactFlowTemplate = module.exports.loadContactFlowTemplate(contactFlow.name);
        var contactFlowContent = handlebarsUtils.template(contactFlowTemplate, connectParams);
        console.log('[INFO] about to repair contact flow: ' + contactFlow.name);
        await module.exports.updateContactFlowContent(instanceId, contactFlow.id, contactFlowContent);
        repairedFlows++;
      }
    }

    var result = {
      status: {
        healthyFlows: healthyFlows,
        createdFlows: createdFlows,
        repairedFlows: repairedFlows
      }
    };

    console.log('[INFO] contact flow repair status: ' + JSON.stringify(result, null, 2));

    return result;
  }
  catch (error)
  {
    console.log('[ERROR] failed to repair contact flows', error);
    throw error;
  }
};

/**
 * Fetch the time of day
 */
module.exports.getTimeOfDay = function(localHour)
{
  if (localHour < 12)
  {
    return 'morning';
  }
  else if (localHour >= 12 && localHour < 18)
  {
    return 'afternoon';
  }
  else
  {
    return 'evening';
  }
}

/**
 * Loads hours of operations so these can be evaluated
 */
module.exports.getHoursOfOperations = async function (instanceId)
{
  try
  {
    var listRequest = {
      InstanceId: instanceId
    };

    var operatingHours = [];

    // Load the list of working hours
    var listResponse = await connect.listHoursOfOperations(listRequest).promise();

    operatingHours = operatingHours.concat(listResponse.HoursOfOperationSummaryList);

    while (listResponse.NextToken)
    {
      listRequest.NextToken = listResponse.NextToken;
      listResponse = await connect.listHoursOfOperations(listRequest).promise();
      operatingHours = operatingHours.concat(listResponse.HoursOfOperationSummaryList);      
    }

    var hoursOfOperations = [];

    // Describe each working hours
    for (var i = 0; i < operatingHours.length; i++)
    {
      var operatingHoursItem = operatingHours[i];

      var describeRequest = {
        InstanceId: instanceId,
        HoursOfOperationId: operatingHoursItem.Id
      };

      var describeResponse = await connect.describeHoursOfOperation(describeRequest).promise();

      hoursOfOperations.push(describeResponse.HoursOfOperation);

      // Back off to avoid throttling
      await sleep(300);
    }

    oneHourConnectCache.set('hoursOfOperations', hoursOfOperations);

    return hoursOfOperations;
  }
  catch (error)
  {
    console.log('[ERROR] failed to load operating hours', error);
    throw error;
  }
};

/**
 * Creates a sample contact for inbound calls and tests
 * NOTE: Foxtel specific fields here
 */
module.exports.createSampleStateRequest = async function (configTable, dialledNumber)
{
  var one2OneFields = [
    "AccountNumber",
    "PhoneNumber1",
    "PhoneNumber2",
    "AccountName",
    "FirstName",
    "LastName",
    "AccountStatus",
    "UnitNo",
    "HouseNumber",
    "HouseNumberSuffix",
    "StreetName",
    "StreetSuffix",
    "City",
    "State",
    "PostCode",
    "EmailAddress",
    "DateOfBirth",
    "RateClass",
    "CollectionClassification",
    "ServiceType",
    "InventoryType",
    "OutageInformation",
    "OpenConnect",
    "OpenServiceAdd",
    "OpenDisconnect",
    "OpenServiceCall",
    "OpenServiceTypeStatus",
    "AppointmentStartDateTime",
    "AppointmentEndDateTime",
    "WFIFlag",
    "BoxHit",
    "TimeLastCalled",
    "UpdateDetails",
    "OpenServiceMove",
    "OpenIQUpgrade",
    "SuspendStatus",
    "CollectionSegment",
    "TelstraBundleFlag",
    "Suspension_Reason",
    "DiyCount",
    "HybridHome",
    "Tv",
    "Voice",
    "Broadband",
    "FoxtelPlay",
    "VoiceTv_ServiceOrderId",
    "TechType",
    "Billing_Repeat",
    "CaseMgmt",
    "PaymentMethod",
    "Enrolment_Status",
    "Priority_Status",
    "Loyalty_Band"
  ];

  var account1 = {};
  var account2 = {};

  one2OneFields.forEach(field => {
    account1[field] = '';
    account2[field] = '';
  });

  account1.AccountNumber = '1000001';
  account1.AccountName = 'Josh Bloggs';
  account1.PostCode = '4066';
  account1.DateOfBirth = '21/09/1972';
  account1.DateOfBirthSimple = '21091972';
  account1.PhoneNumber1 = '0422529062';
  account1.PhoneNumber1 = '0422529063';

  account2.AccountNumber = '1000002';
  account2.AccountName = 'Zara Bloggs';
  account2.PostCode = '4065';
  account2.DateOfBirth = '09/05/2003';
  account2.DateOfBirthSimple = '09052003';
  account2.PhoneNumber1 = '0422529063';
  account2.PhoneNumber1 = '0422529062';

  account1 = sortObjectFields(account1);
  account2 = sortObjectFields(account2);

  var timeZone = await configUtils.getCallCentreTimeZone(configTable);
  var operatingHoursState = await operatingHoursUtils.evaluateOperatingHours(configTable);
  var isHoliday = await operatingHoursUtils.isHoliday(configTable);

  var utcTime = moment().utc();
  var localTime = moment(utcTime).tz(timeZone);
  var localHour = localTime.hour();

  var sampleContact = {
    CustomerPhoneNumber: 'anonymous',
    System: {
      Holiday: '' + isHoliday,
      OperatingHours: operatingHoursState,
      DialledNumber: dialledNumber,
      DateTimeUTC: utcTime.format(),
      DateTimeLocal: localTime.format(),
      TimeLocal: localTime.format('hh:mm A'),
      TimeOfDay: module.exports.getTimeOfDay(localHour)
    },    
    Customer: account1,
    Accounts: [
      account1,
      account2
    ]
  };

  return sampleContact;
};

function sortObjectFields(toSort)
{
  var result = {};

  var fields = Object.keys(toSort);
  fields.sort();

  fields.forEach(field => {
    result[field] = toSort[field];
  });

  return result;
}

/**
 * Sleep for time millis
 */
function sleep (time) 
{
  return new Promise((resolve) => setTimeout(resolve, time));
}

