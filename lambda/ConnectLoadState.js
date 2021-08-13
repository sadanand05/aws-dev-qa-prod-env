var requestUtils = require('./utils/RequestUtils.js');
var dynamoUtils = require('./utils/DynamoUtils.js');

/**
 * Loads state for this contact
 */
exports.handler = async(event, context, callback) =>
{
  try
  {
    requestUtils.logRequest(event);

    var contactId = event.Details.ContactData.ContactId;

    var customerState = await dynamoUtils.getParsedCustomerState(process.env.STATE_TABLE, contactId);

    var response = requestUtils.buildCustomerStateResponse(customerState);

    console.log('[DEBUG] made load state response: ' + JSON.stringify(response));

    return response;
  }
  catch (error)
  {
    console.log('[ERROR] failed to load state', error);
    throw error; 
  }
};

