
var requestUtils = require('./utils/RequestUtils.js');
var dynamoUtils = require('./utils/DynamoUtils.js');

/**
 * Fetches a test
 */
exports.handler = async(event, context, callback) =>
{
  try
  {
    requestUtils.logRequest(event);
    requestUtils.checkOrigin(event);
    await requestUtils.verifyAPIKey(event);
    var user = await requestUtils.verifyAPIKey(event);
    requestUtils.requireRole(user, ['ADMINISTRATOR', 'POWER_USER', 'TESTER']);

    var testId = event.queryStringParameters.testId;
    var test = await dynamoUtils.getTest(process.env.TESTS_TABLE, testId);

    callback(null, requestUtils.buildSuccessfulResponse({
      test: test
    }));
  }
  catch (error)
  {
    console.log('[ERROR] failed to load test', error);
    callback(null, requestUtils.buildErrorResponse(error)); 
  }
};

