
var requestUtils = require('./utils/RequestUtils.js');
var dynamoUtils = require('./utils/DynamoUtils.js');

/**
 * Fetches a rule
 */
exports.handler = async(event, context, callback) =>
{
  try
  {
    requestUtils.logRequest(event);
    requestUtils.checkOrigin(event);
    await requestUtils.verifyAPIKey(event);
    var user = await requestUtils.verifyAPIKey(event);
    requestUtils.requireRole(user, ['ADMINISTRATOR', 'POWER_USER', 'TESTER']);

    var ruleSetId = event.queryStringParameters.ruleSetId;
    var ruleId = event.queryStringParameters.ruleId;

    var rule = await dynamoUtils.getRule(process.env.RULES_TABLE, ruleSetId, ruleId);

    callback(null, requestUtils.buildSuccessfulResponse({
      rule: rule
    }));
  }
  catch (error)
  {
    console.log('[ERROR] failed to load rule', error);
    callback(null, requestUtils.buildErrorResponse(error)); 
  }
};

