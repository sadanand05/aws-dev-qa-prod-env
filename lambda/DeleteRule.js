
var requestUtils = require('./utils/RequestUtils.js');
var dynamoUtils = require('./utils/DynamoUtils.js');
var configUtils = require('./utils/ConfigUtils.js');

/**
 * Deletes a rule
 */
exports.handler = async(event, context, callback) =>
{
  try
  {
    requestUtils.logRequest(event);
    requestUtils.checkOrigin(event);
    var user = await requestUtils.verifyAPIKey(event);
    requestUtils.requireRole(user, ['ADMINISTRATOR', 'POWER_USER']);

    var ruleSetId = event.queryStringParameters.ruleSetId;
    var ruleId = event.queryStringParameters.ruleId;

    await dynamoUtils.deleteRule(process.env.RULES_TABLE, ruleSetId, ruleId);

    // Mark the last change to now
    await configUtils.setLastChangeTimestampToNow(process.env.CONFIG_TABLE);

    callback(null, requestUtils.buildSuccessfulResponse({
      message: 'Rule deleted successfully'
    }));
  }
  catch (error)
  {
    console.log('[ERROR] failed to delete rule', error);
    callback(null, requestUtils.buildErrorResponse(error)); 
  }
};
