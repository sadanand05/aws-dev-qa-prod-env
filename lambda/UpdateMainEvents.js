var fs = require('fs');
var path = require('path');
var moment = require('moment-timezone');

var requestUtils = require('./utils/RequestUtils.js');
var dynamoUtils = require('./utils/DynamoUtils.js');
var configUtils = require('./utils/ConfigUtils.js');
var handlebarsUtils = require('./utils/HandlebarsUtils.js');

const parseString = require('xml2js').parseString;
const stripNS = require('xml2js').processors.stripPrefix;

/**
 * Calls out to Foxtel web service: RetrievePPVListing to fetch the
 * list of upcoming main events and cache new records in a DynamoDB Table
 */
exports.handler = async(event, context, callback) =>
{
  try
  {
    requestUtils.logRequest(event);

    // Build a request message
    var template = getTemplate('UpdateMainEventsRequest');
    var request = handlebarsUtils.template(template, {});

    var callCentreTimeZone = await configUtils.getCallCentreTimeZone(process.env.CONFIG_TABLE);

    var response = undefined;

    if (process.env.MOCK_MODE === 'true')
    {
      response = buildMockResponse();
    }
    else
    {
      throw new Error('Use mock mode for now');
    }

    var processedResponse = await parseResponse(response);

    console.log('[INFO] got processed response: ' + JSON.stringify(processedResponse, null, 2));

    var existingEvents = await dynamoUtils.getMainEvents(process.env.MAIN_EVENTS_TABLE);

    var insertCount = 0;

    for (var d = 0; d < processedResponse.Date.length; d++)
    {
      var eventDate = processedResponse.Date[d];

      console.log('[INFO] processing day: ' + eventDate.Day);

      for (var m = 0; m < eventDate.Movies.Movie.length; m++)
      {
        var movie = eventDate.Movies.Movie[m];

        console.log(`[INFO] processing movie: ${movie.OfferId}`);

        var existingEvent = existingEvents.find(event => event.eventId === movie.OfferId);

        // If we don't have this event yet, insert it
        if (existingEvent === undefined)
        {
          console.log(`[INFO] found novel event: ${movie.OfferId}`);

          var startTimestamp = undefined;
          var endTimestamp = undefined;

          var sessions = [];

          movie.SessionTimes.Session.forEach(session => 
          {
            var sessionStartTime = moment.tz(`${session.StartDate} ${session.StartTime}`, callCentreTimeZone);
            var sessionEndTime = getEndTime(movie.Duration, sessionStartTime);

            sessions.push({
              channelId: session.ChannelId,
              sessionId: session.SessionId,
              startTimestamp: sessionStartTime.utc().format(),
              endTimestamp: sessionEndTime.utc().format()
            });

            if (startTimestamp === undefined || sessionStartTime.isBefore(startTimestamp))
            {
              startTimestamp = sessionStartTime;
            }

            if (endTimestamp === undefined || sessionEndTime.isAfter(endTimestamp))
            {
              endTimestamp = sessionEndTime;
            }
          });

          var alternativeTitle = movie.AlternativeTitle;

          if (alternativeTitle === undefined || alternativeTitle === null || movie.AlternativeTitle === '')
          {
            alternativeTitle = movie.Title;
          }

          var event = {
            eventId: movie.OfferId,
            active: false,
            name: movie.Title,
            speechName: alternativeTitle,
            fastPathMinutes: 0,
            description: movie.ItemDescription,
            price: movie.PriceAni,
            startTimestamp: startTimestamp.utc().format(),
            endTimestamp: endTimestamp.utc().format(),
            sessions: sessions
          };

          console.log('[INFO] inserting novel event: ' + JSON.stringify(event, null, 2));

          await dynamoUtils.insertMainEvent(process.env.MAIN_EVENTS_TABLE, event);

          insertCount++;
        }
      }
    }

    if (insertCount > 0)
    {
      console.log(`[INFO] inserted: ${insertCount} new main events`);

      // Mark the last change to now
      await configUtils.setLastChangeTimestampToNow(process.env.CONFIG_TABLE);
    }
    else
    {
      console.log(`[INFO] found no new main events to insert`); 
    }

    return {
      success: true
    }
  }
  catch (error)
  {
    console.log('[ERROR] failed to fetch and update main event listings', error);
    throw error;
  }
};

/**
 * The format of the duration field is P0M0DT4H0M0S, 
 * the integer values are separated by the token P_M_DT_H_M_S. 
 * They stand for the month (M), day (D), hour (H), minute (M) 
 * and second value of the duration. For example a duration 
 * P1M2DT3H4M5S represents 1 month + 2 days + 3 hours + 4 minutes + 5 seconds. 
 * If a main event doesn’t have any future session, the end time of the 
 * event will be calculated by the session start time plus the duration.   
 */ 
