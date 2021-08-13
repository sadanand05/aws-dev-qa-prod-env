
var handlebarsUtils = require('./HandlebarsUtils.js');

module.exports.version = '1.0.1';

/**
 * Maintain a list of rule parameters that are not templated
 * at the rule invocation phase, this includes things like confirmation
 * messages that are processed after fetching input and may refer to input
 * parameters
 */
var ignoredFields = getIgnoredTemplateFields();

function getIgnoredTemplateFields()
{
  var ignored = new Set();

  ignored.add('confirmationMessage');

  return ignored;
}

/**
 * Fetches the next rule from a start index
 */
module.exports.getNextActivatedRule = function(stage, service, 
    contactId, rules, startIndex, 
    customerState, queues, prompts,
    contactFlows, lambdaFunctions)
{
  var nextRule = undefined;

  for (var i = startIndex; i < rules.length; i++)
  {
    // Test the rule, these are always cloned above so changes are ok
    testRule(customerState, rules[i]);

    // Check for activation
    if (rules[i].activated)
    {
      nextRule = rules[i];
      break;
    }
  }

  if (nextRule === undefined)
  {
    throw new Error('Failed to find the next rule');
  }

  template(nextRule, customerState, ignoredFields);
  lookup(stage, service, nextRule, queues, prompts, contactFlows, lambdaFunctions);

  return nextRule;
}

/**
 * Given a rule set, find any rule sets that point to this rule set
 * returning map of rule set names against an array of matching rules
 */
module.exports.getReferringRuleSets = function(ruleSet, ruleSets)
{
  var referring = {};

  var testName = ruleSet.name;

  ruleSets.forEach(rs => {

    var matchingRules = [];
    
    rs.rules.forEach(rule => {

      if (rule.type === 'DTMFMenu')
      {
        var added = false;

        if (rule.params.errorRuleSetName === testName)
        {
          matchingRules.push(rule);
          added = true;
        }

        var keys = Object.keys(rule.params);

        keys.forEach(key => {
          if (key.startsWith('dtmf') && rule.params[key] === testName)
          {
            if (!added)
            {
              matchingRules.push(rule);
              added = true;
            }
          }
        });
      }

      if (rule.type === 'RuleSet')
      {
        if (rule.params.ruleSetName === testName)
        {
          matchingRules.push(rule);
        }
      }

      if (rule.type === 'RuleSetBail')
      {
        if (rule.params.ruleSetName === testName)
        {
          matchingRules.push(rule);
        }
      }

      if (rule.type === 'RuleSetPrompt')
      {
        if (rule.params.ruleSetName === testName ||
            rule.params.errorRuleSetName === testName)
        {
          matchingRules.push(rule);
        }
      }

      if (rule.type === 'DTMFInput')
      {
        if (rule.params.errorRuleSetName === testName)
        {
          matchingRules.push(rule);
        }
      }

      if (rule.type === 'DTMFSelector')
      {
        if (rule.params.errorRuleSetName === testName)
        {
          matchingRules.push(rule);
        }
      }
    });

    // TODO if a flow exists as a DTMF menu and as 
    // an error rule set this may fail, distinct rules?
    if (matchingRules.length > 0)
    {
      referring[rs.name] = matchingRules;
    }
  });

  return referring;
}

/**
 * Given a rule set, load an array of rules that point to this rule set
 * thi sis used during renaming of rules
 */
module.exports.getReferringRules = function(ruleSet, ruleSets)
{
  var referringRules = [];

  var testName = ruleSet.name;

  ruleSets.forEach(rs => {
    
    rs.rules.forEach(rule => {

      if (rule.type === 'DTMFMenu')
      {
        
        var added = false;

        if (rule.params.errorRuleSetName === testName)
        {
          referringRules.push(rule);
          added = true;
        } 

        var keys = Object.keys(rule.params);

        keys.forEach(key => {
          if (key.startsWith('dtmf') && rule.params[key] === testName)
          {
            if (!added)
            {
              referringRules.push(rule);
              added = true;
            }
          }
        });
      }

      if (rule.type === 'RuleSet')
      {
        if (rule.params.ruleSetName === testName)
        {
          referringRules.push(rule);
        }
      }

      if (rule.type === 'RuleSetBail')
      {
        if (rule.params.ruleSetName === testName)
        {
          referringRules.push(rule);
        }
      }

      if (rule.type === 'RuleSetPrompt')
      {
        if (rule.params.ruleSetName === testName ||
            rule.params.errorRuleSetName === testName)
        {
          referringRules.push(rule);
        }
      }

      if (rule.type === 'DTMFInput')
      {
        if (rule.params.errorRuleSetName === testName)
        {
          referringRules.push(rule);
        }
      }

      if (rule.type === 'DTMFSelector')
      {
        if (rule.params.errorRuleSetName === testName)
        {
          referringRules.push(rule);
        }
      }
    });
  });

  return referringRules;
}

