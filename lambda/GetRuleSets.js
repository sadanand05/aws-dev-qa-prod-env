
var requestUtils = require('./utils/RequestUtils.js');
var dynamoUtils = require('./utils/DynamoUtils.js');

/**
 * Fetches all rule sets
 */
exports.handler = async(event, context, callback) =>
{
  try
  {
    requestUtils.logRequest(event);
    requestUtils.checkOrigin(event);
    var user = await requestUtils.verifyAPIKey(event);
    requestUtils.requireRole(user, ['ADMINISTRATOR', 'POWER_USER', 'TESTER']);

    var ruleSets = await dynamoUtils.getRuleSets(process.env.RULE_SETS_TABLE);

    callback(null, requestUtils.buildSuccessfulResponse({
      ruleSets: ruleSets
    }));
  }
  catch (error)
  {
    console.log('[ERROR] failed to load rule sets', error);
    callback(null, requestUtils.buildErrorResponse(error)); 
  }
};
