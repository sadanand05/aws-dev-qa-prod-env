/**
  Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
  
  Licensed under the Apache License, Version 2.0 (the "License").
  You may not use this file except in compliance with the License.
  A copy of the License is located at
  
      http://www.apache.org/licenses/LICENSE-2.0
  
  or in the "license" file accompanying this file. This file is distributed 
  on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either 
  express or implied. See the License for the specific language governing 
  permissions and limitations under the License.
*/

/** 
 * Router Declaration
 */
var router = null;

/**
 * Global site config object
 */
var siteConfig = null;
var navigationTemplate = null;

toastr.options = {
  "closeButton": true,
  "tapToDismiss": true,
  "positionClass": "toast-bottom-right",
  "showDuration": "300",
  "hideDuration": "1000",
  "timeOut": "5000",
  "extendedTimeOut": "2000",
  "showEasing": "swing",
  "hideEasing": "linear",
  "showMethod": "fadeIn",
  "hideMethod": "fadeOut"
};

function errorToast(message)
{
  clearAllToasts();
  toastr["error"](message);
}

function stickySuccessToast(message)
{
  toastr["success"](message, null, {
    timeOut: 0,
    extendedTimeOut: 0,
    alpha: 0
  });
}

function successToast(message)
{
  clearAllToasts();
  toastr["success"](message);
}

function clearAllToasts()
{
  toastr.clear();
}

/**
 * Formats a date for display
 */
function formatDate(dateString) 
{
  var d = moment(dateString);
  return d.format('DD/MM/YYYY');
}


/**
 * Formats a date for display using the call centre's timezone
 */
function formatDateCallCentre(dateString) 
{
  var d = moment(dateString).tz(siteConfig.callCentreTimeZone);
  return d.format('DD/MM/YYYY');
}

/**
 * Formats time for display
 */
function formatTime(dateString) 
{
  var d = moment(dateString);
  return d.format('h:mma');
}

/**
 * Formats time for display
 */
function formatTimeCallCentre(dateString) 
{
  var d = moment(dateString).tz(siteConfig.callCentreTimeZone);
  return d.format('h:mma');
}

/**
 * Formats a date time for display
 */
function formatDateTime(dateString) 
{
  var d = moment(dateString);
  return d.format('DD/MM/YYYY h:mma');
}

/**
 * Formats a date time for display
 */
function formatDateTimeCallCentre(dateString) 
{
  var d = moment(dateString).tz(siteConfig.callCentreTimeZone);
  return d.format('DD/MM/YYYY h:mma');
}

/**
 * Sleep for time millis
 */
function sleep (time) 
{
  return new Promise((resolve) => setTimeout(resolve, time));
}

/**
 * Handles dynamic routing from pages created post load
 */
function dynamicRoute(event)
{
  event.preventDefault();
  const pathName = event.target.hash;
  router.navigateTo(pathName);
}

/**
 * Stores a string in session storage
 */
function store(key, value)
{
  window.localStorage.setItem(key, value);
}

/**
 * Stores an object as JSON in local storage
 */
function storeObject(key, object)
{
  store(key, JSON.stringify(object, null, '  '));
}

/**
 * Unstores a string in local storage
 */
function unstore(key)
{
  return window.localStorage.getItem(key); 
}

/**
 * Unstores an object from JSON in local storage
 */
function unstoreObject(key)
{
  if (!isStored(key))
  {
    console.log('[ERROR] failed to locate object in local store using key: ' + key);
    return null;
  }

  let value = unstore(key);
  return JSON.parse(value);
}

/**
 * Checks to see if something is stored
 */
function isStored(key)
{
  return window.localStorage.getItem(key) != null;
}

function clearStorage(key)
{
  window.localStorage.removeItem(key);
}

function clone(object)
{
  return JSON.parse(JSON.stringify(object));
}

