var requestUtils = require('./utils/RequestUtils.js');
var dynamoUtils = require('./utils/DynamoUtils.js');
var connectUtils = require('./utils/ConnectUtils.js');
var rulesEngine = require('./utils/RulesEngine.js');
var configUtils = require('./utils/ConfigUtils.js');
var lambdaUtils = require('./utils/LambdaUtils.js');
var operatingHoursUtils = require('./utils/OperatingHoursUtils.js');

var moment = require('moment-timezone');
var LRU = require("lru-cache");

/**
 * LRU cache for loaded objects
 * TODO make this longer in production
 */
var cacheTimeSeconds = 1000 * 60;
var cacheOptions = { max: 100, maxAge: cacheTimeSeconds };
var cache = new LRU(cacheOptions);

/**
 * Connect rules inferencing Lambda function.
 * This function runs at the start of the main contact flow
 * and has several purposes:
 * 
 * - Loads customer state from DDB
 * - Calculate system attributes if not set
 * - If customer data has not been loaded try and load it
 * - If there is no current ruleset loaded, 
 *    try and determine it from the dialled number
 * - If there is a current rule set, look for the next rule to activate
 * - If there is a NextRuleSet state set swap to it
 * 
 * Once a rule set has been identified, look for the next rule to fire
 * which might have an offset starting rule.
 * 
 * Prune out old rule state using the prefix CurrentRule_
 * 
 * Finally merge in the current rule's config into the state and save it with the
 * updated fields and export user state.
 */
exports.handler = async(event, context, callback) =>
{
  try
  {
    requestUtils.logRequest(event);

    // A list of state keys to update
    var stateToSave = new Set();

    // Grab the contact id from the event
    var contactId = event.Details.ContactData.ContactId;

    // Load the current customer state this will be empty on first approach
    var customerState = await dynamoUtils.getParsedCustomerState(process.env.STATE_TABLE, contactId);

    // Load system attributes if they are not already loaded
    await loadSystemAttributes(process.env.CONFIG_TABLE, event, customerState, stateToSave);

    // console.log('[DEBUG] loaded customer state: ' + JSON.stringify(customerState, null, 2));

    // Store the incoming customer phone number in the state
    storeCustomerPhone(contactId, event, customerState, stateToSave);

    // If we don't have any customer accounts loaded, try and load the customer
    await loadCustomerAccounts(contactId, customerState, stateToSave);

    // Load up the cached rule sets
    var ruleSets = await getCachedRuleSets();

    // Find the current rule set and clone it
    var currentRuleSet = getCurrentRuleSet(contactId, ruleSets, customerState, stateToSave);

    // Remove old rule state
    pruneOldRuleState(contactId, customerState, stateToSave);

    // Identify the start index to check rules from
    var startIndex = getNextRuleIndex(contactId, currentRuleSet, customerState, stateToSave);

    // console.log('[DEBUG] found starting rule index: ' + startIndex);

    // Load up potentially cached contact flows
    var contactFlows = await connectUtils.listContactFlows(process.env.INSTANCE_ID);

    // Load up potentially cached prompts
    var prompts = await connectUtils.listPrompts(process.env.INSTANCE_ID);

    // Load up potentially cached lambda functions
    var lambdaFunctions = await lambdaUtils.listConnectLambdaFunctions(process.env.STAGE, process.env.SERVICE);

    // Load up potentially cached queues
    var queues = await connectUtils.listQueues(process.env.INSTANCE_ID);

    // TODO load operating hours into the state

    // Fetch the next activated rule
    var nextRule = rulesEngine.getNextActivatedRule(
      process.env.STAGE, process.env.SERVICE,
      contactId, currentRuleSet.rules, 
      startIndex, customerState, queues, prompts,
      contactFlows, lambdaFunctions);

    // Export the parameters from the next rule into the customer state
    exportRuleIntoState(contactId, nextRule, contactFlows, customerState, stateToSave);

    // Persist customer state changes
    // console.log('[DEBUG] about to persist state');
    await dynamoUtils.persistCustomerState(process.env.STATE_TABLE, contactId, customerState, Array.from(stateToSave));
    // console.log('[DEBUG] persisting state complete');

    var response = requestUtils.buildCustomerStateResponse(customerState);

    console.log('[DEBUG] made inference response: ' + JSON.stringify(response));

    return response;
  }
  catch (error)
  {
    console.log('[ERROR] failed to inference rules engine from connect', error);
    throw error; 
  }
};

