
var requestUtils = require('./utils/RequestUtils.js');
var dynamoUtils = require('./utils/DynamoUtils.js');

/**
 * Fetches all users
 */
exports.handler = async(event, context, callback) =>
{
  try
  {
    requestUtils.logRequest(event);
    requestUtils.checkOrigin(event);
    var user = await requestUtils.verifyAPIKey(event);
    requestUtils.requireRole(user, ['ADMINISTRATOR']);

    var users = await dynamoUtils.getUsers(process.env.USERS_TABLE);

    callback(null, requestUtils.buildSuccessfulResponse({
      users: users
    }));
  }
  catch (error)
  {
    console.log('[ERROR] failed to users', error);
    callback(null, requestUtils.buildErrorResponse(error)); 
  }
};
