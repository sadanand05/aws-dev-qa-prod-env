
var requestUtils = require('./utils/RequestUtils.js');
var dynamoUtils = require('./utils/DynamoUtils.js');
var configUtils = require('./utils/ConfigUtils.js');

/**
 * Imports rule sets and rules, clearing all existing rule sets and rules
 */
exports.handler = async(event, context, callback) =>
{
  try
  {
    requestUtils.logRequest(event);
    requestUtils.checkOrigin(event);
    var user = await requestUtils.verifyAPIKey(event);
    requestUtils.requireRole(user, ['ADMINISTRATOR']);

    var body = JSON.parse(event.body);

    var ruleSetsToImport = body.ruleSets;
    var clearAll = true;

    // Check to see if we are clearing everything down first
    if (clearAll === true)
    {
      console.log('[INFO] about to delete all existing rule sets prior to ingest');

      var ruleSets = await dynamoUtils.getRuleSetsAndRules(process.env.RULE_SETS_TABLE, process.env.RULES_TABLE);

      for (var r1 = 0; r1 < ruleSets.length; r1++)
      {
        var ruleSet = ruleSets[r1];

        for (var r2 = 0; r2 < ruleSet.rules.length; r2++)
        {
          var rule = ruleSet.rules[r2];
          await dynamoUtils.deleteRule(process.env.RULES_TABLE, rule.ruleSetId, rule.ruleId);
        }

        await dynamoUtils.deleteRuleSet(process.env.RULE_SETS_TABLE, ruleSet.ruleSetId);
      }

      // Mark the last change to now
      await configUtils.setLastChangeTimestampToNow(process.env.CONFIG_TABLE);
    }

    console.log('[INFO] about to import rule sets');

    await dynamoUtils.importRuleSets(process.env.RULE_SETS_TABLE, process.env.RULES_TABLE, ruleSetsToImport);

    // Mark the last change to now
    await configUtils.setLastChangeTimestampToNow(process.env.CONFIG_TABLE);

    callback(null, requestUtils.buildSuccessfulResponse({
      importCount: ruleSetsToImport.length
    }));
  }
  catch (error)
  {
    console.log('[ERROR] failed to import rule sets', error);
    callback(null, requestUtils.buildErrorResponse(error));
  }
};
