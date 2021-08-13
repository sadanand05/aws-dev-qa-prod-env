
var requestUtils = require('./utils/RequestUtils.js');
var dynamoUtils = require('./utils/DynamoUtils.js');
var configUtils = require('./utils/ConfigUtils.js');

/**
 * Updates an existing user in DyanmoDB
 */
exports.handler = async(event, context, callback) =>
{
  try
  {
    requestUtils.logRequest(event);
    requestUtils.checkOrigin(event);
    var user = await requestUtils.verifyAPIKey(event);
    requestUtils.requireRole(user, ['ADMINISTRATOR']);

    var body = JSON.parse(event.body);
    var userId = body.userId;
    var userEnabled = body.userEnabled;
    var emailAddress = body.emailAddress;
    var firstName = body.firstName;
    var lastName = body.lastName;
    var userRole = body.userRole;
    var apiKey = body.apiKey;

    // Check for an existing user with this email
    var existingUser = await dynamoUtils.getUserByEmailAddress(process.env.USERS_TABLE, emailAddress);
    if (existingUser !== undefined && existingUser.userId !== userId)
    {
      console.log('[ERROR] another user already exists with this email address: ' + emailAddress);

      callback(null, requestUtils.buildFailureResponse(409, { 
        message: 'User already exists for email' 
      }));

      return;
    }

    // Check for an existing user with this API key if we got a new API key
    if (apiKey !== '')
    {
      existingUser = await dynamoUtils.getUserByAPIKey(process.env.USERS_TABLE, apiKey);
      if (existingUser !== undefined && existingUser.userId !== userId)
      {
        console.log('[ERROR] another user already exists with this API key: ' + apiKey);

        callback(null, requestUtils.buildFailureResponse(409, { 
          message: 'User already exists with API key' 
        }));

        return;
      }
    }

    await dynamoUtils.updateUser(process.env.USERS_TABLE, 
      userId, firstName, lastName, emailAddress, userRole, apiKey, userEnabled);

    // Mark the last change to now
    await configUtils.setLastChangeTimestampToNow(process.env.CONFIG_TABLE);

    callback(null, requestUtils.buildSuccessfulResponse({
      message: 'User updated successfully'
    }));
  }
  catch (error)
  {
    console.log('[ERROR] failed to update user', error);
    callback(null, requestUtils.buildErrorResponse(error)); 
  }
};
