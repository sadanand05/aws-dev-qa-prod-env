
var requestUtils = require('./utils/RequestUtils.js');
var dynamoUtils = require('./utils/DynamoUtils.js');
var configUtils = require('./utils/ConfigUtils.js');

const { v4: uuidv4 } = require('uuid');

/**
 * Creates a new holiday in DynamoDB
 */
exports.handler = async(event, context, callback) =>
{
  try
  {
    requestUtils.logRequest(event);
    requestUtils.checkOrigin(event);
    var user = await requestUtils.verifyAPIKey(event);
    requestUtils.requireRole(user, ['ADMINISTRATOR', 'POWER_USER']);

    var body = JSON.parse(event.body);
    var when = body.when;
    var name = body.name;
    var description = body.description;
    var closed = body.closed;

    // Load up the existing holidays
    var holidaysConfigItem = await configUtils.getUncachedConfigItem(process.env.CONFIG_TABLE, 'Holidays');

    var holidays = [];

    if (holidaysConfigItem !== undefined)
    {
      holidays = JSON.parse(holidaysConfigItem.configData);
    }

    var holidayId = uuidv4();

    holidays.push({
      holidayId: holidayId,
      when: when,
      name: name,
      description: description,
      closed: closed
    });

    var holidaysToSave = JSON.stringify(holidays);

    await configUtils.updateConfigItem(process.env.CONFIG_TABLE, 'Holidays', holidaysToSave);

    callback(null, requestUtils.buildSuccessfulResponse({
      holidayId: holidayId
    }));
  }
  catch (error)
  {
    console.log('[ERROR] failed to create holiday', error);
    callback(null, requestUtils.buildErrorResponse(error)); 
  }
};