function isValidText(text)
{
  var validText = /^[a-zA-Z0-9\,\.\'\-\?\!\s]*$/g;
  return text.match(validText);
}

async function checkLogin(apiKey)
{
  try
  {
    var options = {
      headers: {
        'x-api-key': apiKey
      }
    };

    var response = await axios.post(siteConfig.api + '/login', {}, options);
    return response.data.user;
  }
  catch (error)
  {
    logError('[ERROR] Failed to verify login', error);
    return undefined;
  }

}

function isLoggedIn()
{

  var loggedIn = isStored('api-key') && isStored('user');


  if (!loggedIn)
  {
    clearLoggedInData();
  }

  return loggedIn;
}

/**
 * Checks for admin level access
 */ 
function isAdmin()
{
  if (!isLoggedIn())
  {
    return false;
  }

  return unstoreObject('user').userRole === 'ADMINISTRATOR';
}

/**
 * Checks for power user level access
 */ 
function isPowerUser()
{
  if (!isLoggedIn())
  {
    return false;
  }

  return unstoreObject('user').userRole === 'POWER_USER';
}

/**
 * Checks for tester level access
 */ 
function isTester()
{
  if (!isLoggedIn())
  {
    return false;
  }

  return unstoreObject('user').userRole === 'TESTER';
}


/**
 * Fired once on page load, sets up the router
 * and navigates to current hash location
 */
window.addEventListener('load', async () =>
{

  /**
   * Make sure the app-body div is always the right height
   */
  function resizeBody()
  {
    var headerHeight = $('.navbar').height();
    var appBodyHeight = $(window).height() - headerHeight;
    $('.body-div').css({
        'height' : appBodyHeight + 'px'   
    });
  }

  $('document').ready(function(){
    resizeBody();
  });

  $(window).resize(function() {
    resizeBody();
  });

  /**
   * Set up the vanilla router
   */
  router = new Router({
    mode: 'hash',
    root: '/index.html',
    page404: function (path) 
    {
      console.log('[WARN] page not found: ' + path);
      window.location.hash = '#';
    }
  });

  Handlebars.registerHelper('inc', function(value, options)
  {
    return parseInt(value) + 1;
  });

  Handlebars.registerHelper('ifeq', function (a, b, options) 
  {
    if (a == b) 
    {
      return options.fn(this); 
    }
    return options.inverse(this);
  });

  Handlebars.registerHelper('notempty', function (a, options) 
  {
    if (!Handlebars.Utils.isEmpty(a))
    {
      return options.fn(this);
    }
    return options.inverse(this);
  });

  Handlebars.registerHelper('empty', function (a, options) 
  {
    if (Handlebars.Utils.isEmpty(a))
    {
      return options.fn(this);
    }
    return options.inverse(this);
  });  

  Handlebars.registerHelper('switch', function(value, options) 
  {
    this.switch_value = value;
    this.switch_break = false;
    return options.fn(this);
  });

  Handlebars.registerHelper('case', function(value, options) 
  {
    if (value == this.switch_value) 
    {
      this.switch_break = true;
      return options.fn(this);
    }
  });

  Handlebars.registerHelper('default', function(options) 
  {
    if (this.switch_break == false) 
    {
      return options.fn(this);
    }
  });

  Handlebars.registerHelper('checked', function(currentValue) {
    return currentValue ? ' checked="checked"' : '';
  });

  Handlebars.registerHelper('json', function(context) {
    return JSON.stringify(context);
  });

  Handlebars.registerHelper('ifeq', function (a, b, options) {
    if (a == b) { return options.fn(this); }
    return options.inverse(this);
  });

  Handlebars.registerHelper('ifnoteq', function (a, b, options) {
    if (a != b) { return options.fn(this); }
    return options.inverse(this);
  });

  Handlebars.registerHelper('each_upto', function(ary, max, options) {
    if(!ary || ary.length == 0)
        return options.inverse(this);

    var result = [ ];
    for(var i = 0; i < max && i < ary.length; ++i)
        result.push(options.fn(ary[i]));
    return result.join('');
  });

  Handlebars.registerHelper('formatDate', function (a, options) 
  {
    return formatDate(a);
  });

  Handlebars.registerHelper('formatDateTime', function (a, options) 
  {
    return formatDateTime(a);
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
      return '$0.00';
    }
  });

  Handlebars.registerHelper('ifCond', function (v1, operator, v2, options) 
  {
    switch (operator) {
        case '==':
            return (v1 == v2) ? options.fn(this) : options.inverse(this);
        case '===':
            return (v1 === v2) ? options.fn(this) : options.inverse(this);
        case '!=':
            return (v1 != v2) ? options.fn(this) : options.inverse(this);
        case '!==':
            return (v1 !== v2) ? options.fn(this) : options.inverse(this);
        case '<':
            return (v1 < v2) ? options.fn(this) : options.inverse(this);
        case '<=':
            return (v1 <= v2) ? options.fn(this) : options.inverse(this);
        case '>':
            return (v1 > v2) ? options.fn(this) : options.inverse(this);
        case '>=':
            return (v1 >= v2) ? options.fn(this) : options.inverse(this);
        case '&&':
            return (v1 && v2) ? options.fn(this) : options.inverse(this);
        case '||':
            return (v1 || v2) ? options.fn(this) : options.inverse(this);
        default:
            return options.inverse(this);
    }
  });

  Handlebars.registerHelper('select', function(selected, options) {
    return options.fn(this).replace(
        new RegExp(' value=\"' + selected + '\"'), '$& selected="selected"'
    );
  });

  Handlebars.registerHelper('checked', function(state) {
    if (state === 'true' || state === true)
    {
      return 'checked';
    }
    return '';
  });

  /**
   * Load site configuration and Handlebars templates 
   * and compile them after they are all loaded
   */
  $.when(
    $.get('config/site_config.json'),
    $.get('templates/navigation.hbs'),
    $.get('templates/home.hbs'),
    $.get('templates/configure.hbs'),
    $.get('templates/configureRuleSet.hbs'),
    $.get('templates/configureRule.hbs'),
    $.get('templates/verify.hbs'),
    $.get('templates/admin.hbs'),
    $.get('templates/holidays.hbs'),
    $.get('templates/login.hbs'),
    $.get('templates/logout.hbs'),
    $.get('templates/foxtel/events.hbs'),
  ).done(function(site, 
      navigation, 
      home, 
      configure,
      configureRuleSet,
      configureRule,
      verify,
      admin,
      holidays,
      login, 
      logout,
      events)
  {
    try
    {
      siteConfig = site[0]; 

      console.log('[INFO] loaded site configuration, current version: ' + siteConfig.version);

      navigationTemplate = Handlebars.compile(navigation[0]);
      let homeTemplate = Handlebars.compile(home[0]);
      let configureTemplate = Handlebars.compile(configure[0]);
      let configureRuleSetTemplate = Handlebars.compile(configureRuleSet[0]);
      let configureRuleTemplate = Handlebars.compile(configureRule[0]);
      let verifyTemplate = Handlebars.compile(verify[0]);
      let adminTemplate = Handlebars.compile(admin[0]);
      let holidaysTemplate = Handlebars.compile(holidays[0]);
      let loginTemplate = Handlebars.compile(login[0]);
      let logoutTemplate = Handlebars.compile(logout[0]);

      // Foxtel specific template
      let eventsTemplate = Handlebars.compile(events[0]);      

      /**
       * Home
       */
      router.add('', async () => 
      {
        loading();
        renderNavigation('#navHome');

        if (isLoggedIn())
        {
          await getConnectData();
        }

        var html = homeTemplate({ 
          siteConfig: siteConfig
        });
        $('#bodyDiv').html(html);
      });

      /**
       * Holidays editor
       */
      router.add('holidays', async () => 
      {

        if (!isLoggedIn())
        {
          window.location.hash = '#';
          return;
        }

        loading();
        renderNavigation('#navHolidays');

        var holidays = await getHolidays();

        var html = holidaysTemplate({ 
          siteConfig: siteConfig,
          tester: isTester(),
          holidays: holidays
        });
        $('#bodyDiv').html(html);
      });

      /**
       * Events editor - Foxtel specific page
       */
      router.add('events', async () => 
      {

        if (!isLoggedIn())
        {
          window.location.hash = '#';
          return;
        }

        loading();
        renderNavigation('#navEvents');

        var events = await getMainEvents();

        var html = eventsTemplate({ 
          siteConfig: siteConfig,
          tester: isTester(),
          events: events
        });
        $('#bodyDiv').html(html);
      });

      /**
       * Configure
       */
      router.add('configure', async () => 
      {
        if (!isLoggedIn())
        {
          window.location.hash = '#';
          return;
        }

        renderNavigation('#navConfigure');
        loading();

        var ruleSets = await getRuleSets();

        var phoneNumbers = unstoreObject('phoneNumbers');

        var claimed = new Set();

        ruleSets.forEach(rs => {
          rs.inboundNumbers.forEach(phone => {
            claimed.add(phone);
          });
        });

        var availableNumbers = phoneNumbers.filter(phoneNumber => !claimed.has(phoneNumber.PhoneNumber));

        var html = configureTemplate({ 
          siteConfig: siteConfig,
          ruleSets: ruleSets,
          availableNumbers: availableNumbers,
          administrator: isAdmin(),
          powerUser: isPowerUser(),
          tester: isTester()
        });
        $('#bodyDiv').html(html);
      });

      /**
       * Configure rule set
       */
      router.add('configureRuleSet', async () => 
      {
        if (!isLoggedIn())
        {
          window.location.hash = '#';
          return;
        }

        renderNavigation('#navConfigure');
        loading();

        var queues = unstoreObject('queues');
        var contactFlows = unstoreObject('contactFlows');

        var currentRuleSet = unstore('currentRuleSet');

        if (currentRuleSet == null)
        {
          window.location.hash = '#configure';
          return;
        }

        var ruleSets = await getRuleSets();

        var ruleSetsNames = [];

        ruleSets.forEach(rs => {
          ruleSetsNames.push(rs.name);
        });

        var ruleSet = await getRuleSet(currentRuleSet);

        if (ruleSet == null || ruleSet === undefined)
        {
          window.location.hash = '#configure';
          return;
        }

        var phoneNumbers = unstoreObject('phoneNumbers');

        var claimed = new Set();

        ruleSets.forEach(rs => {
          rs.inboundNumbers.forEach(phone => {
            claimed.add(phone);
          });
        });

        var availableNumbers = phoneNumbers.filter(phoneNumber => !claimed.has(phoneNumber.PhoneNumber));

        var validActionNames = getValidActionNames();

        var functions = unstoreObject('lambdaFunctions');
        var filteredFunctions = functions.filter(lambdaFunction => lambdaFunction.FunctionName.includes('-integration'));

        var integrationFunctions = [];

        filteredFunctions.forEach(lambdaFunction => {
          var index = lambdaFunction.FunctionName.indexOf('integration');
          integrationFunctions.push(lambdaFunction.FunctionName.substring(index));
        });

        var prompts = unstoreObject('prompts');

        var html = configureRuleSetTemplate({ 
          siteConfig: siteConfig,
          ruleSet: ruleSet,
          ruleSetsNames: ruleSetsNames,
          queues: queues,
          prompts: prompts,
          contactFlows: contactFlows,
          availableNumbers: availableNumbers,
          integrationFunctions: integrationFunctions,
          selectedNumbers: ruleSet.inboundNumbers.join(','),
          validActionNames: validActionNames,
          administrator: isAdmin(),
          powerUser: isPowerUser(),
          tester: isTester()
        });
        $('#bodyDiv').html(html);
      });

      /**
       * Configure rule
       */
      router.add('configureRule', async () => 
      {
        if (!isLoggedIn())
        {
          window.location.hash = '#';
          return;
        }

        renderNavigation('#navConfigure');
        loading();

        var queues = unstoreObject('queues');
        var contactFlows = unstoreObject('contactFlows');

        var currentRule = unstore('currentRule');
        var currentRuleSet = unstore('currentRuleSet');

        if (currentRuleSet == null || currentRule == null)
        {
          window.location.hash = '#configure';
          return;
        }

        var ruleSets = await getRuleSets();

        var ruleSet = ruleSets.find(rs => rs.ruleSetId === currentRuleSet);

        var ruleSetsNames = [];
        var ruleSetsNameId = [];

        ruleSets.forEach(rs => {
          ruleSetsNames.push(rs.name);

          ruleSetsNameId.push({
            name: rs.name,
            id: rs.ruleSetId
          })
        });

        var rule = await getRule(currentRuleSet, currentRule);

        if (rule == null || rule === undefined)
        {
          window.location.hash = '#configure';
          return;
        }

        var validActionNames = getValidActionNames();

        var functions = unstoreObject('lambdaFunctions');
        var filteredFunctions = functions.filter(lambdaFunction => lambdaFunction.FunctionName.includes('-integration'));

        var integrationFunctions = [];

        filteredFunctions.forEach(lambdaFunction => {
          var index = lambdaFunction.FunctionName.indexOf('integration');
          integrationFunctions.push(lambdaFunction.FunctionName.substring(index));
        });

        var prompts = unstoreObject('prompts');

        var html = configureRuleTemplate({ 
          siteConfig: siteConfig,
          queues: queues,
          prompts: prompts,
          contactFlows: contactFlows,
          integrationFunctions: integrationFunctions,
          rule: rule,
          ruleSet: ruleSet,
          ruleSetsNameId: ruleSetsNameId,
          ruleSetsNames: ruleSetsNames,
          validActionNames: validActionNames,
          administrator: isAdmin(),
          powerUser: isPowerUser(),
          tester: isTester()           
        });
        $('#bodyDiv').html(html);
      });

      /**
       * Verify
       */
      router.add('verify', async () => 
      {
        if (!isLoggedIn())
        {
          window.location.hash = '#';
          return;
        }

        renderNavigation('#navVerify');
        loading();

        var tests = await getTests();

        var html = verifyTemplate({ 
          siteConfig: siteConfig,
          tests: tests,
          administrator: isAdmin(),
          powerUser: isPowerUser(),
          tester: isTester()          
        });
        $('#bodyDiv').html(html);
      });

      /**
       * Admin
       */
      router.add('admin', async () => 
      {
        if (!isLoggedIn())
        {
          window.location.hash = '#';
          return;
        }

        if (!isAdmin())
        {
          window.location.hash = '#';
          return; 
        }

        renderNavigation('#navAdmin');
        loading();

        var users = await getUsers();

        var html = adminTemplate({ 
          siteConfig: siteConfig,
          users: users,
          administrator: isAdmin(),
          powerUser: isPowerUser(),
          tester: isTester()           
        });
        $('#bodyDiv').html(html);
      });

      /**
       * Login
       */
      router.add('login', async () => 
      {
        renderNavigation('#navLogin');
        var html = loginTemplate({ 
          siteConfig: siteConfig
        });
        $('#bodyDiv').html(html);
      });

      /**
       * Logout
       */
      router.add('logout', async () => 
      {
        renderNavigation('#navLogout');
        var html = logoutTemplate({ 
          siteConfig: siteConfig
        });
        $('#bodyDiv').html(html);
      });
   
      /**
       * Make hash links work
       */
      router.addUriListener()

      /**
       * Load the current fragment
       */
      router.check();
    }
    catch (error)
    {
      console.log('[ERROR] encountered an issue building site', error)
      alert('Encountered an issue building site: ' + error.message);
    }
  });
});