/**
 * Load rule sets and their rules through the cache
 * and filter out disabled rulesets and rules, 
 * always clones rule sets
 */
async function getCachedRuleSets()
{
  var ruleSets = cache.get('ruleSets');

  if (ruleSets !== undefined)
  {
    return JSON.parse(JSON.stringify(ruleSets));
  }

  console.log('[INFO] loading uncached rule sets');

  ruleSets = await dynamoUtils.getRuleSetsAndRules(
    process.env.RULE_SETS_TABLE,
    process.env.RULES_TABLE);

  // Filter out disabled rule sets
  ruleSets = ruleSets.filter(ruleSet => ruleSet.enabled === true);

  // Filter out disabled rules
  ruleSets.forEach(ruleSet => {
    ruleSet.rules = ruleSet.rules.filter(rule => rule.enabled === true);
  });

  cache.set('ruleSets', ruleSets);

  return JSON.parse(JSON.stringify(ruleSets));
}

/**
 * If there is no System customer state, compute one.
 * This calculates the operating hours, dialled number, call timestamps,
 * morning / afternoon flags and holiday status
 */
async function loadSystemAttributes(configTable, contactEvent, customerState, stateToSave)
{
  try
  {
    if (customerState.System === undefined)
    {
      var timeZone = await configUtils.getCallCentreTimeZone(configTable);
      var operatingHoursState = await operatingHoursUtils.evaluateOperatingHours(configTable);

      var utcTime = moment().utc();
      var localTime = moment(utcTime).tz(timeZone);
      var localHour = localTime.hour();

      var dialledNumber = 'Unknown';

      if (contactEvent.Details && 
          contactEvent.Details.ContactData &&
          contactEvent.Details.ContactData.SystemEndpoint &&
          contactEvent.Details.ContactData.SystemEndpoint.Address)
      {
        dialledNumber = contactEvent.Details.ContactData.SystemEndpoint.Address;
      }   

      var isHoliday = await operatingHoursUtils.isHoliday(configTable);

      var systemState = {
        Holiday: '' + isHoliday,
        OperatingHours: operatingHoursState,
        DialledNumber: dialledNumber,
        DateTimeUTC: utcTime.format(),
        DateTimeLocal: localTime.format(),
        TimeLocal: localTime.format('hh:mm A'),
        TimeOfDay: connectUtils.getTimeOfDay(localHour)
      };

      console.log(`[INFO] setting contact System state to: ${JSON.stringify(systemState, null, 2)}`);

      updateState(customerState, stateToSave, 'System', systemState);
    }
  }
  catch (error)
  {
    console.log('[ERROR] failed to create customer state', error);
    throw error;
  }
}

/**
 * Look for a customer phone number in the event, this can be undefined
 * if the customer has with-held caller id
 */
function storeCustomerPhone(contactId, contactEvent, customerState, stateToSave)
{
  if (customerState.CustomerPhoneNumber === undefined)
  {
    if (contactEvent.Details && 
        contactEvent.Details.ContactData &&
        contactEvent.Details.ContactData.CustomerEndpoint &&
        contactEvent.Details.ContactData.CustomerEndpoint.Address)
    {
      updateState(customerState, stateToSave, 'CustomerPhoneNumber', contactEvent.Details.ContactData.CustomerEndpoint.Address);
      console.log('[DEBUG] stored customer number: ' + customerState.CustomerPhoneNumber);
    }
  }

  if (customerState.OriginalCustomerNumber === undefined)
  {
    updateState(customerState, stateToSave, 'OriginalCustomerNumber', customerState.CustomerPhoneNumber);
  }

  return customerState.CustomerPhoneNumber;
}

