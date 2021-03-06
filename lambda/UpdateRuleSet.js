
var requestUtils = require('./utils/RequestUtils.js');
var dynamoUtils = require('./utils/DynamoUtils.js');
var configUtils = require('./utils/ConfigUtils.js');

/**
 * Updates an existing rule set in DynamoDB
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
    var ruleSetEnabled = body.ruleSetEnabled;
    var ruleSetDescription = body.ruleSetDescription;
    var inboundNumbers = body.inboundNumbers;

    await dynamoUtils.updateRuleSet(process.env.RULE_SETS_TABLE, 
      ruleSetId, ruleSetEnabled, ruleSetDescription, inboundNumbers);

    // Mark the last change to now
    await configUtils.setLastChangeTimestampToNow(process.env.CONFIG_TABLE);

    callback(null, requestUtils.buildSuccessfulResponse({
      message: 'Rule set updated successfully'
    }));
  }
  catch (error)
  {
    console.log('[ERROR] failed to update rule set', error);
    callback(null, requestUtils.buildErrorResponse(error)); 
  }
};
