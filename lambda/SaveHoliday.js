
var requestUtils = require('./utils/RequestUtils.js');
var dynamoUtils = require('./utils/DynamoUtils.js');
var configUtils = require('./utils/ConfigUtils.js');

const { v4: uuidv4 } = require('uuid');

/**
 * Saves a holiday in DynamoDB
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
    var holidayId = body.holidayId;
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

    // Find the editing holiday
    var existing = holidays.find(holiday => holiday.holidayId === holidayId);

    if (existing === undefined)
    {
      throw new Error('Failed to find existing holiday to update');
    }

    existing.name = name;
    existing.description = description;
    existing.closed = closed;
    existing.when = when;

    var holidaysToSave = JSON.stringify(holidays);

    await configUtils.updateConfigItem(process.env.CONFIG_TABLE, 'Holidays', holidaysToSave);

    // Mark the last change to now
    await configUtils.setLastChangeTimestampToNow(process.env.CONFIG_TABLE);

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