/**
 * Load the current ruleset using this behaviour:
 * 
 * 1) If there is a NextRuleSet in state load it and clear the NextRuleSet state
 * 2) If there is a CurrentRuleSet use it
 * 3) Look for a rule set using the dialled number
 * 4) Fail if we can't identify a current rule set
 */
function getCurrentRuleSet(contactId, ruleSets, customerState, stateToSave)
{
  try
  {
    var currentRuleSet = undefined;

    // If we have a next rule set locate it by name and clean up state
    if (customerState.NextRuleSet !== undefined)
    {
      // console.log('[DEBUG] found next rule set to load: ' + customerState.NextRuleSet);
      currentRuleSet = getRuleSetByName(contactId, ruleSets, customerState.NextRuleSet);

      // Remove the next rule set directive
      updateState(customerState, stateToSave, 'NextRuleSet', undefined);

      // Clear the current rule if it was set
      updateState(customerState, stateToSave, 'CurrentRule', undefined);

      // Update the current rule set
      updateState(customerState, stateToSave, 'CurrentRuleSet', currentRuleSet.name);
    }
    // If we have a current rule set load it
    else if (customerState.CurrentRuleSet !== undefined)
    {
      // console.log('[DEBUG] found current rule set to load: ' + customerState.CurrentRuleSet);
      currentRuleSet = getRuleSetByName(contactId, ruleSets, customerState.CurrentRuleSet);      
    }
    // Look for a rule set using the dialled number
    else
    {
      console.log('[DEBUG] Looking for a rule set using dialled number: ' + customerState.System.DialledNumber);
      currentRuleSet = getRuleSetByDialledNumber(contactId, ruleSets, customerState.System.DialledNumber);

      // Update the current rule set
      updateState(customerState, stateToSave, 'CurrentRuleSet', currentRuleSet.name);

      // Clear the current rule if it was set
      updateState(customerState, stateToSave, 'CurrentRule', undefined);     
    }
  }
  catch (error)
  {
    console.log(`[ERROR] failed to locate rule set for contact id: ${contactId}`, error);
    throw error;
  }

  return currentRuleSet;
}

/**
 * Find a rule set by name returning undefined if not found.
 * RuleSets might be missing if they are disabled.
 */
function getRuleSetByName(contactId, ruleSets, ruleSetName)
{
  var ruleSet = ruleSets.find(rs => rs.name === ruleSetName);

  if (ruleSet === undefined)
  {
    throw new Error(`Failed to find rule set for name: ${ruleSetName} for contact id: ${contactId}`);
  }

  return ruleSet;
}

/**
 * Locate a rule set using the dialled number
 */
function getRuleSetByDialledNumber(contactId, ruleSets, dialledNumber)
{
  var ruleSet = ruleSets.find(rs => rs.inboundNumbers.includes(dialledNumber));

  if (ruleSet === undefined)
  {
    throw new Error(`Failed to find rule set by dialled number: ${dialledNumber} for contact id: ${contactId}`);
  }

  return ruleSet;
}

/**
 * Prunes old rule state so we don't pollute between rules
 */
function pruneOldRuleState(contactId, customerState, stateToSave)
{
  var stateKeys = Object.keys(customerState);

  stateKeys.forEach(key => {
    if (key.startsWith('CurrentRule_'))
    {
      updateState(customerState, stateToSave, key, undefined);
    }
  });
}

/**
 * Look for the next rule, starting from the current rule's index + 1
 */
function getNextRuleIndex(contactId, currentRuleSet, customerState, stateToSave)
{
  var startIndex = 0;

  if (customerState.CurrentRule !== undefined)
  {
    startIndex = getRuleIndexByName(contactId, currentRuleSet, customerState.CurrentRule) + 1;
  }

  if (startIndex >= currentRuleSet.rules.length)
  {
    throw new Error(`Reached the end of a rulesets rules: ${currentRuleSet.name}`);
  }

  return startIndex;
}

