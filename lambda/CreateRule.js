
var requestUtils = require('./utils/RequestUtils.js');
var dynamoUtils = require('./utils/DynamoUtils.js');
var configUtils = require('./utils/ConfigUtils.js');

/**
 * Creates a new rule in DynamoDB
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
    var ruleName = body.ruleName;
    var ruleEnabled = body.ruleEnabled;
    var ruleDescription = body.ruleDescription;
    var rulePriority = body.rulePriority;
    var ruleActivation = body.ruleActivation;
    var ruleType = body.ruleType;
    var params = body.params;
    var weights = body.weights;

    // Check for an existing rule with this name in this rule set and fail if it exists
    if (await dynamoUtils.checkRuleExistsByName(process.env.RULES_TABLE, ruleSetId, ruleName))
    {
      console.log('[ERROR] rule already exists with this name: ' + ruleName);

      callback(null, requestUtils.buildFailureResponse(409, { 
        message: 'Rule already exists' 
      }));
    }
    // This is a novel rule so create it
    else
    {
      var ruleId = await dynamoUtils.insertRule(process.env.RULES_TABLE, 
        ruleSetId, ruleName, ruleEnabled, ruleDescription, rulePriority, ruleActivation, 
        ruleType, params, weights);

      // Mark the last change to now
      await configUtils.setLastChangeTimestampToNow(process.env.CONFIG_TABLE);

      callback(null, requestUtils.buildSuccessfulResponse({
        ruleId: ruleId
      }));
    }
  }
  catch (error)
  {
    console.log('[ERROR] failed to create rule', error);
    callback(null, requestUtils.buildErrorResponse(error)); 
  }
};

