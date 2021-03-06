var requestUtils = require('./utils/RequestUtils.js');
var dynamoUtils = require('./utils/DynamoUtils.js');

var moment = require('moment');

/**
 * Sets a range of state flags for a customer expecting input parameters in the format:
 *  key1 = 'stateKey'
 *  value1 = 'stateValue'
 * 
 * If the value is 'increment' this will add one to an existing value
 * and if the value is undefined will set it to 1
 * 
 * Missing or empty values for keys will result in state deletions for that key.
 * 
 * Gaps in key indices are not currently supported.
 * 
 * Loads and returns all state values for this contact in the response in the format:
 * 
 * {
 *    stateKey: stateValue,
 *    ...
 * }
 * 
 */
exports.handler = async(event, context, callback) =>
{
  try
  {
    requestUtils.logRequest(event);

    var contactId = event.Details.ContactData.ContactId;

    var statesToAdd = [];
    var statesToRemove = [];

    var index = 1;

    // Load customer state
    var customerState = await dynamoUtils.getParsedCustomerState(process.env.STATE_TABLE, contactId);
    var stateToSave = new Set();

    // console.log('[INFO] loaded customer state: ' + JSON.stringify(customerState, null, 2));

    while (event.Details.Parameters['key' + index] !== undefined)
    {
      var key = event.Details.Parameters['key' + index];

      if (key === '')
      {
        continue;
      }

      var value = event.Details.Parameters['value' + index];

      if (value !== undefined && value !== null && value !== '' && value !== 'null')
      {
        if (value === 'increment')
        {
          // Look in the customer state and try and safely increment
          var existingValue = customerState[key];

          if (!isNumber(existingValue))
          {
            value = '1';
            console.log(`[INFO] incremented missing or invalid value for key: ${key} to 1`);
          }
          else
          {
            value = '' + (+existingValue + 1);
            console.log(`[INFO] incremented existing value for key: ${key} to ${value}`);
          }
        }

        updateState(customerState, stateToSave, key, value);
      }
      else
      {
        updateState(customerState, stateToSave, key, undefined);
      }

      index++;
    }

    console.log('[INFO] found states to update: ' + Array.from(stateToSave).join(', '));

    // Persist the changed state fields to DynamoDB
    await dynamoUtils.persistCustomerState(process.env.STATE_TABLE, contactId, customerState, Array.from(stateToSave));

    // Echo back the customer state
    return requestUtils.buildCustomerStateResponse(customerState);
  }
  catch (error)
  {
    console.log('[ERROR] failed to update customer state', error);
    throw error; 
  }
};

/**
 * Checks to see if value is a number
 */
function isNumber(value)
{
  if (value === undefined || 
      value === null || 
      value === '' || 
      value === 'true' || 
      value === 'false' || 
      isNaN(value))
  {
    return false;
  }
  else
  {
    return true;
  }
}

/**
 * Writes to in memory state tracking changes for persisting.
 * Avoids deleting non-existent keys
 */
function updateState(customerState, stateToSave, key, value)
{
  if (value === undefined && customerState[key] === undefined)
  {
    return;
  }

  customerState[key] = value;
  stateToSave.add(key)
}


