
var moment = require('moment-timezone');

var requestUtils = require('./utils/RequestUtils.js');
var connectUtils = require('./utils/ConnectUtils.js');
var operatingHoursUtils = require('./utils/OperatingHoursUtils.js');
var configUtils = require('./utils/ConfigUtils.js');
var lambdaUtils = require('./utils/LambdaUtils.js');

/**
 * Fetches connect configuration
 */
exports.handler = async(event, context, callback) =>
{
  try
  {
    requestUtils.logRequest(event);
    requestUtils.checkOrigin(event);
    var user = await requestUtils.verifyAPIKey(event);
    requestUtils.requireRole(user, ['ADMINISTRATOR', 'POWER_USER', 'TESTER']);

    var contactFlows = await connectUtils.listContactFlows(process.env.INSTANCE_ID);
    var queues = await connectUtils.listQueues(process.env.INSTANCE_ID);
    var lambdaFunctions = await lambdaUtils.listConnectLambdaFunctions(process.env.STAGE, process.env.SERVICE);
    var phoneNumbers = await connectUtils.listPhoneNumbers(process.env.INSTANCE_ID);
    var evaluatedHours = await operatingHoursUtils.evaluateOperatingHours(process.env.CONFIG_TABLE);
    var timeZone = await configUtils.getCallCentreTimeZone(process.env.CONFIG_TABLE);
    var prompts = await connectUtils.listPrompts(process.env.INSTANCE_ID);

    var promptNames = [];
    prompts.forEach(prompt => {
      promptNames.push(prompt.Name);
    });

    var localDateTime = moment().tz(timeZone);

    callback(null, requestUtils.buildSuccessfulResponse({
      queues: queues,
      contactFlows: contactFlows,
      phoneNumbers: phoneNumbers,
      lambdaFunctions: lambdaFunctions,
      evaluatedHours: evaluatedHours,
      timeZone: timeZone,
      prompts: promptNames,
      localDateTime: localDateTime.format(),
      localTime: localDateTime.format('hh:mm A')
    }));
  }
  catch (error)
  {
    console.log('[ERROR] failed to load Connect data', error);
    callback(null, requestUtils.buildErrorResponse(error)); 
  }
};