function renderNavigation(page)
{
  $('#headerDiv').show();

  var user = undefined;

  if (isLoggedIn())
  {
    user = unstoreObject('user');
  }

  var html = navigationTemplate({ 
    siteConfig: siteConfig,
    page: page,
    loggedIn: isLoggedIn(),
    admin: isAdmin(),
    user: user
  });
  $('#navbarCollapse').html(html);
  highlightNav(page);
}

function highlightNav(pageId)
{
  $('.active').removeClass('active');
  $(pageId).addClass('active');
}

function loading()
{
  $('#bodyDiv').html('<div class="text-center"><img src="img/loading.gif" class="img-fluid" alt="Loading..."></div>');
}

function clearLoggedInData()
{
}

/**
 * Logs an error handling axios error body if present
 */
function logError(message, error)
{
  if (error.response != undefined && error.response.data != undefined)
  {
    console.log(message, error.response.data);
  }
  else
  {
    console.log(message, error);
  }
}

/**
 * Extracts the error message from an error
 */
function extractErrorMessage(error)
{
  if (error.response != undefined && error.response.data != undefined)
  {
    return error.response.data.error;
  }
  else
  {
    return error.message;
  }
}

/**
 * Makes an outbound test call
 */
async function outboundTestCall(testId, phoneNumber)
{
  try
  {
    var options = {
      headers: {
        'x-api-key': unstore('api-key')
      }
    };

    successToast('Initiating outbound call...');

    var test = await getTest(testId);

    var payload = JSON.parse(test.payload);

    await axios.post(siteConfig.api + '/outbound', {
      phoneNumber: phoneNumber,
      customerState: payload
    }, options);

    return true;
  }
  catch (error)
  {
    logError('[ERROR] failed to initiate outbound call', error);
    errorToast('Failed to initiate outbound call');
    return false;
  }
}

