
var requestUtils = require('./utils/RequestUtils.js');
var configUtils = require('./utils/ConfigUtils.js');

/**
 * Fetches the date of the last change to the rules data model
 * as an ISO860 UTC timestamp
 */
exports.handler = async(event, context, callback) =>
{
  try
  {
    requestUtils.logRequest(event);
    requestUtils.checkOrigin(event);
    var user = await requestUtils.verifyAPIKey(event);
    requestUtils.requireRole(user, ['ADMINISTRATOR', 'POWER_USER', 'TESTER']);

    var lastChangeTimestamp = await configUtils.getLastChangeTimestamp(process.env.CONFIG_TABLE);

    callback(null, requestUtils.buildSuccessfulResponse({
      lastChangeTimestamp: lastChangeTimestamp
    }));
  }
  catch (error)
  {
    console.log('[ERROR] failed to load last change timestamp', error);
    callback(null, requestUtils.buildErrorResponse(error)); 
  }
};
