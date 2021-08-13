
var requestUtils = require('./utils/RequestUtils.js');
var dynamoUtils = require('./utils/DynamoUtils.js');
var configUtils = require('./utils/ConfigUtils.js');

var moment = require('moment');

/**
 * Fetches the main events
 */
exports.handler = async(event, context, callback) =>
{
  try
  {
    requestUtils.logRequest(event);
    requestUtils.checkOrigin(event);
    var user = await requestUtils.verifyAPIKey(event);
    requestUtils.requireRole(user, ['ADMINISTRATOR', 'POWER_USER', 'TESTER']);

    var events = await dynamoUtils.getMainEvents(process.env.MAIN_EVENTS_TABLE);

    events.sort(function (a, b) {
      return a.startTimestamp.localeCompare(b.startTimestamp);
    });

    var now = moment();

    events.forEach(event => {

      event.fastPathEnabled = 'false';

      if (event.active && event.fastPathMinutes !== undefined && event.fastPathMinutes > 0)
      {
        var fastPathEnd = moment(event.startTimestamp).add(30, 'minutes');
        var fastPathStart = moment(event.startTimestamp).add(-event.fastPathMinutes, 'minutes');

        event.fastPathStart = fastPathStart.format();

        if (fastPathStart.isBefore(now) && fastPathEnd.isAfter(now))
        {
          event.fastPathEnabled = 'true';
        }
      }
    });

    callback(null, requestUtils.buildSuccessfulResponse({
      events: events
    }));
  }
  catch (error)
  {
    console.log('[ERROR] failed to load main events', error);
    callback(null, requestUtils.buildErrorResponse(error)); 
  }
};