/**
 * Fetches a sample test respecting the current rule set
 */
async function getSampleTest()
{
  try
  {
    var options = {
      headers: {
        'x-api-key': unstore('api-key')
      }
    };

    var response = await axios.get(siteConfig.api + '/sampletest', options);
    return response.data.sample;
  }
  catch (error)
  {
    logError('[ERROR] Failed to get sample test message', error);
    errorToast('Failed to get sample test message');
    return [];
  }
}

/**
 * Loads all users requires ADMINISTRATOR
 */
async function getUsers()
{
  try
  {
    var options = {
      headers: {
        'x-api-key': unstore('api-key')
      }
    };

    var response = await axios.get(`${siteConfig.api}/users`, options);

    var users = response.data.users;

    return users;
  }
  catch (error)
  {
    logError('[ERROR] Failed to load users', error);
    errorToast('Failed to load users');
    return [];
  }
}

/**
 * Deeply loads all rule sets
 */
async function getRuleSetsForExport()
{
  try
  {
    var options = {
      headers: {
        'x-api-key': unstore('api-key')
      }
    };

    successToast('Loading Rule Sets for export...');

    var response = await axios.get(`${siteConfig.api}/rulesetsforexport`, options);

    var ruleSets = response.data.ruleSets;

    return ruleSets;
  }
  catch (error)
  {
    logError('[ERROR] Failed to load rule sets', error);
    errorToast('Failed to load rule sets');
    return [];
  }
}

/**
 * Import rule sets
 */
async function importRuleSets(ruleSets)
{
  try
  {
    var options = {
      headers: {
        'x-api-key': unstore('api-key')
      }
    };

    var body = {
      ruleSets: ruleSets
    };

    await axios.post(`${siteConfig.api}/rulesetsimport`, body, options);
  }
  catch (error)
  {
    logError('[ERROR] Failed to import rule sets', error);
    errorToast('Failed to import rule sets');
    throw error;
  }
}

/**
 * Fetches the time of last change from the remote server
 * to avoid large remote loads
 */
async function getLastChangeTimestamp()
{
  try
  {
    var options = {
      headers: {
        'x-api-key': unstore('api-key')
      }
    };

    var response = await axios.get(`${siteConfig.api}/lastchange`, options);

    console.log('[INFO] found last remote change: ' + response.data.lastChangeTimestamp);

    return response.data.lastChangeTimestamp;
  }
  catch (error)
  {
    console.log('[ERROR] failed to load timestamp of last change', error);
    throw error;
  }
}

/**
 * Checks to see if the cache is valid passing the 
 * key that stores the timestamp and the last remote change
 */
function isCacheValid(timestampKey, lastChange)
{
  var lastLoad = unstore(timestampKey);

  if (lastLoad === null)
  {
    return false;
  }

  // If the last reported remote change is after out last load
  // then the cache is invalid
  if (moment(lastChange).isAfter(moment(lastLoad)))
  {
    return false;
  }

  return true;
}

/**
 * Loads all rule sets, using a local cache when possible
 */
async function getRuleSets()
{
  try
  {
    var lastChange = await getLastChangeTimestamp();

    if (isCacheValid('ruleSetsTimestamp', lastChange))
    {
      console.log('[INFO] using local cache of rule sets');
      return unstoreObject('ruleSets');
    }

    clearStorage('ruleSets');
    clearStorage('ruleSetsTimestamp');
    console.log('[INFO] loading remote rule sets');

    var options = {
      headers: {
        'x-api-key': unstore('api-key')
      }
    };

    var response = await axios.get(`${siteConfig.api}/rulesets`, options);

    var ruleSets = response.data.ruleSets;

    storeObject('ruleSets', ruleSets);
    store('ruleSetsTimestamp', lastChange);

    return ruleSets;
  }
  catch (error)
  {
    logError('[ERROR] Failed to load rule sets', error);
    errorToast('Failed to load rule sets');
    return [];
  }
}

