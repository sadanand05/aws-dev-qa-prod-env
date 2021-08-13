var requestUtils = require('./utils/RequestUtils.js');
var cloudWatchUtils = require('./utils/CloudWatchUtils.js');

/**
 * Puts an Amazon CloudWatch custom metric
 */
exports.handler = async(event, context, callback) =>
{
  try
  {
    requestUtils.logRequest(event);

    var metricName = event.Details.Parameters.metricName;
    var metricValue = event.Details.Parameters.metricValue;

    if (metricName === undefined)
    {
      throw new Error('Missing required parameter: metricName');
    }

    if (metricValue === undefined)
    {
      console.log('[INFO] using default value for metric: 1')
      metricValue = 1;
    }

    await cloudWatchUtils.putMetricData(process.env.STAGE, process.env.CLOUDWATCH_NAMESPACE, 
      metricName, metricValue);

    return {
      result: 'Success'
    };
  }
  catch (error)
  {
    console.log('[ERROR] failed to put CloudWatch metric', error);
    throw error; 
  }
};