function getEndTime(durationString, startTime)
{
  var pattern = /^P([0-9]+)M([0-9]+)DT([0-9]+)H([0-9]+)M([0-9]+)S$/;
  var match = durationString.match(pattern);

  if (match.length !== 6)
  {
    throw new Error('Invalid duration: ' + durationString);
  }

  var endTime = startTime.clone();
  endTime.add(+match[1], 'months');
  endTime.add(+match[2], 'days');
  endTime.add(+match[3], 'hours');
  endTime.add(+match[4], 'minutes');
  endTime.add(+match[5], 'seconds');
  return endTime;
}


/**
 * Loads a templated request / response
 */
function getTemplate(templateName)
{
  var resolved = path.resolve(process.env.LAMBDA_TASK_ROOT, 'lambda/mock/' + templateName + '.hbs');
  console.log('[INFO] found resolved: ' + resolved);

  try
  {
    var content = fs.readFileSync(resolved, 'utf8');
    console.log('[INFO] found content: ' + content);
    return content;
  }
  catch (error)
  {
    console.log('[ERROR] Failed to load template: ' + resolved, error);
    throw error;
  }
};

/**
 * Parses XML converting to JSON objects
 */
function parseXML(xml)
{
  var parserConfig = {
    tagNameProcessors: [stripNS],
    ignoreAttrs: true,
    explicitArray: false,
    emptyTag: null
  };

  return new Promise((resolve, reject) => {
    parseString(xml, parserConfig, function (err, json) {
      if (err)
      {
        reject(err);
      }
      else
      {
        resolve(json);
      }
    });
  });
}

/**
 * Parses an XML response and returns the processed response
 */
async function parseResponse(rawResponse)
{
  try
  {
    var processedResponse = {};

    var parsedResponse = await parseXML(rawResponse);

    console.log(`[INFO] got parsed response: ${JSON.stringify(parsedResponse, null, 2)}`);

    if (parsedResponse.Request.RetrievePpvListingResponse.SuccessFlag === 'true')
    {
      var listingResponse = parsedResponse.Request.RetrievePpvListingResponse;

      var keys = Object.keys(listingResponse);
      keys.forEach(key => 
      {
        processedResponse[key] = listingResponse[key];
      });

      processedResponse.Success = 'true';

      // Look at each date and movie and make them arrays

      if (!Array.isArray(processedResponse.Date))
      {
        var dateNode = processedResponse.Date;

        processedResponse.Date = [];
        processedResponse.Date.push(dateNode);

        console.log('[INFO] converted Date node into an array');
      }

      processedResponse.Date.forEach(dateNode => {

        if (!Array.isArray(dateNode.Movies.Movie))
        {
          var movie = dateNode.Movies.Movie;
          dateNode.Movies.Movie = [];
          dateNode.Movies.Movie.push(movie);
          console.log('[INFO] converted Movie node into an array');
        }

        dateNode.Movies.Movie.forEach(movie => {
          if (!Array.isArray(movie.SessionTimes.Session))
          {
            var session = movie.SessionTimes.Session;
            movie.SessionTimes.Session = [];
            movie.SessionTimes.Session.push(session);
            console.log('[INFO] converted Session node into an array');
          }
        });
      });
    }
    else
    {
      console.log('[ERROR] found error response: ' + rawResponse);
      processedResponse.Success = 'false';
    }

    return processedResponse;
  }
  catch (error)
  {
    console.log('[ERROR] failed to parse XML response', error);
    throw error;
  }
}

/**
 * Build a valid service response
 */
