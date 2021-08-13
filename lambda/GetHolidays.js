
var requestUtils = require('./utils/RequestUtils.js');
var dynamoUtils = require('./utils/DynamoUtils.js');
var configUtils = require('./utils/ConfigUtils.js');

/**
 * Fetches the holidays in the system
 */
exports.handler = async(event, context, callback) =>
{
  try
  {
    requestUtils.logRequest(event);
    requestUtils.checkOrigin(event);
    var user = await requestUtils.verifyAPIKey(event);
    requestUtils.requireRole(user, ['ADMINISTRATOR', 'POWER_USER', 'TESTER']);

    // Load up the existing holidays
    var holidaysConfigItem = await configUtils.getUncachedConfigItem(process.env.CONFIG_TABLE, 'Holidays');

    if (holidaysConfigItem !== undefined)
    {
      var holidays = JSON.parse(holidaysConfigItem.configData);
      callback(null, requestUtils.buildSuccessfulResponse({
        holidays: holidays
      }));
    }
    else
    {
      callback(null, requestUtils.buildSuccessfulResponse({
        holidays: []
      }));
    }

    callback(null, requestUtils.buildSuccessfulResponse({
      holidays: holidays
    }));
  }
  catch (error)
  {
    console.log('[ERROR] failed to load holidays', error);
    callback(null, requestUtils.buildErrorResponse(error)); 
  }
};

