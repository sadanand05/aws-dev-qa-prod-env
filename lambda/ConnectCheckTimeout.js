var requestUtils = require('./utils/RequestUtils.js');
var dynamoUtils = require('./utils/DynamoUtils.js');

var moment = require('moment');

/**
 * Checks for time out in an integration lamnda call
 * returning the customer state and potentially updating the
 * integration result to TIMEOUT
 */
exports.handler = async(event, context, callback) =>
{
  try
  {
    requestUtils.logRequest(event);

    var contactId = event.Details.ContactData.ContactId;

    var customerState = await dynamoUtils.getParsedCustomerState(process.env.STATE_TABLE, contactId);

    console.log('[INFO] loaded customer state: ' + JSON.stringify(customerState, null, 2));

    requestUtils.requireParameter('IntegrationStart', customerState.IntegrationStart);
    requestUtils.requireParameter('CurrentRule_functionTimeout', customerState.CurrentRule_functionTimeout);

    var timeout = moment(customerState.IntegrationStart).add(+customerState.CurrentRule_functionTimeout, 'seconds');

    var now = moment();

    var timeoutSeconds = now.diff(timeout, 'seconds');

    console.log(`[INFO] found timeout in seconds: ${timeoutSeconds}`);

    if (now.isAfter(timeout))
    {
      var timeoutSeconds = now.diff(timeout, 'seconds');
      console.log(`[ERROR] integration timeout by ${timeoutSeconds} detected`);
      customerState.IntegrationStatus = 'TIMEOUT';
      customerState.IntegrationErrorCause = 'The request timed out';
      customerState.IntegrationEnd = moment();
      await dynamoUtils.persistCustomerState(process.env.STATE_TABLE, contactId, customerState, [ 'IntegrationStatus', 'IntegrationEnd', 'IntegrationErrorCause' ]);
    }
    else
    {
      console.log(`[INFO] integration request still has time`);
    }

    return requestUtils.buildCustomerStateResponse(customerState);
  }
  catch (error)
  {
    console.log('[ERROR] failed to check for integration timeout', error);
    throw error; 
  }
};

