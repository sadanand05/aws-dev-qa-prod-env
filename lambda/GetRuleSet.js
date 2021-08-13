
var requestUtils = require('./utils/RequestUtils.js');
var dynamoUtils = require('./utils/DynamoUtils.js');

/**
 * Fetches a rule set
 */
exports.handler = async(event, context, callback) =>
{
  try
  {
    requestUtils.logRequest(event);
    requestUtils.checkOrigin(event);
    var user = await requestUtils.verifyAPIKey(event);
    requestUtils.requireRole(user, ['ADMINISTRATOR', 'POWER_USER', 'TESTER']);

    var ruleSetId = event.queryStringParameters.ruleSetId;
    var ruleSet = await dynamoUtils.getRuleSet(process.env.RULE_SETS_TABLE, process.env.RULES_TABLE, ruleSetId);

    callback(null, requestUtils.buildSuccessfulResponse({
      ruleSet: ruleSet
    }));
  }
  catch (error)
  {
    console.log('[ERROR] failed to load rule', error);
    callback(null, requestUtils.buildErrorResponse(error)); 
  }
};