function buildMockResponse()
{
  try
  {
    var mainEvents = 
    {
      Dates: 
      [
        {
          Day: '2021-10-25',
          Events: 
          [
            {
              OfferId: '6656671',
              Title: 'UFC-265',
              AlternativeTitle: 'UFC two sixty-five',
              ItemDescription: 'The interim heavyweight title will be on the line as Derrick Lewis faces off with unbeaten Frenchman Ciryl Gane. In the co-main event, Amanda Nunes defends her bantamweight title against Julianna Pena.',
              PriceAni: '5500',
              Genre: '05',
              ParentalRating: 'NC - Not Classified',
              Duration: 'P0M0DT2H0M0S',
              ExpiryDate: '2021-10-27',
              ExpiryTime: '14:00:00',
              ScheduleID: '2',
              SessionTimes: 
              [
                {
                  SessionId: '1234567',
                  StartDate: '2021-10-25',
                  StartTime: '23:00:00',
                  ChannelId: '521'
                },
                {
                  SessionId: '1234568',
                  StartDate: '2021-10-26',
                  StartTime: '09:00:00',
                  ChannelId: '522'
                },
                {
                  SessionId: '1234569',
                  StartDate: '2021-10-27',
                  StartTime: '12:00:00',
                  ChannelId: '523'
                }
              ]
            }
          ]
        },
        {
          Day: '2021-08-15',
          Events: 
          [
            {
              OfferId: '6656674',
              Day: '2021-08-15',
              Title: 'Moloney v Franco III',
              AlternativeTitle: 'Moloney versus Franco III',
              ItemDescription: 'The stage is set for this epic trilogy.  After a controversial finish in their last bout Andrew Moloney and Joshua Franco will battle it out for the WBA Super Flyweight Championship.',
              PriceAni: '2995',
              Genre: '05',
              ParentalRating: 'NC - Not Classified',
              Duration: 'P0M0DT6H0M0S',
              ExpiryDate: '2021-08-17',
              ExpiryTime: '00:00:00',
              ScheduleID: '2',
              SessionTimes: 
              [
                {
                  SessionId: '1234574',
                  StartDate: '2021-08-15',
                  StartTime: '12:00:00',
                  ChannelId: '521'
                },
                {
                  SessionId: '1234575',
                  StartDate: '2021-08-16',
                  StartTime: '06:00:00',
                  ChannelId: '522'
                },
                {
                  SessionId: '1234576',
                  StartDate: '2021-08-16',
                  StartTime: '12:00:00',
                  ChannelId: '523'
                },
                {
                  SessionId: '1234577',
                  StartDate: '2021-08-16',
                  StartTime: '18:00:00',
                  ChannelId: '524'
                }  
              ]
            }
          ]
        },
        {
          Day: '2021-08-22',
          Events: 
          [
            {
              OfferId: '6656675',
              Day: '2021-08-22',
              Title: 'WWE SummerSlam',
              ItemDescription: 'John Cena made his return at Money in the Bank and is looking to take the universal championship from Roman Reigns. Plus Bobby Lashley will defend his WWE championship against WWE Half of Famer Goldberg.',
              PriceAni: '2495',
              Genre: '05',
              ParentalRating: 'NC - Not Classified',
              Duration: 'P0M0DT4H30M00S',
              ExpiryDate: '2021-08-24',
              ExpiryTime: '21:00:00',
              ScheduleID: '2',
              SessionTimes: 
              [
                {
                  SessionId: '1234585',
                  StartDate: '2021-08-22',
                  StartTime: '10:00:00',
                  ChannelId: '521'
                },
                {
                  SessionId: '1234586',
                  StartDate: '2021-08-24',
                  StartTime: '06:00:00',
                  ChannelId: '522'
                },
                {
                  SessionId: '1234587',
                  StartDate: '2021-08-24',
                  StartTime: '16:30:00',
                  ChannelId: '523'
                }
              ]
            },
            {
              OfferId: '6656676',
              Day: '2021-08-22',
              Title: 'Pacquiao v Spence Jr',
              AlternativeTitle: 'Pacquiao versus Spence Junior',
              ItemDescription: 'After two years out of the ring boxing legend Manny Pacquiao returns to face undefeated welterweight champion Errol Spence Jr in what\'s been billed as the Generational Showdown.',
              PriceAni: '4995',
              Genre: '05',
              ParentalRating: 'NC - Not Classified',
              Duration: 'P0M0DT6H00M00S',
              ExpiryDate: '2021-08-24',
              ExpiryTime: '16:30:00',
              ScheduleID: '2',
              SessionTimes: 
              [
                {
                  SessionId: '1234588',
                  StartDate: '2021-08-22',
                  StartTime: '11:00:00',
                  ChannelId: '521'
                },
                {
                  SessionId: '1234589',
                  StartDate: '2021-08-22',
                  StartTime: '17:00:00',
                  ChannelId: '521'
                },
                {
                  SessionId: '1234590',
                  StartDate: '2021-08-23',
                  StartTime: '14:30:00',
                  ChannelId: '522'
                },
                {
                  SessionId: '1234591',
                  StartDate: '2021-08-24',
                  StartTime: '10:30:00',
                  ChannelId: '523'
                }
              ]
            }
          ]
        },
        {
          Day: '2021-09-05',
          Events: 
          [
            {
              OfferId: '6656677',
              Day: '2021-09-05',
              Title: 'WWE NXT Takeover 36',
              ItemDescription: 'The best of the best battle it out in the newest installment of NXT TakeOver as stars gear up for another event filled with epic clashes.',
              PriceAni: '2495',
              Genre: '05',
              ParentalRating: 'NC - Not Classified',
              Duration: 'P0M0DT4H30M0S',
              ExpiryDate: '2021-09-06',
              ExpiryTime: '22:30:00',
              ScheduleID: '2',
              SessionTimes: 
              [
                {
                  SessionId: '1234591',
                  StartDate: '2021-09-05',
                  StartTime: '10:00:00',
                  ChannelId: '521'
                },
                {
                  SessionId: '1234592',
                  StartDate: '2021-09-06',
                  StartTime: '18:00:00',
                  ChannelId: '522'
                }
              ]
            }
          ]
        }
      ]
    };


    var responseTemplate = getTemplate('UpdateMainEventsResponseSuccess');

    console.log('[INFO] got template raw: ' + responseTemplate);

    var templateResult = handlebarsUtils.template(responseTemplate, 
      {
        MainEvents: mainEvents
      }
    );

    console.log('[INFO] got templated result: ' + templateResult);

    return templateResult;
  }
  catch (error)
  {
    console.log('[ERROR] failed to build mock response for main events', error);
    throw error;
  }
}