/**
 * Loads the graph for all rule sets
 */
async function getRuleSetsGraph()
{
  try
  {
    var lastChange = await getLastChangeTimestamp();

    if (isCacheValid('ruleSetsGraphTimestamp', lastChange))
    {
      console.log('[INFO] using local cache of rule sets graph');
      return unstoreObject('ruleSetsGraph');
    }

    clearStorage('ruleSetsGraph');
    clearStorage('ruleSetsGraphTimestamp');
    console.log('[INFO] loading remote rule sets graph');

    var options = {
      headers: {
        'x-api-key': unstore('api-key')
      }
    };

    var response = await axios.get(`${siteConfig.api}/rulesetsgraph`, options);

    var graphData = response.data;

    storeObject('ruleSetsGraph', graphData);
    store('ruleSetsGraphTimestamp', lastChange);

    return graphData;
  }
  catch (error)
  {
    logError('[ERROR] Failed to load rule sets graph', error);
    errorToast('Failed to load rule sets graph');
    return [];
  }
}

/**
 * Loads connect data
 */
async function getConnectData()
{
  try
  {
    successToast('Loading Amazon Connect data...');

    var options = {
      headers: {
        'x-api-key': unstore('api-key')
      }
    };

    var response = await axios.get(`${siteConfig.api}/connect`, options);

    var phoneNumbers = response.data.phoneNumbers;
    var contactFlows = response.data.contactFlows;
    var lambdaFunctions = response.data.lambdaFunctions;
    var timeZone = response.data.timeZone;
    var localTime = response.data.localTime;
    var localDateTime = response.data.localDateTime;
    var evaluatedHours = response.data.evaluatedHours;
    var contactFlows = response.data.contactFlows;
    var queues = response.data.queues;
    var prompts = response.data.prompts;

    storeObject('phoneNumbers', phoneNumbers);
    storeObject('contactFlows', contactFlows);
    storeObject('queues', queues);
    storeObject('prompts', prompts);
    storeObject('lambdaFunctions', lambdaFunctions);

    successToast('Loaded Amazon Connect data!');
  }
  catch (error)
  {
    logError('[ERROR] Failed to load connect data', error);
    errorToast('Failed to load connect data');
    return null;
  }
}

/**
 * Loads a rule set for editing
 */
async function getRuleSet(ruleSetId)
{
  try
  {
    var options = {
      headers: {
        'x-api-key': unstore('api-key')
      }
    };

    var response = await axios.get(`${siteConfig.api}/ruleset?ruleSetId=${ruleSetId}`, options);
    return response.data.ruleSet;
  }
  catch (error)
  {
    logError('[ERROR] Failed to load rule set', error);
    errorToast('Failed to load rule set');
    return null;
  }
}

/**
 * Loads a rule by id
 */
async function getRule(ruleSetId, ruleId)
{
  try
  {
    var options = {
      headers: {
        'x-api-key': unstore('api-key')
      }
    };

    var response = await axios.get(`${siteConfig.api}/rule?ruleSetId=${ruleSetId}&ruleId=${ruleId}`, options);

    var rule = response.data.rule;

    return rule;
  }
  catch (error)
  {
    logError('[ERROR] Failed to load rule', error);
    errorToast('Failed to load rule');
  }
}

/**
 * Loads a test by id
 */
async function getTest(testId)
{
  try
  {
    var options = {
      headers: {
        'x-api-key': unstore('api-key')
      }
    };

    var response = await axios.get(siteConfig.api + '/test?testId=' + testId, options);

    var test = response.data.test;

    return test;
  }
  catch (error)
  {
    logError('[ERROR] Failed to load test', error);
    errorToast('Failed to load test');
  }
}

/**
 * Loads all tests for editing
 */
async function getTests()
{
  try
  {
    var options = {
      headers: {
        'x-api-key': unstore('api-key')
      }
    };

    var response = await axios.get(siteConfig.api + '/tests', options);
    return response.data.tests;
  }
  catch (error)
  {
    logError('[ERROR] Failed to load tests', error);
    errorToast('Failed to load tests');
    return [];
  }
}

/**
 * Creates a new user
 */
async function createUser(firstName, lastName, emailAddress, userRole, apiKey, userEnabled)
{
  try
  {
    var options = {
      headers: {
        'x-api-key': unstore('api-key')
      }
    };

    stickySuccessToast('Creating your user...')

    await axios.put(siteConfig.api + '/user', { 
      firstName: firstName,
      lastName: lastName,
      emailAddress: emailAddress,
      userRole: userRole,
      apiKey: apiKey,
      userEnabled: userEnabled
    }, options);

    return true;
  }
  catch (error)
  {
    logError('[ERROR] Failed to create user', error);

    if (error.response && error.response.status === 409)
    {
      errorToast('A user already exists with this email address');  
    }
    else
    {
      errorToast('Failed to create your user');   
    }
    
    return false;
  }
}

/**
 * Creates a new holiday
 */
async function createHoliday(when, name, description, closed)
{
  try
  {
    var options = {
      headers: {
        'x-api-key': unstore('api-key')
      }
    };

    stickySuccessToast('Creating your holiday...')

    await axios.put(siteConfig.api + '/holiday', { 
      when: when,
      name: name,
      description: description,
      closed: closed
    }, options);

    return true;
  }
  catch (error)
  {
    logError('[ERROR] Failed to create holiday', error);
  
    errorToast('Failed to create your holiday');   
    
    return false;
  }
}

/**
 * Saves a holiday
 */
async function saveHoliday(holidayId, when, name, description, closed)
{
  try
  {
    var options = {
      headers: {
        'x-api-key': unstore('api-key')
      }
    };

    stickySuccessToast('Saving your holiday...')

    await axios.post(siteConfig.api + '/holiday', { 
      holidayId: holidayId,
      when: when,
      name: name,
      description: description,
      closed: closed
    }, options);

    return true;
  }
  catch (error)
  {
    logError('[ERROR] Failed to save holiday', error);
  
    errorToast('Failed to save your holiday');   
    
    return false;
  }
}

