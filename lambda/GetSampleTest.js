
var requestUtils = require('./utils/RequestUtils.js');
var connectUtils = require('./utils/ConnectUtils.js');

var moment = require('moment');

/**
 * Creates a blank test record using canned fields and
 * fields in the current rule set
 */
exports.handler = async(event, context, callback) =>
{
  try
  {
    requestUtils.logRequest(event);
    requestUtils.checkOrigin(event);
    var user = await requestUtils.verifyAPIKey(event);
    requestUtils.requireRole(user, ['ADMINISTRATOR', 'POWER_USER', 'TESTER']);

    // TODO make this a current instance DiD
    var dialledNumber = '+61279086429';

    var sampleContact = await connectUtils.createSampleStateRequest(process.env.CONFIG_TABLE, dialledNumber);

    sampleContact.Input = [];
    sampleContact.Expected = [];
    
    console.log('[INFO] generated sample test message: ' + JSON.stringify(sampleContact, null, 2));

    callback(null, requestUtils.buildSuccessfulResponse({
      sample: sampleContact
    }));
  }
  catch (error)
  {
    console.log('[ERROR] failed to generate sample test', error);
    callback(null, requestUtils.buildErrorResponse(error)); 
  }
};
