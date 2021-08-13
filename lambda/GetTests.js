
var requestUtils = require('./utils/RequestUtils.js');
var dynamoUtils = require('./utils/DynamoUtils.js');

/**
 * Fetches all tests
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

    var tests = await dynamoUtils.getTests(process.env.TESTS_TABLE);

    callback(null, requestUtils.buildSuccessfulResponse({
      tests: tests
    }));
  } 
  catch (error)
  {
    console.log('[ERROR] failed to load tests', error);
    callback(null, requestUtils.buildErrorResponse(error)); 
  }
};

