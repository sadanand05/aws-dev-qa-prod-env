
var requestUtils = require('./utils/RequestUtils.js');
var dynamoUtils = require('./utils/DynamoUtils.js');
var configUtils = require('./utils/ConfigUtils.js');

/**
 * Deletes a test
 */
exports.handler = async(event, context, callback) =>
{
  try
  {
    requestUtils.logRequest(event);
    requestUtils.checkOrigin(event);
    var user = await requestUtils.verifyAPIKey(event);
    requestUtils.requireRole(user, ['ADMINISTRATOR', 'POWER_USER']);

    var testId = event.queryStringParameters.testId;

    await dynamoUtils.deleteTest(process.env.TESTS_TABLE, testId);

    // Mark the last change to now
    await configUtils.setLastChangeTimestampToNow(process.env.CONFIG_TABLE);

    callback(null, requestUtils.buildSuccessfulResponse({
      message: 'Test deleted successfully'
    }));
  }
  catch (error)
  {
    console.log('[ERROR] failed to delete test', error);
    callback(null, requestUtils.buildErrorResponse(error)); 
  }
};