/**
 * Look up queue and contact flow ids and Arns
 */
function lookup(stage, service, rule, queues, prompts, contactFlows, lambdaFunctions)
{
  if (rule.params.queueName !== undefined)
  {
    var queue = queues.find((q) => q.Name === rule.params.queueName);

    if (queue !== undefined)
    {
      rule.params.queueId = queue.Id;
      rule.params.queueArn = queue.Arn;
    }
    else
    {
      throw new Error('Could not find queue: ' + rule.params.queueName);
    }
  }

  if (rule.params.flowName !== undefined)
  {
    var contactFlow = contactFlows.find((flow) => flow.Name === rule.params.flowName);

    if (contactFlow !== undefined)
    {
      rule.params.flowId = contactFlow.Id;
      rule.params.flowArn = contactFlow.Arn;
    }
    else
    {
      throw new Error('Could not find contact flow: ' + rule.params.flowName);
    }
  }

  if (rule.params.functionName !== undefined)
  {
    var functionName = `${stage}-${service}-${rule.params.functionName}`;

    var lambdaFunction = lambdaFunctions.find(lambdaFunction => lambdaFunction.FunctionName === functionName);

    if (lambdaFunction !== undefined)
    {
      rule.params.functionArn = lambdaFunction.FunctionArn;
    }
    else
    {
      throw new Error('Could not find lambda function: ' + functionName);
    }
  }

  // Look at each message and determine a message type override is required
  var keys = Object.keys(rule.params);

  keys.forEach(key => 
  {
    if (key.toLowerCase().includes('message'))
    {
      var value = rule.params[key];

      if (value.includes('<speak>'))
      {
        rule.params[key + 'Type'] = 'ssml';
      }
      else if (value.startsWith('prompt:'))
      {
        var promptName = value.substring(7);
        var prompt = prompts.find((p) => p.Name === promptName);

        if (prompt !== undefined)
        {
          rule.params[key + 'Type'] = 'prompt';
          rule.params[key + 'PromptArn'] = prompt.Arn;
        }
        else
        {
          console.log('[ERROR] failed lookup prompt: ' + value);
        }
      }
    }
  });
}

/**
 * Processes template based parameters
 */
function template(rule, customerState, ignoredFields = new Set())
{
  try
  {
    var keys = Object.keys(rule.params);

    keys.forEach(key => {

      if (!ignoredFields.has(key))
      {
        var rawValue = rule.params[key];

        if (handlebarsUtils.isTemplate(rawValue))
        {
          var templatedValue = handlebarsUtils.template(rawValue, customerState);
          rule.params[key] = templatedValue;
        }
      }
    });
  }
  catch (error)
  {
    console.log('[ERROR] failed to template a rule', error);
    throw error;
  }
}

/**
 * Tests a rule for activation
 */
function testRule(customerState, rule)
{
  rule.activated = false;
  rule.weight = 0;

  /**
   * Compute the weight from each sub rule
   */
  rule.weights.forEach(weight => 
  {
    weight.activated = false;

    if (weight.value !== undefined && weight.value !== null)
    {
      weight.value = weight.value.trim();
    }

    if (weight.field !== undefined && weight.field !== null)
    {
      weight.field = weight.field.trim();
    }

    // Fetch the raw value which is object path aware
    var rawValue = getRawValue(weight, customerState);

    // Resolve weight values that are templates
    resolveWeightValue(weight, customerState);

    if (evaluateWeight(weight, rawValue))
    {
      rule.weight += +weight.weight;
      weight.activated = true;
    }
  });

  if (+rule.weight >= +rule.activation)
  {
    rule.activated = true;
  }

  rule.weight = '' + rule.weight;
}

/**
 * When weight values are templates, try and resolve them
 */
function resolveWeightValue(weight, customerState)
{
  try
  {
    if (handlebarsUtils.isTemplate(weight.value))
    {
      weight.value = handlebarsUtils.template(weight.value, customerState);
    }
  }
  catch (error)
  {
    console.log('[ERROR] failed to resolve value for weight: ' + JSON.stringify(weight, null, 2), error);
  }
}

