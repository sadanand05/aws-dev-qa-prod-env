
var requestUtils = require('./utils/RequestUtils.js');
var connectUtils = require('./utils/ConnectUtils.js');
var dynamoUtils = require('./utils/DynamoUtils.js');

var contactFlows = null;

/**
 * Make an outbound call with some loaded customer and system data
 */
exports.handler = async function(event, context, callback) 
{
  try
  {
    requestUtils.logRequest(event);
    requestUtils.checkOrigin(event);
    var user = await requestUtils.verifyAPIKey(event);
    requestUtils.requireRole(user, ['ADMINISTRATOR', 'POWER_USER', 'TESTER']);

    if (contactFlows === null)
    {
      contactFlows = await connectUtils.listContactFlows(process.env.INSTANCE_ID);
    }

    var mainFlow = contactFlows.find(flow => flow.Name === 'RulesEngineBootstrap');

    if (mainFlow === undefined)
    {
      throw new Error('Failed to find contact flow: RulesEngineBootstrap');
    }

    var request = JSON.parse(event.body);
    var phoneNumber = request.phoneNumber;
    var customerState = request.customerState;

    if (customerState.System === undefined || customerState.System.DialledNumber === undefined)
    {
      throw new Error('Input customer state missing System.DialledNumber');
    }

    var inboundNumber = customerState.System.DialledNumber;

    console.log(`[INFO] about to make outbound call from: ${inboundNumber} to: ${phoneNumber}`);

    var contactId = await connectUtils.intiateOutboundCall(
      process.env.INSTANCE_ID,
      mainFlow.Id,
      inboundNumber,
      phoneNumber);

    // Insert state for this contact into DynamoDB
    var stateToSave = new Set();

    var keys = Object.keys(customerState);

    keys.forEach(key => {
      stateToSave.add(key);
    });

    // If the test doesn't override the customer phone number use the dialled number
    if (customerState.CustomerPhoneNumber === undefined)
    {
      customerState.CustomerPhoneNumber = phoneNumber;
      stateToSave.add('CustomerPhoneNumber');
    }
    
    customerState.IsOutbound = 'true';
    stateToSave.add('IsOutbound');

    console.log(`[INFO] Persisting contact: ${contactId} state: ${JSON.stringify(customerState, null, 2)} with saves: ${Array.from(stateToSave).join(', ')}`);

    await dynamoUtils.persistCustomerState(process.env.STATE_TABLE, contactId, customerState, Array.from(stateToSave));

    console.log(`[INFO] state persisted`);

    callback(null, requestUtils.buildSuccessfulResponse({
      message: 'Phone call initiated with state'
    }));
  }
  catch (error)
  {
    console.log('[ERROR] failed to initiate phone call with state', error);
    callback(null, requestUtils.buildErrorResponse(error));
  }  
};
