
var requestUtils = require('./utils/RequestUtils.js');
var connectUtils = require('./utils/ConnectUtils.js');

/**
 * Repairs lambda functions flows
 */
exports.handler = async(event, context, callback) =>
{
  try
  {
    requestUtils.logRequest(event);
    requestUtils.checkOrigin(event);
    var user = await requestUtils.verifyAPIKey(event);
    requestUtils.requireRole(user, ['ADMINISTRATOR']);

    var repairResult = await connectUtils.repairLambdaFunctions(process.env.INSTANCE_ID, process.env.STAGE, process.env.SERVICE);

    callback(null, requestUtils.buildSuccessfulResponse(repairResult));
  }
  catch (error)
  {
    console.log('[ERROR] failed to repair lambda functions', error);
    callback(null, requestUtils.buildErrorResponse(error)); 
  }
};
