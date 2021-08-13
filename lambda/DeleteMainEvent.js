
var requestUtils = require('./utils/RequestUtils.js');
var dynamoUtils = require('./utils/DynamoUtils.js');
var configUtils = require('./utils/ConfigUtils.js');

/**
 * Deletes a main event from DynamoDB
 */
exports.handler = async(event, context, callback) =>
{
  try
  {
    requestUtils.logRequest(event);
    requestUtils.checkOrigin(event);
    var user = await requestUtils.verifyAPIKey(event);
    requestUtils.requireRole(user, ['ADMINISTRATOR', 'POWER_USER']);

    var eventId = event.queryStringParameters.eventId;

    await dynamoUtils.deleteMainEvent(process.env.MAIN_EVENT_TABLE, eventId);

    // Mark the last change to now
    await configUtils.setLastChangeTimestampToNow(process.env.CONFIG_TABLE);

    callback(null, requestUtils.buildSuccessfulResponse({
      success: true
    }));
  }
  catch (error)
  {
    console.log('[ERROR] failed to delete a main event', error);
    callback(null, requestUtils.buildErrorResponse(error)); 
  }
};

