var requestUtils = require('./utils/RequestUtils.js');
var dynamoUtils = require('./utils/DynamoUtils.js');

/**
 * Handles processing the DTMF menu selection returuing the next rule set
 * on success or an error flag if an invalid input is selected
 */
exports.handler = async(event, context, callback) =>
{
  try
  {
    requestUtils.logRequest(event);

    // Grab the contact id from the event
    var contactId = event.Details.ContactData.ContactId;

    // Load the current customer state
    var customerState = await dynamoUtils.getParsedCustomerState(process.env.STATE_TABLE, contactId);

    // Fetches the selected option
    var selectedOption = event.Details.Parameters.selectedOption;

    console.log('[INFO] found raw user input: ' + selectedOption);

    if (selectedOption === '*')
    {
      selectedOption = 'Star';
    }

    if (selectedOption === '#')
    {
      selectedOption = 'Pound';
    }

    if (selectedOption === '+')
    {
      selectedOption = 'Plus';
    }

    console.log('[INFO] found processed user input: ' + selectedOption);

    var configuredOption = customerState['CurrentRule_dtmf' + selectedOption];

    if (configuredOption === undefined)
    {
      console.log(`[ERROR] user selected an invalid option: ${selectedOption}`);

      customerState.validSelection = 'false';
      return requestUtils.buildCustomerStateResponse(customerState);
    }
    else
    {
      console.log(`[INFO] user selected a valid option: ${selectedOption} mapped to rule set: ${configuredOption}`);

      customerState.NextRuleSet = configuredOption;
      await dynamoUtils.persistCustomerState(process.env.STATE_TABLE, contactId, customerState, [ 'NextRuleSet' ]);

      customerState.validSelection = 'true';
      return requestUtils.buildCustomerStateResponse(customerState);
    }
  }
  catch (error)
  {
    console.log('[ERROR] failed to process DTMF input', error);
    throw error;
  }
};

