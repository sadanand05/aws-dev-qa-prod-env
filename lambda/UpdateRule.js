
var requestUtils = require('./utils/RequestUtils.js');
var dynamoUtils = require('./utils/DynamoUtils.js');
var configUtils = require('./utils/ConfigUtils.js');

/**
 * Updates an existing rule in DynamoDB
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
    var ruleSetId = body.ruleSetId;
    var ruleId = body.ruleId;
    var ruleEnabled = body.ruleEnabled;
    var ruleDescription = body.ruleDescription;
    var rulePriority = body.rulePriority;
    var ruleActivation = body.ruleActivation;
    var ruleType = body.ruleType;
    var params = body.params;

    await dynamoUtils.updateRule(process.env.RULES_TABLE, 
      ruleSetId, ruleId, ruleEnabled, ruleDescription, rulePriority, ruleActivation, 
      ruleType, params);

    // Mark the last change to now
    await configUtils.setLastChangeTimestampToNow(process.env.CONFIG_TABLE);

    callback(null, requestUtils.buildSuccessfulResponse({
      message: 'Rule updated successfully'
    }));
  }
  catch (error)
  {
    console.log('[ERROR] failed to update rule', error);
    callback(null, requestUtils.buildErrorResponse(error)); 
  }
};
