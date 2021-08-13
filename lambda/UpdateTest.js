
var requestUtils = require('./utils/RequestUtils.js');
var dynamoUtils = require('./utils/DynamoUtils.js');
var configUtils = require('./utils/ConfigUtils.js');

/**
 * Updates an existing test in DynamoDB
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
    var testId = body.testId;
    var testDescription = body.testDescription;
    var testPayload = body.testPayload;

    await dynamoUtils.updateTest(process.env.TESTS_TABLE, 
      testId, testDescription, testPayload);

    // Mark the last change to now
    await configUtils.setLastChangeTimestampToNow(process.env.CONFIG_TABLE);

    callback(null, requestUtils.buildSuccessfulResponse({
      message: 'Test updated successfully'
    }));
  }
  catch (error)
  {
    console.log('[ERROR] failed to update test', error);
    callback(null, requestUtils.buildErrorResponse(error)); 
  }
};