/**
 * Delete a holiday
 */
async function deleteHoliday(holidayId)
{
  try
  {
    var options = {
      headers: {
        'x-api-key': unstore('api-key')
      }
    };

    stickySuccessToast('Deleting your holiday...')

    await axios.delete(`${siteConfig.api}/holiday?holidayId=${holidayId}`, options);

    return true;
  }
  catch (error)
  {
    logError('[ERROR] Failed to delete holiday', error);
  
    errorToast('Failed to delete your holiday');   
    
    return false;
  }
}

/**
 * Get holidays
 */
async function getHolidays()
{
  try
  {
    var options = {
      headers: {
        'x-api-key': unstore('api-key')
      }
    };

    var response = await axios.get(`${siteConfig.api}/holidays`, options);

    var holidays = response.data.holidays;

    console.log('[INFO] got holidays: ' + JSON.stringify(holidays, null, 2));

    return holidays;
  }
  catch (error)
  {
    logError('[ERROR] Failed to fetch holidays', error);
  
    errorToast('Failed to fetch holidays');   
    
    return false;
  }
}

/**
 * Saves a main event
 */
async function saveMainEvent(eventId, name, speechName, fastPathMinutes, description, active)
{
  try
  {
    var options = {
      headers: {
        'x-api-key': unstore('api-key')
      }
    };

    stickySuccessToast('Saving your event...')

    await axios.post(siteConfig.api + '/mainevent', {
      eventId: eventId,
      name: name,
      speechName: speechName,
      fastPathMinutes: fastPathMinutes,
      description: description,
      active: active 
    }, options);

    return true;
  }
  catch (error)
  {
    logError('[ERROR] Failed to save event', error);
  
    errorToast('Failed to save your event');   
    
    return false;
  }
}

/**
 * Delete a mian event by id
 */
async function deleteMainEvent(eventId)
{
  try
  {
    var options = {
      headers: {
        'x-api-key': unstore('api-key')
      }
    };

    stickySuccessToast('Deleting your event...')

    await axios.delete(`${siteConfig.api}/mainevent?eventId=${eventId}`, options);

    return true;
  }
  catch (error)
  {
    logError('[ERROR] Failed to delete event', error);
  
    errorToast('Failed to delete your event');   
    
    return false;
  }
}

/**
 * Get mian events
 */
async function getMainEvents()
{
  try
  {
    var options = {
      headers: {
        'x-api-key': unstore('api-key')
      }
    };

    var response = await axios.get(`${siteConfig.api}/mainevents`, options);

    var events = response.data.events;

    console.log('[INFO] got events: ' + JSON.stringify(events, null, 2));

    return events;
  }
  catch (error)
  {
    logError('[ERROR] Failed to fetch events', error);
  
    errorToast('Failed to fetch events');   
    
    return false;
  }
}

/**
 * Creates a new rule set
 */
async function createRuleSet(ruleSetName, ruleSetEnabled, ruleSetDescription, inboundNumbers)
{
  try
  {
    var options = {
      headers: {
        'x-api-key': unstore('api-key')
      }
    };

    stickySuccessToast('Creating your rule set...')

    var response = await axios.put(siteConfig.api + '/ruleset', { 
      ruleSetName: ruleSetName,
      ruleSetEnabled: ruleSetEnabled,
      ruleSetDescription: ruleSetDescription,
      inboundNumbers: inboundNumbers
    }, options);

    return response.data.ruleSetId;
  }
  catch (error)
  {
    logError('[ERROR] Failed to create rule set', error);

    if (error.response && error.response.status === 409)
    {
      errorToast('A rule set with this name already exists, choose another name');  
    }
    else
    {
      errorToast('Failed to create your rule set');   
    }
    
    return undefined;
  }
}

/**
 * Creates a new rule
 */
async function createRule(ruleSetId, ruleName, ruleEnabled, ruleDescription, 
  rulePriority, ruleActivation, ruleType, params, weights)
{
  try
  {
    var options = {
      headers: {
        'x-api-key': unstore('api-key')
      }
    };

    stickySuccessToast('Creating your rule...')

    var response = await axios.put(siteConfig.api + '/rule', { 
      ruleSetId: ruleSetId,
      ruleName: ruleName,
      ruleEnabled: ruleEnabled,
      ruleDescription: ruleDescription,
      rulePriority: rulePriority,
      ruleActivation: ruleActivation,
      ruleType: ruleType,
      params: params,
      weights: weights
    }, options);

    return response.data.ruleId;
  }
  catch (error)
  {
    logError('[ERROR] Failed to create rule', error);

    if (error.response && error.response.status === 409)
    {
      errorToast('A rule with this name already exists in this rule set, choose another name');  
    }
    else
    {
      errorToast('Failed to create your rule');   
    }
    
    return undefined;
  }
}

/**
 * Updates an existing rules set
 */
async function updateRuleSet(ruleSetId, ruleSetEnabled, ruleSetDescription, inboundNumbers)
{
  try
  {
    var options = {
      headers: {
        'x-api-key': unstore('api-key')
      }
    };

    stickySuccessToast('Updating rule set...')

    await axios.post(siteConfig.api + '/ruleset', { 
      ruleSetId: ruleSetId,
      ruleSetEnabled: ruleSetEnabled,
      ruleSetDescription: ruleSetDescription,
      inboundNumbers: inboundNumbers
    }, options);

    return true;
  }
  catch (error)
  {
    logError('[ERROR] Failed to update rule set', error);
    errorToast('Failed to update rule set');
    return false;
  }
}

/**
 * Updates an existing rule
 */
async function updateRule(ruleSetId, ruleId, ruleEnabled, ruleDescription, 
  rulePriority, ruleActivation, ruleType, params)
{
  try
  {
    var options = {
      headers: {
        'x-api-key': unstore('api-key')
      }
    };

    stickySuccessToast('Updating rule...')

    await axios.post(siteConfig.api + '/rule', { 
      ruleSetId: ruleSetId,
      ruleId: ruleId,
      ruleEnabled: ruleEnabled,
      ruleDescription: ruleDescription,
      rulePriority: rulePriority,
      ruleActivation: ruleActivation,
      ruleType: ruleType,
      params: params
    }, options);

    return true;
  }
  catch (error)
  {
    logError('[ERROR] Failed to update rule', error);
    errorToast('Failed to update rule');
    return false;
  }
}

