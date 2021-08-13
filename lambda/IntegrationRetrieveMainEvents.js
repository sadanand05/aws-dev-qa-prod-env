
var requestUtils = require('./utils/RequestUtils.js');
var dynamoUtils = require('./utils/DynamoUtils.js');

var moment = require('moment');

/**
 * Lambda function that loads main events from DynamoDB
 */
exports.handler = async(event, context, callback) =>
{

  var contactId = undefined;

  try
  {
    requestUtils.logRequest(event);

    requestUtils.requireParameter('ContactId', event.ContactId);

    contactId = event.ContactId;

    // Load customer state
    var customerState = await dynamoUtils.getParsedCustomerState(process.env.STATE_TABLE, contactId);
    requestUtils.requireParameter('CurrentRule_functionOutputKey', customerState.CurrentRule_functionOutputKey);

    // Mark this integration as RUNNING
    var toUpdate = [ 'IntegrationStatus' ];
    customerState.IntegrationStatus = 'RUN';
    await dynamoUtils.persistCustomerState(process.env.STATE_TABLE, contactId, customerState, toUpdate);

    // Load the main events form DynamoDB
    var mainEvents = await dynamoUtils.getMainEvents(process.env.MAIN_EVENTS_TABLE);

    // Filter for the active ones
    var activeMainEvents = mainEvents.filter(event => event.active === true);

    // Sort by increasing start time
    activeMainEvents.sort(function (a, b) {
      return a.startTimestamp.localeCompare(b.startTimestamp);
    });

    /**
     * Check each main event to see if it is currently in fast path mode
     */
    var now = moment().utc();

    var fastPathEnabled = 'false';

    var fastPathEvent = undefined;

    activeMainEvents.forEach(event => {

      event.fastPathEnabled = 'false';

      if (event.fastPathMinutes !== undefined && event.fastPathMinutes > 0)
      {
        var fastPathEnd = moment(event.startTimestamp).add(30, 'minutes');
        var fastPathStart = moment(event.startTimestamp).add(-event.fastPathMinutes, 'minutes');

        if (fastPathStart.isBefore(now) && fastPathEnd.isAfter(now))
        {
          event.fastPathEnabled = 'true';
          fastPathEnabled = 'true';
          console.log('Enabling fast path');

          if (fastPathEvent === undefined)
          {
            fastPathEvent = event;
          }
        }
      }
    });

    var result = {
      fastPathEnabled: fastPathEnabled,
      fastPathEvent: fastPathEvent,
      activeEvents: activeMainEvents
    };

    console.log('[INFO] loaded active main events: ' + JSON.stringify(result));

    customerState[customerState.CurrentRule_functionOutputKey] = result;
    customerState.IntegrationStatus = 'DONE';
    customerState.IntegrationErrorCause = undefined;
    customerState.IntegrationEnd = moment().utc().format();
    toUpdate = [ 'IntegrationStatus', 'IntegrationEnd', 'IntegrationErrorCause', customerState.CurrentRule_functionOutputKey ];
    await dynamoUtils.persistCustomerState(process.env.STATE_TABLE, contactId, customerState, toUpdate);
  }
  catch (error)
  {
    // Update the failure state
    if (contactId !== undefined)
    {
      console.log('[ERROR] recording failure in state', error);
      customerState.IntegrationStatus = 'ERROR';
      customerState.IntegrationErrorCause = error.message;
      customerState.IntegrationEnd = moment().utc().format();
      customerState[customerState.CurrentRule_functionOutputKey] = undefined;
      toUpdate = [ 'IntegrationStatus', 'IntegrationEnd', 'IntegrationErrorCause', customerState.CurrentRule_functionOutputKey ];
      await dynamoUtils.persistCustomerState(process.env.STATE_TABLE, contactId, customerState, toUpdate);
    }
    // Log the failure but skip state recording due to missing contact id
    else
    {
      console.log('[ERROR] Skipping recording failure as no ContactId available', error);
    }

    throw error;
  }
};