/**
 * Find the index of a rule by name on a rule set
 * throwing an error if not found
 */
function getRuleIndexByName(contactId, ruleSet, ruleName)
{
  for (var i = 0; i < ruleSet.rules.length; i++)
  {
    if (ruleSet.rules[i].name === ruleName)
    {
      return i;
    }
  }

  throw new Error(`Failed locate rule by name: ${ruleName} on rule set: ${ruleSet.name} for contact id: ${contactId}`);
}

/**
 * Export rule properties into customer state
 */
function exportRuleIntoState(contactId, nextRule, contactFlows, customerState, stateToSave)
{
  var nextFlowName = 'RulesEngine' + nextRule.type;

  var nextFlow = contactFlows.find(flow => flow.Name === nextFlowName);

  if (nextFlow === undefined)
  {
    throw new Error('Could not find contact flow named: ' + nextFlowName);
  }

  updateState(customerState, stateToSave, 'CurrentRule_nextFlowArn', nextFlow.Arn);
  updateState(customerState, stateToSave, 'CurrentRule', nextRule.name);

  var paramKeys = Object.keys(nextRule.params);

  paramKeys.forEach(key => {
    updateState(customerState, stateToSave, 'CurrentRule_' + key, nextRule.params[key]);
  });
}

/**
 * Clears the customer state fields when we are reloading
 */
function clearCustomerState(customerState, stateToSave)
{
  // Clear the no accounts flag
  updateState(customerState, stateToSave, 'NoAccounts', undefined);

  // Clean out the AccountDisambiguate flag
  updateState(customerState, stateToSave, 'AccountDisambiguate', undefined);
}

/**
 * Try and load customer account data using the current phone number
 * updating the following customer state fields:
 * 
 *  Accounts - an array of loaded customer accounts
 *  Customer - if just one account is found it is set here
 *  NoAccount - set if no accounts could be identified
 *  AccountDisambiguate - the field name to use to disambiguate accounts (PhoneNumber, PostCode or DateOfBirth)
 * 
 * NOTE: Foxtel specific logic here
 */