/**
 * Updates an existing test
 */
async function updateTest(testId, testDescription, testPayload)
{
  try
  {
    var options = {
      headers: {
        'x-api-key': unstore('api-key')
      }
    };

    stickySuccessToast('Updating test...')

    try
    {
      var parsedPayload = JSON.parse(testPayload);
    }
    catch (parseError)
    {
      logError('[ERROR] Failed to update test', parseError);
      errorToast('Invalid JSON payload');
      return false;
    }

    await axios.post(siteConfig.api + '/test', { 
      testId: testId,
      testDescription: testDescription,
      testPayload: testPayload
    }, options);

    return true;
  }
  catch (error)
  {
    logError('[ERROR] Failed to update test', error);
    errorToast('Failed to update test');
    return false;
  }
}

/**
 * Creates a new test
 */
async function createTest(testName, testDescription, testPayload)
{
  try
  {
    var options = {
      headers: {
        'x-api-key': unstore('api-key')
      }
    };

    stickySuccessToast('Creating your test...');

    try
    {
      var parsedPayload = JSON.parse(testPayload);
    }
    catch (parseError)
    {
      logError('[ERROR] Failed to create test', parseError);
      errorToast('Invalid JSON payload');
      return false;
    }

    if (parsedPayload.System === undefined)
    {
      throw new Error('Invalid payload, missing System field');
    }

    if (parsedPayload.System.DialledNumber === undefined)
    {
      throw new Error('Invalid payload, missing System.DialledNumber field');
    }

    var phoneNumbers = unstoreObject('phoneNumbers');
    var existingPhone = phoneNumbers.find(phone => phone.PhoneNumber === parsedPayload.System.DialledNumber);

    if (existingPhone === undefined)
    {
      throw new Error('Invalid System.DialledNumber, must be a Connect allocated number');
    }

    await axios.put(siteConfig.api + '/test', { 
      testName: testName,
      testDescription: testDescription,
      testPayload: testPayload
    }, options);

    return true;
  }
  catch (error)
  {
    logError('[ERROR] Failed to create test', error);

    if (error.response && error.response.status === 409)
    {
      errorToast('A test with this name already exists, choose another name');  
    }
    else
    {
      errorToast('Failed to create your test');   
    }
    
    return false;
  }
}

/**
 * Creates a new weight
 */
async function createWeight(ruleSetId, ruleId, field, operation, value, weight)
{
  try
  {
    var options = {
      headers: {
        'x-api-key': unstore('api-key')
      }
    };

    stickySuccessToast('Creating weight...')

    await axios.put(siteConfig.api + '/weight', { 
      ruleSetId: ruleSetId,
      ruleId: ruleId,
      field: field,
      operation: operation,
      value: value,
      weight: weight
    }, options);

    return true;
  }
  catch (error)
  {
    logError('[ERROR] Failed to create weight', error);
    errorToast('Failed to create your weight');    
    return false;
  }
}

/**
 * Delete a weight
 */
async function deleteWeight(ruleSetId, ruleId, weightId)
{
  try
  {
    var options = {
      headers: {
        'x-api-key': unstore('api-key')
      }
    };

    stickySuccessToast('Deleting weight...')

    await axios.delete(`${siteConfig.api}/weight?ruleSetId=${ruleSetId}&ruleId=${ruleId}&weightId=${weightId}`, options);

    return true;
  }
  catch (error)
  {
    logError('[ERROR] Failed to delete weight', error);
    errorToast('Failed to delete weight');    
    return false;
  }
}

/**
 * Delete a user
 */
async function deleteUser(userId)
{
  try
  {
    var options = {
      headers: {
        'x-api-key': unstore('api-key')
      }
    };

    stickySuccessToast('Deleting user...')

    await axios.delete(`${siteConfig.api}/user?userId=${userId}`, options);

    return true;
  }
  catch (error)
  {
    logError('[ERROR] Failed to delete user', error);
    errorToast('Failed to delete user');    
    return false;
  }
}

/**
 * Updates an existing user
 */
async function updateUser(userId, firstName, lastName, 
  emailAddress, userRole, apiKey, userEnabled)
{
  try
  {
    var options = {
      headers: {
        'x-api-key': unstore('api-key')
      }
    };

    stickySuccessToast('Updating user...')

    await axios.post(siteConfig.api + '/user', { 
      userId: userId,
      firstName: firstName,
      lastName: lastName,
      emailAddress: emailAddress,
      userRole: userRole,
      apiKey: apiKey,
      userEnabled: userEnabled
    }, options);

    return true;
  }
  catch (error)
  {
    logError('[ERROR] Failed to update user', error);

    if (error.response && error.response.status === 409)
    {
      errorToast(error.response.data.data.message);  
    }
    else
    {
      errorToast('Failed to update user');   
    }

    return false;
  }
}

/**
 * Deletes a rule set
 */
async function deleteRuleSet(ruleSetId)
{
  try
  {
    var options = {
      headers: {
        'x-api-key': unstore('api-key')
      }
    };

    stickySuccessToast('Deleting rule set...');
    await axios.delete(`${siteConfig.api}/ruleset?ruleSetId=${ruleSetId}`, options);
    return true;
  }
  catch (error)
  {

    logError('[ERROR] Failed to delete rule set: ', error);

    if (error.response && error.response.status === 409)
    {
      errorToast('Cannot delete a rule set that is in use: ' + error.response.data.data.message);  
    }
    else
    {
      errorToast('Failed to delete your rule set');   
    }

    return false;
  }
}

/**
 * Clones a rule set and it's rules to a new name
 */
async function cloneRuleSet(ruleSetId, newName)
{
  try
  {
    var options = {
      headers: {
        'x-api-key': unstore('api-key')
      }
    };

    stickySuccessToast('Cloning rule set...');

    var body = {
      ruleSetId: ruleSetId,
      ruleSetName: newName
    };

    var response = await axios.post(`${siteConfig.api}/rulesetclone`, body, options);

    return response.data.ruleSetId;
  }
  catch (error)
  {

    logError('[ERROR] Failed to clone rule set: ', error);

    if (error.response && error.response.status === 409)
    {
      errorToast(error.response.data.data.message);  
    }
    else
    {
      errorToast('Failed to clone your rule set');   
    }

    return undefined;
  }
}

