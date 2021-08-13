
var configUtils = require('./ConfigUtils.js');

var moment = require('moment-timezone');


/**
 * Check to see if today local time is a holiday
 */
module.exports.isHoliday = async function(configTable)
{
  try
  {
    var allHolidays = await configUtils.getHolidays(configTable);
    var timeZone = await configUtils.getCallCentreTimeZone(configTable);
    var now = moment.tz(timeZone);

    var nowStr = now.format('YYYYMMDD');

    var existingHoliday = allHolidays.find(holiday => holiday.when === nowStr);

    return existingHoliday !== undefined;
  }
  catch (error)
  {
    console.log('[ERROR] failed to determine holiday status', error);
    throw error;
  }
}

/**
 * Evaluate operating hours returning a map for each
 * configured operating hours
 */
module.exports.evaluateOperatingHours = async function(configTable)
{
  var openStatus = {

  };

  var operatingHours = await configUtils.getOperatingHours(configTable);

  operatingHours.forEach(hours => {

    var localTime = moment().tz(hours.TimeZone);
    var localDayName = localTime.format('dddd').toUpperCase();
    var localHour = localTime.hour();
    var localMinute = localTime.minute();

    var open = 'false';

    hours.Config.forEach(config =>
    {
      if (config.Day === localDayName)
      {
        // Always open
        if (config.StartTime.Hours === 0 && config.StartTime.Minutes === 0 &&
          config.EndTime.Hours === 0 && config.EndTime.Minutes === 0)
        {
          open = 'true';
        }
        else
        {
          // Check start time
          var startOk = false;

          if ((config.StartTime.Hours < localHour) || (config.StartTime.Hours === localHour && config.StartTime.Minutes <= localMinute))
          {
            startOk = true;
          }

          // Check end time
          var endOk = false;
          if ((config.EndTime.Hours > localHour) || (config.EndTime.Hours === localHour && config.EndTime.Minutes >= localMinute))
          {
            endOk = true;
          }

          if (startOk && endOk)
          {
            open = 'true';
          }
        }
      }
    });

    openStatus[hours.Name] = {
      Open: open
    };
  });

  // console.log('[INFO] computed open status: ' + JSON.stringify(openStatus, null, 2));

  return openStatus;
}