async function loadCustomerAccounts(contactId, customerState, stateToSave)
{
  // Don't reload the customer
  if (customerState.Customer !== undefined)
  {
    console.log('[INFO] customer accounts are already loaded, skipping load');
    return;
  }

  // Don't try and load customer accounts if we previously failed
  if (customerState.NoAccounts === 'true')
  {
    console.log('[INFO] have already failed to locate customer accounts skipping');
    return;
  }

  // If we don't have a customer phone number, offer entering an alternative
  if (customerState.CustomerPhoneNumber === undefined || customerState.CustomerPhoneNumber === 'anonymous')
  {
    console.log('[INFO] no customer phone number set, setting AccountDisambiguate to PhoneNumber');
    updateState(customerState, stateToSave, 'AccountDisambiguate', 'PhoneNumber');
    return;
  }

  // If we previously asked the customer for their post code process it
  if (customerState.AccountDisambiguate === 'PostCode' && customerState.PostCode !== undefined)
  {
    // Find an account with this post code
    var account = customerState.Accounts.find(account => account.PostCode === customerState.PostCode);

    if (account !== undefined)
    {
      console.log('[INFO] found customer account for post code: ' + account.AccountNumber);
      clearCustomerState(customerState, stateToSave);
      updateState(customerState, stateToSave, 'Customer', account);
      return;
    }
    else
    {
      console.log('[INFO] failed to find customer account for post code: ' + customerState.PostCode);
      clearCustomerState(customerState, stateToSave);
      updateState(customerState, stateToSave, 'NoAccounts', 'true');
      return; 
    }
  }

  // If we previously asked the customer for their DOB process it
  if (customerState.AccountDisambiguate === 'DateOfBirth' && customerState.DateOfBirth !== undefined)
  {
    // Find an account with this post code
    var account = customerState.Accounts.find(account => account.DateOfBirthSimple === customerState.DateOfBirth);

    if (account !== undefined)
    {
      console.log('[INFO] found customer account for date of birth: ' + account.AccountNumber);
      clearCustomerState(customerState, stateToSave);
      updateState(customerState, stateToSave, 'Customer', account);
      return;
    }
    else
    {
      console.log('[INFO] failed to find customer account for date of birth: ' + customerState.DateOfBirth);
      clearCustomerState(customerState, stateToSave);
      updateState(customerState, stateToSave, 'NoAccounts', 'true');
      return; 
    }
  }  

  // Load the accounts for the customer if this is the first time or we just fetched a new phone number
  if (customerState.Accounts === undefined || customerState.AccountDisambiguate === 'PhoneNumber')
  {
    var accounts = await dynamoUtils.getCustomerAccounts(process.env.CUSTOMERS_TABLE, customerState.CustomerPhoneNumber);
    updateState(customerState, stateToSave, 'Accounts', accounts);
  }

  // If we just tried an alernate phone number and found no accounts we are done
  if (customerState.Accounts.length === 0 && customerState.AccountDisambiguate === 'PhoneNumber')
  {
    console.log(`[INFO] Found no customer accounts for manually entered phone: ${customerState.CustomerPhoneNumber} giving up on identification process`);
    updateState(customerState, stateToSave, 'NoAccounts', 'true');
    return;
  }

  // Clear out previous customer state
  clearCustomerState(customerState, stateToSave);

  // If we see just one account put it in the Customer attribute and we are done!
  if (customerState.Accounts.length === 1)
  {
    console.log('[INFO] found exactly one customer account moving account to Customer: ' + customerState.Accounts[0].AccountNumber);
    updateState(customerState, stateToSave, 'Customer', customerState.Accounts[0]);
    return;
  }
  // If we found no accounts, prompt for a different PhoneNumber
  else if (customerState.Accounts.length === 0)
  {
    console.log('[INFO] no customer accounts found, setting AccountDisambiguate to PhoneNumber');
    updateState(customerState, stateToSave, 'AccountDisambiguate', 'PhoneNumber');
    updateState(customerState, stateToSave, 'CustomerPhoneNumber', 'anonymous');
    return;
  }
  // If we see more than one account see if we can 
  // separate them by post code or phone number
  else
  {
    // Fetch the post code and date of birth from each account
    var postCodes = new Set();
    var datesOfBirth = new Set();

    // TODO this still needs to filter on rate class 1000 for disabled accounts
    customerState.Accounts.forEach(account => {
      postCodes.add(account.PostCode);
      datesOfBirth.add(account.DateOfBirth);
    });

    // If the number of unique post codes equals account length we can use post code
    if (postCodes.size === customerState.Accounts.length)
    {
      console.log('[INFO] using post code to disambiguate accounts');
      updateState(customerState, stateToSave, 'AccountDisambiguate', 'PostCode');
    }
    // If the number of unique DOBs equals account length we can use DOB
    else if (datesOfBirth.size === customerState.Accounts.length)
    {
      console.log('[INFO] using date of birth to disambiguate accounts');
      updateState(customerState, stateToSave, 'AccountDisambiguate', 'DateOfBirth');
    }
    // We found no ability to separate so no accounts is true
    // TODO prompt for account number?
    else
    {
      console.log('[INFO] found accounts but could not separate them by postcode or DOB for phone number: ' + customerState.CustomerPhoneNumber);
      updateState(customerState, stateToSave, 'NoAccounts', 'true');
    }
  }
}

/**
 * Writes to in memory state tracking changes for persisting.
 * Avoids deleting non-existent keys
 */
function updateState(customerState, stateToSave, key, value)
{
  if (value === undefined && customerState[key] === undefined)
  {
    return;
  }

  customerState[key] = value;
  stateToSave.add(key)
}
