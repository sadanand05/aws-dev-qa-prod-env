var requestUtils = require('./utils/RequestUtils.js');
var dynamoUtils = require('./utils/DynamoUtils.js');
var connectUtils = require('./utils/ConnectUtils.js');
var rulesEngine = require('./utils/RulesEngine.js');

const { v4: uuidv4 } = require('uuid');

var contactFlows = null;
var queues = null;

/**
 * Infers intent for a message
 */
exports.handler = async(event, context, callback) =>
{
  try
  {
    requestUtils.logRequest(event);
    requestUtils.checkOrigin(event);
    await requestUtils.verifyAPIKey(event);

    if (contactFlows === null)
    {
      contactFlows = await connectUtils.listContactFlows(process.env.INSTANCE_ID);
    }

    if (queues === null)
    {
      queues = await connectUtils.listQueues(process.env.INSTANCE_ID);
    }

    var body = JSON.parse(event.body);
    var messageString = body.message;
    var sessionId = uuidv4();

    var message = JSON.parse(messageString);

    if (message === undefined)
    {
      throw new Error('Missing request field: message');
    }

    if (message.Customer === undefined)
    {
      throw new Error('Missing request field: message.Customer');
    }

    if (message.System === undefined)
    {
      throw new Error('Missing request field: message.System');
    }

    if (message.State === undefined)
    {
      throw new Error('Missing request field: message.State');
    }

    // Load the rules
    var rules = await dynamoUtils.getRules(process.env.RULES_TABLE);

    // Filter for eanbled rules
    var enabledRules = rules.filter(rule => rule.enabled === true);

    // Find the matching rules
    var matchedRules = rulesEngine.evaluate(message, enabledRules, queues, contactFlows);

    callback(null, requestUtils.buildSuccessfulResponse({
      inference: matchedRules
    }));
  }
  catch (error)
  {
    console.log('[ERROR] failed to inference rules engine', error);
    callback(null, requestUtils.buildErrorResponse(error)); 
  }
};
