var requestUtils = require('./utils/RequestUtils.js');

/**
 * Checks to see if a value is null
 */
exports.handler = async(event, context, callback) =>
{
  try
  {
    requestUtils.logRequest(event);

    // TODO consider only holding these for a length of time
    if (contactFlows === null)
    {
      contactFlows = await connectUtils.listContactFlows(process.env.INSTANCE_ID);
    }

    var rules = JSON.parse(event.Details.ContactData.Attributes.rules);
    var ruleIndex = +event.Details.ContactData.Attributes.ruleIndex;

    var rule = rules[ruleIndex];

    var nextFlowName = 'RulesEngine' + rule.type;

    var nextFlow = contactFlows.find(flow => flow.Name === nextFlowName);

    if (nextFlow === undefined)
    {
      throw new Error('Could not find contact flow named: ' + nextFlowName);
    }

    var response = {
      nextAction: rule.type,
      nextFlowName: nextFlowName,
      nextFlowArn: nextFlow.Arn,
      nextFlowId: nextFlow.Id,
      ruleIndex: "" + (ruleIndex + 1)
    };

    var keys = Object.keys(rule.params);

    keys.forEach(key => {
      response[key] = rule.params[key];
    });

    console.log('[INFO] selected next rule: ' + JSON.stringify(response, null, 2));

    return response;
  }
  catch (error)
  {
    console.log('[ERROR] failed to select next rule', error);
    throw error; 
  }
};