/**
 * Renames a rule to a new name
 */
async function renameRule(ruleSetId, ruleId, newName)
{
  try
  {
    var options = {
      headers: {
        'x-api-key': unstore('api-key')
      }
    };

    stickySuccessToast('Renaming rule...');

    var body = {
      ruleSetId: ruleSetId,
      ruleId: ruleId,
      ruleName: newName
    };

    await axios.post(`${siteConfig.api}/rulename`, body, options);
    return true;
  }
  catch (error)
  {

    logError('[ERROR] Failed to rename rule: ', error);

    if (error.response && error.response.status === 409)
    {
      errorToast(error.response.data.data.message);  
    }
    else
    {
      errorToast('Failed to rename your rule');   
    }

    return false;
  }
}

/**
 * Renames a rule set to a new name
 */
async function renameRuleSet(ruleSetId, newName)
{
  try
  {
    var options = {
      headers: {
        'x-api-key': unstore('api-key')
      }
    };

    stickySuccessToast('Renaming rule set...');

    var body = {
      ruleSetId: ruleSetId,
      ruleSetName: newName
    };

    await axios.post(`${siteConfig.api}/rulesetname`, body, options);
    return true;
  }
  catch (error)
  {

    logError('[ERROR] Failed to rename rule set: ', error);

    if (error.response && error.response.status === 409)
    {
      errorToast(error.response.data.data.message);  
    }
    else
    {
      errorToast('Failed to rename your rule set');   
    }

    return false;
  }
}

/**
 * Deletes a rule
 */
async function deleteRule(ruleSetId, ruleId)
{
  try
  {
    var options = {
      headers: {
        'x-api-key': unstore('api-key')
      }
    };

    stickySuccessToast('Deleting rule...');
    await axios.delete(`${siteConfig.api}/rule?ruleSetId=${ruleSetId}&ruleId=${ruleId}`, options);
    return true;
  }
  catch (error)
  {
    logError('[ERROR] Failed to delete a rule', error);
    errorToast('Failed to delete rule');
    return false;
  }
}

/**
 * Deletes a test
 */
async function deleteTest(testId)
{
  try
  {
    var options = {
      headers: {
        'x-api-key': unstore('api-key')
      }
    };

    stickySuccessToast('Deleting test...');
    await axios.delete(siteConfig.api + '/test?testId=' + testId, options);
    return true;
  }
  catch (error)
  {
    logError('[ERROR] Failed to delete a test', error);
    errorToast('Failed to delete test');
    return false;
  }
}

/**
 * Fetches system health
 */
async function getSystemHealth()
{
  try
  {
    var options = {
      headers: {
        'x-api-key': unstore('api-key')
      }
    };

    stickySuccessToast('Loading system health...');
    var response = await axios.get(siteConfig.api + '/systemhealth', options);
    return response.data.systemHealth;

  }
  catch (error)
  {
    logError('[ERROR] Failed to determine system health', error);
    errorToast('Failed to determine system health');
    throw error;
  }
}

/**
 * Attempts to repair contact flows
 */
async function repairContactFlows()
{
  try
  {
    var options = {
      headers: {
        'x-api-key': unstore('api-key')
      }
    };

    stickySuccessToast('Repairing contact flows...');
    var response = await axios.post(siteConfig.api + '/repaircontactflows', {}, options);
    return response.data.status;
  }
  catch (error)
  {
    logError('[ERROR] Failed to repair contact flows', error);
    errorToast('Failed to repair contact flows');
    throw error;
  }
}

/**
 * Attempts to repair lambda functions
 */
async function repairLambdaFunctions()
{
  try
  {
    var options = {
      headers: {
        'x-api-key': unstore('api-key')
      }
    };

    stickySuccessToast('Repairing lambda functions...');
    var response = await axios.post(siteConfig.api + '/repairlambdafunctions', {}, options);
    return response.data.status;
  }
  catch (error)
  {
    logError('[ERROR] Failed to repair lambda functions', error);
    errorToast('Failed to repair lambda functions');
    throw error;
  }
}

/**
 * Inferences the rules engine
 */
async function inference(message)
{
  try
  {
    var options = {
      headers: {
        'x-api-key': unstore('api-key')
      }
    };

    var response = await axios.post(siteConfig.api + '/inference', { message: message }, options);
    var inferenceResults = response.data;
    return inferenceResults.inference;
  }
  catch (error)
  {
    logError('[ERROR] Failed to inference rules', error);
    errorToast('Failed to inference');
    throw error;
  }
}

/**
 * Formats a tooltip
 */
function formatTooltip(type, data, maxLength)
{
  if (type === 'display')
  {
    if (data.length > maxLength)
    {
      return sprintf('<div data-toggle="tooltip" title="%s">%s…</span>', 
        data, data.substr(0, maxLength));
    }
    else
    {
      return data;
    }
  }
  else
  {
    return data;
  }
}

/**
 * Renders a check icon if the value is true
 */
function renderCheck(type, data, maxLength)
{
  if (type === 'display')
  {
    if (data === 'true')
    {
      return '<i class="fas fa-check text-success" title="Enabled" data-toggle="tooltip"></i>';
    }
    else
    {
      return '<i class="fas fa-times text-muted" title="Disabled" data-toggle="tooltip"></i>';
    }
  }
  else
  {
    return '';
  }
}

/**
 * Fetches the list of valid action names
 */
function getValidActionNames()
{
  return [
    'AuditCall',
    // 'Callback',
    'DTMFMenu',
    'DTMFInput',
    'DTMFSelector',
    'ExternalNumber',
    'Flow',
    'FlowPrompt',
    'Integration',
    'Message',
    'Metric',
    'Queue',
    'QueuePrompt',
    'RuleSet',
    'RuleSetBail',
    'RuleSetPrompt',
    'SetAttribute',
    'SMSMessage',
    'Terminate',
    'UpdateState',
    // 'Voicemail'
  ];
}


