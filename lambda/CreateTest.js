
var requestUtils = require('./utils/RequestUtils.js');
var dynamoUtils = require('./utils/DynamoUtils.js');
var configUtils = require('./utils/ConfigUtils.js');

/**
 * Creates a new test in DynamoDB
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
    var testName = body.testName;
    var testDescription = body.testDescription;
    var testPayload = body.testPayload;

    // Check for an existing test with this name and fail if it exists
    if (await dynamoUtils.checkTestExistsByName(process.env.TESTS_TABLE, testName))
    {
      console.log('[ERROR] test already exists with this name: ' + testName);

      callback(null, requestUtils.buildFailureResponse(409, { 
        message: 'Test already exists' 
      }));
    }
    // This is a novel test so create it
    else
    {
      var testId = await dynamoUtils.insertTest(process.env.TESTS_TABLE, 
        testName, testDescription, testPayload);

      // Mark the last change to now
      await configUtils.setLastChangeTimestampToNow(process.env.CONFIG_TABLE);

      callback(null, requestUtils.buildSuccessfulResponse({
        testId: testId
      }));
    }

  }
  catch (error)
  {
    console.log('[ERROR] failed to create test', error);
    callback(null, requestUtils.buildErrorResponse(error)); 
  }
};

