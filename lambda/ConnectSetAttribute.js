var requestUtils = require('./utils/RequestUtils.js');
var connectUtils = require('./utils/ConnectUtils.js');

/**
 * Sets a Connect contact attribute
 */
exports.handler = async(event, context, callback) =>
{
  try
  {
    requestUtils.logRequest(event);

    var contactId = event.Details.ContactData.ContactId;

    var key = event.Details.Parameters['key'];
    var value = event.Details.Parameters['value'];

    await connectUtils.setContactAttribute(process.env.INSTANCE_ID, contactId, key, value);

    return {};
  }
  catch (error)
  {
    console.log('[ERROR] failed to set a contact attribute', error);
    throw error; 
  }
};
