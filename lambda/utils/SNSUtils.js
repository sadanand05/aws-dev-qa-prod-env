
var AWS = require('aws-sdk');
AWS.config.update({region: process.env.REGION});
var sns = new AWS.SNS();

/**
 * Sends an SMS message via SNS
 */
module.exports.sendSMS = async function(phoneNumber, message)
{
  try
  {
    var phoneNumberToUse = phoneNumber;

    // Assumes AU phone number here
    // Foxtel specific logic
    if (phoneNumberToUse.startsWith('0'))
    {
      phoneNumberToUse = '+61' + phoneNumberToUse.substring(1);
    }

    var params = {
      Message: message,
      PhoneNumber: phoneNumberToUse
    };

    console.log('[INFO] making SMS request: ' + JSON.stringify(params, null, '  '));

    await sns.publish(params).promise();
  }
  catch (error)
  {
    console.log('[ERROR] failed to send SMS', error);
    throw error;
  }
}
