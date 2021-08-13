
var requestUtils = require('./utils/RequestUtils.js');
var dynamoUtils = require('./utils/DynamoUtils.js');
var configUtils = require('./utils/ConfigUtils.js');

const { v4: uuidv4 } = require('uuid');

/**
 * Deletes a holiday in DynamoDB
 */
exports.handler = async(event, context, callback) =>
{
  try
  {
    requestUtils.logRequest(event);
    requestUtils.checkOrigin(event);
    var user = await requestUtils.verifyAPIKey(event);
    requestUtils.requireRole(user, ['ADMINISTRATOR', 'POWER_USER']);

    var holidayId = event.queryStringParameters.holidayId;

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
      throw new Error('Failed to find existing holiday to delete');
    }

    var holidaysToKeep = [];

    holidays.forEach(holiday => {
      if (holiday.holidayId !== holidayId)
      {
        holidaysToKeep.push(holiday);
      }
    });

    var holidaysToSave = JSON.stringify(holidaysToKeep);

    await configUtils.updateConfigItem(process.env.CONFIG_TABLE, 'Holidays', holidaysToSave);

    // Mark the last change to now
    await configUtils.setLastChangeTimestampToNow(process.env.CONFIG_TABLE);
    
    callback(null, requestUtils.buildSuccessfulResponse({
      success: true
    }));
  }
  catch (error)
  {
    console.log('[ERROR] failed to delete a holiday', error);
    callback(null, requestUtils.buildErrorResponse(error)); 
  }
};

