var requestUtils = require('./utils/RequestUtils.js');
var dynamoUtils = require('./utils/DynamoUtils.js');
var lambdaUtils = require('./utils/LambdaUtils.js');

var moment = require('moment');

/**
 * Starts an integration request by updating state to indicate
 * starting then kicks off a Lambda function asynchronously.
 * State goes from START => RUN => (DONE or ERROR or TIMEOUT)
 */
exports.handler = async(event, context, callback) =>
{

  var contactId = undefined;

  try
  {
    requestUtils.logRequest(event);

    requestUtils.requireParameter('ContactId', event.Details.ContactData.ContactId);

    contactId = event.Details.ContactData.ContactId;

    // Load customer state
    var customerState = await dynamoUtils.getParsedCustomerState(process.env.STATE_TABLE, contactId);

    // Validate the function ARN
    requestUtils.requireParameter('CurrentRule_functionArn', customerState.CurrentRule_functionArn);
    var functionArn = customerState.CurrentRule_functionArn;

    // Update state to indicate we are starting
    var toUpdate = [ 'IntegrationStatus', 'IntegrationEnd', 'IntegrationStart' ];
    customerState.IntegrationStatus = 'START';
    customerState.IntegrationStart = moment.utc().format();
    customerState.IntegrationEnd = undefined;
    await dynamoUtils.persistCustomerState(process.env.STATE_TABLE, contactId, customerState, toUpdate);

    // Invoke the Lambda function passing the contact id
    await lambdaUtils.invokeAsync(functionArn, { ContactId: contactId });

    return {
      status: 'START'
    };
  }
  catch (error)
  {
    // Update the failure state
    if (contactId !== undefined)
    {
      console.log('[ERROR] recording failure in state', error);
      customerState.IntegrationStatus = 'ERROR';
      customerState.IntegrationEnd = moment().utc().format();
      toUpdate = [ 'IntegrationStatus', 'IntegrationEnd' ];
      await dynamoUtils.persistCustomerState(process.env.STATE_TABLE, contactId, customerState, toUpdate);
    }
    // Log the failure but skip state recording due to missing contact id
    else
    {
      console.log('[ERROR] Skipping recording failure as no ContactId available', error);
    }

    return {
      status: 'ERROR'
    };
  }
};

