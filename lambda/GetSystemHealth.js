
var requestUtils = require('./utils/RequestUtils.js');
var connectUtils = require('./utils/ConnectUtils.js');

/**
 * Fetches system health of contact flows and Lambda functions
 */
exports.handler = async(event, context, callback) =>
{
  try
  {
    requestUtils.logRequest(event);
    requestUtils.checkOrigin(event);
    var user = await requestUtils.verifyAPIKey(event);
    requestUtils.requireRole(user, ['ADMINISTRATOR']);

    var response = {
      systemHealth: {
        status: 'HEALTHY'
      }
    };

    response.systemHealth.contactFlows = await connectUtils.checkContactFlowStatus(process.env.INSTANCE_ID, 
      process.env.STAGE, process.env.SERVICE);

    response.systemHealth.lambdaFunctions = await connectUtils.checkLambdaFunctionStatus(process.env.INSTANCE_ID, 
      process.env.STAGE, process.env.SERVICE);

    if (response.systemHealth.contactFlows.status === 'UNHEALTHY' || response.systemHealth.lambdaFunctions.status === 'UNHEALTHY')
    {
      response.systemHealth.status = 'UNHEALTHY';
    }

    callback(null, requestUtils.buildSuccessfulResponse(response));
  }
  catch (error)
  {
    console.log('[ERROR] failed to fetch system health', error);
    callback(null, requestUtils.buildErrorResponse(error)); 
  }
};

