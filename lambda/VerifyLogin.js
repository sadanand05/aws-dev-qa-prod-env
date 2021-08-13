
var requestUtils = require('./utils/RequestUtils.js');

/**
 * Checks the API key for a customer
 */
exports.handler = async(event, context, callback) =>
{
  try
  {
    requestUtils.logRequest(event);
    requestUtils.checkOrigin(event);
    var user = await requestUtils.verifyAPIKey(event);
    callback(null, requestUtils.buildSuccessfulResponse({user: user}));
  }
  catch (error)
  {
    console.log('[ERROR] failed to verify login', error);
    callback(null, requestUtils.buildErrorResponse(error)); 
  }
};


