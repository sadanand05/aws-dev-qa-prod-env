
var requestUtils = require('./utils/RequestUtils.js');
var connectUtils = require('./utils/ConnectUtils.js');
var dynamoUtils = require('./utils/DynamoUtils.js');

var configUtils = require('./utils/ConfigUtils.js');

var moment = require('moment');

/**
 * Fetches operating hours from Connect and writes them to DynamoDB config
 * this is triggered by regular CloudWatch CRON
 */
exports.handler = async(event, context, callback) =>
{
  try
  {
    requestUtils.logRequest(event);

    var operatingHours = await connectUtils.getHoursOfOperations(process.env.INSTANCE_ID);

    var operatingHoursData = JSON.stringify(operatingHours);

    await dynamoUtils.updateConfigItem(process.env.CONFIG_TABLE, 'OperatingHours', operatingHoursData);

    // Mark the last change to now
    await configUtils.setLastChangeTimestampToNow(process.env.CONFIG_TABLE);

    console.log('[INFO] updated fetched and updated operating hours in DynamoDB');

    return {
      success: true
    }
  }
  catch (error)
  {
    console.log('[ERROR] failed to fetch and update operating hours in DynamoDB', error);
    throw error;
  }
};
