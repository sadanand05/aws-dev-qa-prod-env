var requestUtils = require('./utils/RequestUtils.js');
var dynamoUtils = require('./utils/DynamoUtils.js');
var handlebarsUtils = require('./utils/HandlebarsUtils.js');

var moment = require('moment');

/**
 * Handles processing the DTMF input
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

    var outputStateKey = customerState.CurrentRule_outputStateKey;
    var minLength = +customerState.CurrentRule_minLength;
    var maxLength = +customerState.CurrentRule_maxLength;
    var dataType = customerState.CurrentRule_dataType;

    // Fetches the customer input
    var input = event.Details.Parameters.input;

    console.log('[INFO] found raw user input: ' + input);

    var validInput = true;

    if (input === undefined || input === null || input === 'Timeout')
    {
      console.log('[ERROR] missing input');
      validInput = false;
    }
    else if (input.length < minLength || input.length > maxLength)
    {
      console.log(`[ERROR] input: ${input} length: ${input.length} is not within min: ${minLength} and max: ${maxLength} lengths`);
      validInput = false;
    }
    else
    {
      switch (dataType)
      {
        case 'Number':
        {
          if (!input.match(/^[0-9]*$/))
          {
            console.log(`[ERROR] input: ${input} is not a valid number`);
            validInput = false;
          }
          break;
        }
        case 'Phone':
        {
          if (!input.match(/^0[0-9]{9}$/))
          {
            console.log(`[ERROR] input: ${input} is not a valid number`);
            validInput = false;
          }
          break;
        }
        case 'Date':
        {
          if (!input.match(/^[0-3]{1}[0-9]{1}[0-1]{1}[0-9]{1}[1-2]{1}[0-9]{3}$/))
          {
            console.log(`[ERROR] input: ${input} is not a valid date by regex`);
            validInput = false;
          }
          else
          {
            if (!moment(input, 'DDMMYYYY', true).isValid())
            {
              console.log(`[ERROR] input: ${input} is not a valid date by parse`);
              validInput = false;
            }
          }
          break;
        }
      }
    }

    var response = {};

    // Copy in the state for the current rule
    var stateKeys = Object.keys(customerState);

    stateKeys.forEach(key => {
      if (key.startsWith('CurrentRule_'))
      {
        response[key] = customerState[key];
      }
    });

    customerState[outputStateKey] = input;

    // Advise success
    if (validInput)
    {
      console.log(`[INFO] user entered valid input: ${input} storing in state key: ${outputStateKey}`);
      response.CurrentRule_validInput = 'true';
    }
    // Advise failure
    else
    {
      console.log(`[ERROR] user entered invalid input: ${input}`);      
      response.CurrentRule_validInput = 'false';
    }

    handlebarsUtils.templateMapObject(response, customerState);

    console.log(`[INFO] templated response: ${JSON.stringify(response, null, 2)} message using state: ${JSON.stringify(customerState, null, 2)}`);

    return response;
  }
  catch (error)
  {
    console.log('[ERROR] failed to process DTMFInput rule', error);
    throw error;
  }
};

