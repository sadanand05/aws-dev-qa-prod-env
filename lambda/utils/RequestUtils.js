var dynamoUtils = require('./DynamoUtils.js');

/**
 * Logs a request
 */
module.exports.logRequest = (event) =>
{
  console.log(JSON.stringify(event, null, 2));
};

/**
 * Verifies a request API key
 */
module.exports.verifyAPIKey = async (event) => 
{
  var apiKey = event.requestContext.identity.apiKey;

  if (apiKey === undefined || apiKey === '')
  {
    console.log('[ERROR] Missing API key');
    throw new Error('Missing API key');
  }
  else
  {
    var user = await dynamoUtils.getUserByAPIKey(process.env.USERS_TABLE, apiKey);

    if (user === undefined || user.enabled === false)
    {
      console.log('[ERROR] Failed to find active user for API key');
      throw new Error('Invalid API key, no active user found');
    }

    console.log(`[INFO] authorised user: ${user.firstName} ${user.lastName} (${user.emailAddress})`);

    return user;
  }
};

/**
 * Requires that the user have one of these roles
 */
module.exports.requireRole = (user, roles) => 
{
  if (!roles.includes(user.userRole))
  {
    console.log(`[ERROR] Insufficent role found, required: ${roles.join()} found: ${user.userRole}`);
    throw new Error('Insufficent role');
  }
};

/**
 * Verifies a request origin
 */
module.exports.checkOrigin = (event) =>
{
  var validOrigins = JSON.parse(process.env.VALID_ORIGINS);

  if (validOrigins.length > 0)
  {
    var origin = event.headers.origin;

    if (origin === undefined)
    {
      origin = event.headers.Origin;      
    }

    if (validOrigins.length > 0 && !validOrigins.includes(origin))
    {
      console.log('[ERROR] Invalid origin: ' + origin);
      throw new Error('Invalid origin: ' + origin);
    }
  }
};

/**
 * Export state parameters that are simple strings
 */
module.exports.buildCustomerStateResponse = function(customerState)
{
  var response = {};

  var keys = Object.keys(customerState);

  keys.forEach(key => {
    var value = customerState[key];

    if (typeof value === 'string')
    {
      response[key] = value;
    }
  });

  return response;
}

/**
 * Creates a successful APIGW response
 */
module.exports.buildSuccessfulResponse = (data) =>
{
  const response = {
    statusCode: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(data)
  };
  return response;
};

/**
 * Creates a failure APIGW response
 */
module.exports.buildFailureResponse = (code, body) =>
{
  const response = 
  {
    statusCode: code,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      data: body
    })
  };
  console.log('[ERROR] made failure response: ' + JSON.stringify(response, null, ' '));
  return response;
};

/**
 * Creates an errored APIGW response
 */
module.exports.buildErrorResponse = (error) =>
{
  const response = 
  {
    statusCode: 500,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      error: error.message
    })
  };
  console.log('[ERROR] made error response: ' + JSON.stringify(response, null, ' '));
  return response;
};

/**
 * Require a parameters
 */
module.exports.requireParameter = function (fieldName, fieldValue)
{
  if (fieldValue === undefined)
  {
    console.log(`[ERROR] required field is missing: ${fieldName}`);
    throw new Error(`Required field is missing: ${fieldName}`);
  }
}
