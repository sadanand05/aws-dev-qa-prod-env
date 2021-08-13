
var moment = require('moment-timezone');
var Handlebars = require('handlebars');

/**
 * Provides the ability to compare for equality against
 * another value
 */ 
Handlebars.registerHelper('ifeq', function (a, b, options) 
{
  if (a == b) 
  {
    return options.fn(this); 
  }

  return options.inverse(this);
});

/**
 * Serialises an object to JSON
 */
Handlebars.registerHelper('json', function(context) {
  return JSON.stringify(context);
});

/**
 * Adds one to a passed value useful for zero based #each @index referencing
 */
Handlebars.registerHelper('inc', function(value, options)
{
  return parseInt(value) + 1;
});

/**
 * Formats a date of birth for human reading
 */
function formatDOB(dob)
{
  var dobParsed = moment(dob, 'DDMMYYYY');
  return dobParsed.format('Do of MMMM YYYY')
}

/**
 * Converts 8 digit dates DDMMYYYY into long form human dates
 */
Handlebars.registerHelper('dateOfBirthHuman', function (a, options) 
{
  if (a !== undefined && a !== null)
  {
    return formatDOB(a);
  }
  else
  {
    return a;
  }
});

/**
 * Formats ISO-8601 UTC dates into the call centres local timezone
 */
Handlebars.registerHelper('dateLocalHuman', function (a, b, options) 
{
  if (a !== undefined && a !== null)
  {
    return moment(a).tz(b).format('Do of MMMM YYYY')
  }
  else
  {
    return a;
  }
});

/**
 * Formats ISO-8601 UTC dates into the call centres local timezone
 */
Handlebars.registerHelper('dayLocalHuman', function (a, b, options) 
{
  if (a !== undefined && a !== null)
  {
    return moment(a).tz(b).format('dddd, Do of MMMM')
  }
  else
  {
    return a;
  }
});

/**
 * Formats ISO-8601 UTC dates into the call centres local timezone
 */
Handlebars.registerHelper('timeLocalHuman', function (a, b, options) 
{
  if (a !== undefined && a !== null)
  {
    return moment(a).tz(b).format('h:mma')
  }
  else
  {
    return a;
  }
});

/**
 * Renders a string character by character
 */
Handlebars.registerHelper('characterSpeechSlow', function (a, options) 
{
  if (a !== undefined && a !== null)
  {
    var chars = Array.from(a);
    return chars.join(', ');
  }
  else
  {
    return a;
  }
});

/**
 * Renders a string character by character
 */
Handlebars.registerHelper('characterSpeechFast', function (a, options) 
{
  if (a !== undefined && a !== null)
  {
   var chars = Array.from(a);
    return chars.join(' ');
  }
  else
  {
    return a;
  }
});

/**
 * Formats a cents amount as dollars
 */
Handlebars.registerHelper('formatCentsAsDollars', function (cents, options) 
{
  if (cents !== undefined && cents !== null)
  {
    var dollars = (+cents * 0.01).toFixed(2);
    return `$${dollars}`;
  }
  else
  {
    return 'unknown dollars';
  }
});

/**
 * Compiles and evaluates a Handlebars template
 */
module.exports.template = function(templateCode, templateParams)
{
  try
  {
    var template = Handlebars.compile(templateCode);
    return template(templateParams);
  }
  catch (error)
  {
    console.log('[ERROR] failed to compile and evaluate template', error);
    throw error;
  }
}

/**
 * Compiles and evaluates a Handlebars template for each key in an object
 */
module.exports.templateMapObject = function(objectToTemplate, templateParams)
{
  var keys = Object.keys(objectToTemplate);

  keys.forEach(key => {
    if (module.exports.isTemplate(objectToTemplate[key]))
    {
      var templatedValue = module.exports.template(objectToTemplate[key], templateParams);
      objectToTemplate[key] = templatedValue;
    }
  });
}

/**
 * Checks to see if a string could be a template
 */
module.exports.isTemplate = function(value)
{
  if (value === undefined || value === null)
  {
    return false;
  }

  if (value.includes('{{') && value.includes('}}'))
  {
    return true;
  }

  return false;
}