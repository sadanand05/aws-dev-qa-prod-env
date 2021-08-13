
var LRU = require("lru-cache");
var AWS = require('aws-sdk');
AWS.config.update({region: process.env.REGION});

var lambda = new AWS.Lambda();

/**
 * 5 minute LRU cache for Lambda function objects
 */
var lambdaCacheOptions = { max: 100, maxAge: 1000 * 60 * 5 };
var lambdaCache = new LRU(lambdaCacheOptions);

/**
 * Lists the connect and integration Lambda functions in this 
 * account for the requested stage and service
 */
module.exports.listConnectLambdaFunctions = async function (stage, service, refreshCache = false)
{
  try
  {
    if (!refreshCache)
    {
      var cachedFunctions = lambdaCache.get('connectLambdaFunctions');

      if (cachedFunctions !== undefined)
      {
        return cachedFunctions;
      }
    }

    console.log('[INFO] loading Connect Lambda functions');

    var functions = [];
    var request = {};

    var results = await lambda.listFunctions(request).promise();

    functions = functions.concat(results.Functions.filter(lambdaFunction => isConnectFunction(stage, service, lambdaFunction.FunctionName)));

    while (results.NextMarker)
    {
      request.Marker = results.NextMarker;
      results = await lambda.listFunctions(request).promise();
      functions = functions.concat(results.Functions.filter(lambdaFunction => isConnectFunction(stage, service, lambdaFunction.FunctionName)));
    }

    functions.sort(function (a, b) {
      return a.FunctionName.toLowerCase().localeCompare(b.FunctionName.toLowerCase());
    });

    console.log(`[INFO] loaded: ${functions.length} filtered Lambda functions`);

    lambdaCache.set('connectLambdaFunctions', functions);

    return functions;
  }
  catch (error)
  {
    console.log('[ERROR] failed to list filtered functions for account', error);
    throw error;
  }
};

/**
 * Is this a connect Lambda function
 */
function isConnectFunction(stage, service, functionName)
{
  var prefix1 = `${stage}-${service}-connect`;
  var prefix2 = `${stage}-${service}-integration`;
  return functionName.startsWith(prefix1) || functionName.startsWith(prefix2);
}

/**
 * Fetches a map of Lambda function short names against their ARN.
 * 
 * Stage: dev
 * Service: ftacel-fire
 * 
 * Result:
 * {
 *    connectupdatestate: {
 *      arn: "arn:aws:lambda:ap-southeast-2:<accountNumber>:function:dev-ftacel-fire-connectupdatestate"
 *    },
 *    ...
 * }
 */
module.exports.getConnectLambdaFunctionMap = async function (stage, service, refreshCache = false)
{
  try
  {
    var results = {};
    var lambdaFunctions = await module.exports.listConnectLambdaFunctions(stage, service, refreshCache);

    var prefix = `${stage}-${service}-`;

    lambdaFunctions.forEach(lambdaFunction => {
      var shortName = lambdaFunction.FunctionName.substring(prefix.length);

      results[shortName] = {
        arn: lambdaFunction.FunctionArn
      };
    });

    return results;
  }
  catch (error)
  {
    console.log('[ERROR] failed to build Lambda function map', error);
    throw error;
  }
}

/**
 * Invokes the requested Lambda function asynchronously
 */
module.exports.invokeAsync = async function(functionArn, payload)
{
  try
  {
    console.log(`[INFO] invoking Lambda function: ${functionArn} asynchronously`);

    var params = {
      FunctionName: functionArn,
      InvocationType: 'Event',
      Payload: JSON.stringify(payload)
    };

    await lambda.invoke(params).promise();

    console.log(`[INFO] invoking Lambda function is complete`);
  }
  catch (error)
  {
    console.log('[ERROR failed to invoke Lambda function', error);
    throw error;
  }
}

