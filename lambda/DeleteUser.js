
var requestUtils = require('./utils/RequestUtils.js');
var dynamoUtils = require('./utils/DynamoUtils.js');
var configUtils = require('./utils/ConfigUtils.js');

/**
 * Deletes a user
 */
exports.handler = async(event, context, callback) =>
{
  try
  {
    requestUtils.logRequest(event);
    requestUtils.checkOrigin(event);
    var user = await requestUtils.verifyAPIKey(event);
    requestUtils.requireRole(user, ['ADMINISTRATOR']);

    var userId = event.queryStringParameters.userId;

    await dynamoUtils.deleteUser(process.env.USERS_TABLE, userId);

    // Mark the last change to now
    await configUtils.setLastChangeTimestampToNow(process.env.CONFIG_TABLE);

    callback(null, requestUtils.buildSuccessfulResponse({
      message: 'User deleted successfully'
    }));
  }
  catch (error)
  {
    console.log('[ERROR] failed to delete user', error);
    callback(null, requestUtils.buildErrorResponse(error)); 
  }
};