/**
 * Fetches the raw value for a weight handling splitting
 * up based on . path components and processing templates separately
 */
function getRawValue(weight, customerState)
{
  try
  {
    var rawFieldName = weight.field;

    var fields = rawFieldName.split(/\./);

    var rawValue = customerState;

    fields.forEach(field => 
    {
      // Allow length as selection for raw values for arrays
      if (field === 'length' && Array.isArray(rawValue))
      {
        rawValue = rawValue.length;
      }
      else 
      {
        rawValue = rawValue[field];
      }

      if (rawValue === undefined)
      {
        return undefined;
      }
    });

    return rawValue;
  }
  catch (error)
  {
    console.log('[ERROR] failed to fetch raw template value for weight: ' + JSON.stringify(weight, null, 2), error);
    return undefined;
  }
}

/**
 * Evaluates a weight with the raw value
 */
function evaluateWeight(weight, rawValue)
{
  switch(weight.operation)
  {
    case 'equals':
    {
      return weightEquals(weight, rawValue);
    }
    case 'notequals':
    {
      return !weightEquals(weight, rawValue);
    }
    case 'isempty':
    {
      return weightIsEmpty(weight, rawValue);
    }
    case 'isnotempty':
    {
      return !weightIsEmpty(weight, rawValue);
    }
    case 'isnull':
    {
      return weightIsNull(weight, rawValue);
    }
    case 'isnotnull':
    {
      return weightIsNotNull(weight, rawValue);
    }
    case 'ismobile':
    {
      return weightIsMobile(weight, rawValue);
    }
    case 'isnotmobile':
    {
      return weightIsNotMobile(weight, rawValue);
    }
    case 'lessthan':
    {
      return weightLessThan(weight, rawValue);
    }
    case 'greaterthan':
    {
      return weightGreaterThan(weight, rawValue);
    }
    default:
    {
      var errorMessage = `Unhandled weight operation: ${weight.operation}`;
      console.log('[ERROR] ' + errorMessage);
      throw new Error(errorMessage);
    }
  }
}

function weightEquals(weight, rawValue)
{
  if (weight.value === rawValue)
  {
    return +weight.weight;
  }

  return 0;
}

function weightIsNull(weight, rawValue)
{
  if (rawValue === undefined || rawValue === null)
  {
    return +weight.weight;
  }

  return 0;
}

function weightIsNotNull(weight, rawValue)
{
  if (rawValue === undefined || rawValue === null)
  {
    return 0;
  }

  return +weight.weight;
}

function weightIsMobile(weight, rawValue)
{
  if (rawValue === undefined || rawValue === null)
  {
    return 0;
  }

  if (rawValue.startsWith('+614'))
  {
    return +weight.weight;
  }

  return 0;
}

/**
 * Returns the weight if this is undefined, null, an empty array or string
 */
function weightIsEmpty(weight, rawValue)
{
  if (rawValue === undefined || rawValue === null)
  {
    return +weight.weight;
  }

  if (Array.isArray(rawValue) && rawValue.length === 0)
  {
    return +weight.weight;
  }

  if (rawValue === '')
  {
    return +weight.weight;
  }

  return 0;
}

function weightIsNotMobile(weight, rawValue)
{
  if (rawValue === undefined || rawValue === null)
  {
    return +weight.weight;
  }

  if (!rawValue.startsWith('+614'))
  {
    return +weight.weight;
  }

  return 0;
}

function weightLessThan(weight, rawValue)
{
  if (rawValue === undefined || rawValue === null)
  {
    return 0;
  }

  if (isNumber(rawValue) && isNumber(weight.value))
  {
    if (+rawValue < +weight.value)
    {
      return +weight.weight;
    }
  }
  else
  {
    if (rawValue < weight.value)
    {
      return weight.weight;
    }
  }

  return 0;
}

function weightGreaterThan(weight, rawValue)
{
  if (rawValue === undefined || rawValue === null)
  {
    return 0;
  }

  if (isNumber(rawValue) && isNumber(weight.value))
  {
    if (+rawValue > +weight.value)
    {
      return +weight.weight;
    }
  }
  else
  {
    if (rawValue > weight.value)
    {
      return weight.weight;
    }
  }

  return 0;
}

function isNumber(value)
{
  if (value === undefined || 
      value === null || 
      value === '' || 
      value === 'true' || 
      value === 'false' || 
      isNaN(value))
  {
    return false;
  }
  else
  {
    return true;
  }
}

