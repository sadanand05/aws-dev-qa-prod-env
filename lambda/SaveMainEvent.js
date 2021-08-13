
var requestUtils = require('./utils/RequestUtils.js');
var dynamoUtils = require('./utils/DynamoUtils.js');
var configUtils = require('./utils/ConfigUtils.js');

/**
 * Saves a main event
 */
exports.handler = async(event, context, callback) =>
{
  try
  {
    requestUtils.logRequest(event);
    requestUtils.checkOrigin(event);
    var user = await requestUtils.verifyAPIKey(event);
    requestUtils.requireRole(user, ['ADMINISTRATOR', 'POWER_USER']);
    
    var body = JSON.parse(event.body);

    var eventId = body.eventId;
    var name = body.name;
    var speechName = body.speechName;
    var fastPathMinutes = body.fastPathMinutes;
    var description = body.description;
    var active = body.active;

    await dynamoUtils.updateMainEvent(process.env.MAIN_EVENTS_TABLE, eventId, name, speechName, fastPathMinutes, description, active);

    // Mark the last change to now
    await configUtils.setLastChangeTimestampToNow(process.env.CONFIG_TABLE);

    callback(null, requestUtils.buildSuccessfulResponse({
      status: 'success'
    }));
  }
  catch (error)
  {
    console.log('[ERROR] failed to save main event', error);
    callback(null, requestUtils.buildErrorResponse(error)); 
  }
};

