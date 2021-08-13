var AWS = require('aws-sdk');
var dynamo = new AWS.DynamoDB();
var moment = require('moment-timezone');

const { v4: uuidv4 } = require('uuid');

/**
 * Loads all users from DynamoDB
 */
module.exports.getUsers = async (usersTable) =>
{
  try
  {
    var statement = `SELECT * FROM "${usersTable}"`;

    var request = {
      Statement: statement
    };

    var results = await dynamo.executeStatement(request).promise();

    var users = [];

    results.Items.forEach(item => 
    {
      users.push(makeUser(item));
    });

    return users;
  }
  catch (error)
  {
    console.log('[ERROR] failed to load users from Dynamo', error);
    throw error;
  }
};

/**
 * Loads all rule sets from DynamoDB
 */
module.exports.getRuleSets = async (ruleSetsTable) =>
{
  try
  {
    var statement = `SELECT * FROM "${ruleSetsTable}"`;

    var request = {
      Statement: statement
    };

    var results = await dynamo.executeStatement(request).promise();

    var ruleSets = [];

    results.Items.forEach(item => 
    {
      ruleSets.push(makeRuleSet(item));
    });

    ruleSets.sort(function (a, b) {
      return a.name.localeCompare(b.name);
    });

    return ruleSets;
  }
  catch (error)
  {
    console.log('[ERROR] failed to load rule sets from Dynamo', error);
    throw error;
  }
};

/**
 * Loads all rule sets from DynamoDB and their associated rules
 */
module.exports.getRuleSetsAndRules = async (ruleSetsTable, rulesTable) =>
{
  try
  {
    var statement = `SELECT * FROM "${ruleSetsTable}"`;

    var request = {
      Statement: statement
    };

    var ruleSets = [];

    var results = await dynamo.executeStatement(request).promise();

    for (var i = 0; i < results.Items.length; i++)
    {
      var ruleSet = makeRuleSet(results.Items[i]);
      ruleSet.rules = await module.exports.getRules(rulesTable, ruleSet.ruleSetId);  
      ruleSets.push(ruleSet);
    }

    ruleSets.sort(function (a, b) {
      return a.name.localeCompare(b.name);
    });

    return ruleSets;
  }
  catch (error)
  {
    console.log('[ERROR] failed to load rule sets and rules from Dynamo', error);
    throw error;
  }
};

/**
 * Loads all tests from DynamoDB
 */
module.exports.getTests = async (testsTable) =>
{
  try
  {
    var statement = `SELECT * FROM "${testsTable}"`;

    var request = {
      Statement: statement,
      // Parameters: [
      // ]
    };

    var results = await dynamo.executeStatement(request).promise();

    var tests = [];

    if (results.Items)
    {
      results.Items.forEach(item => {
        var test = {
          testId: item.TestId.S,
          name: item.Name.S,
          description: item.Description.S,
          payload: item.Payload.S
        };

        tests.push(test);
      });
    }

    return tests;
  }
  catch (error)
  {
    console.log('[ERROR] failed to load rules from Dynamo', error);
    throw error;
  }
};

/**
 * Fetches a rule set and contained rules from DynamoDB by rule phone number
 */
module.exports.getRuleSetByInboundNumber = async (ruleSetsTable, rulesTable, phoneNumber) =>
{
  try
  {
    var statement = `SELECT * FROM "${ruleSetsTable}" WHERE contains("InboundNumbers", ?)`;

    var request = {
      Statement: statement,
      Parameters: [
        {
          S: phoneNumber
        }
      ]
    };

    var results = await dynamo.executeStatement(request).promise();

    if (results.Items && results.Items.length === 1)
    {
      var item = results.Items[0];
      var ruleSet = makeRuleSet(item);
      ruleSet.rules = await module.exports.getRules(rulesTable, ruleSet.ruleSetId);
      return ruleSet;
    }
    else
    {
      throw new Error('Failed to find rule set by inbound phone number: ' + phoneNumber);
    }
  }
  catch (error)
  {
    console.log('[ERROR] failed to load rule set from Dynamo by inbound phone number', error);
    throw error;
  }
};

/**
 * Fetches a rule set and contained rules from DynamoDB by rule set name
 */
module.exports.getRuleSetByName = async (ruleSetsTable, rulesTable, ruleSetName) =>
{
  try
  {
    var statement = `SELECT * FROM "${ruleSetsTable}" WHERE "Name" = ?`;

    var request = {
      Statement: statement,
      Parameters: [
        {
          S: ruleSetName
        }
      ]
    };

    var results = await dynamo.executeStatement(request).promise();

    if (results.Items && results.Items.length === 1)
    {
      var item = results.Items[0];
      var ruleSet = makeRuleSet(item);
      ruleSet.rules = await module.exports.getRules(rulesTable, ruleSet.ruleSetId);
      return ruleSet;
    }
    else
    {
      throw new Error('Failed to find rule set by name: ' + ruleSetName);
    }
  }
  catch (error)
  {
    console.log('[ERROR] failed to load rule set from Dynamo by name', error);
    throw error;
  }
};

/**
 * Fetches a rule set and contained rules from DynamoDB by ruleSetId
 */
module.exports.getRuleSet = async (ruleSetsTable, rulesTable, ruleSetId) =>
{
  try
  {
    var statement = `SELECT * FROM "${ruleSetsTable}" WHERE "RuleSetId" = ?`;

    var request = {
      Statement: statement,
      Parameters: [
        {
          S: ruleSetId
        }
      ]
    };

    var results = await dynamo.executeStatement(request).promise();

    if (results.Items && results.Items.length === 1)
    {
      var item = results.Items[0];
      var ruleSet = makeRuleSet(item);
      ruleSet.rules = await module.exports.getRules(rulesTable, ruleSetId);
      return ruleSet;
    }
    else
    {
      throw new Error('Failed to find rule set for id: ' + ruleSetId);
    }
  }
  catch (error)
  {
    console.log('[ERROR] failed to load rule set from Dynamo', error);
    throw error;
  }
};

/**
 * Fetches the rules for a rule set sorted by descending priority
 */
module.exports.getRules = async (rulesTable, ruleSetId) =>
{
  try
  {
    var statement = `SELECT * FROM "${rulesTable}" WHERE "RuleSetId" = ?`;

    var request = {
      Statement: statement,
      Parameters: [
        {
          S: ruleSetId
        }
      ]
    };

    var results = await dynamo.executeStatement(request).promise();

    var rules = [];

    results.Items.forEach(item => 
    {
      rules.push(makeRule(item));
    });

    rules.sort(function(a, b) {
      return b.priority - a.priority;
    });

    return rules;
  }
  catch (error)
  {
    console.log('[ERROR] failed to load rules from Dynamo for rule set: ' + ruleSetId, error);
    throw error;
  }
};

/**
 * Fetches a rule from DynamoDB by rule set id and rule id
 */
module.exports.getRule = async (rulesTable, ruleSetId, ruleId) =>
{
  try
  {
    var statement = `SELECT * FROM "${rulesTable}" WHERE "RuleSetId" = ? AND "RuleId" = ?`;

    var request = {
      Statement: statement,
      Parameters: [
        {
          S: ruleSetId
        },
        {
          S: ruleId
        }
      ]
    };

    var results = await dynamo.executeStatement(request).promise();

    if (results.Items && results.Items.length === 1)
    {
      var item = results.Items[0];
      return makeRule(item);
    }
    else
    {
      throw new Error(`Failed to find rule for rule set id: ${ruleSetId} and rule id: ${ruleId}`);
    }
  }
  catch (error)
  {
    console.log('[ERROR] failed to load rule from Dynamo', error);
    throw error;
  }
};

/**
 * Persists customer state for updated state attributes, computes a batch up updates
 * and deletes and fires them at Dynamo
 */
module.exports.persistCustomerState = async function (stateTable, contactId, customerState, stateToSave)
{
  try
  {
    var expiry = Math.floor(new Date().getTime() / 1000) + 24 * 60 * 60;

    var batchItems = [];

    for (var i = 0; i < stateToSave.length; i++)
    {
      var key = stateToSave[i];
      var value = customerState[key];

      if (value === undefined || value === null || value === '')
      {
        batchItems.push({
          DeleteRequest: {
            Key: {
              ContactId: {
                S: contactId
              }, 
              What: {
                S: key
              }
            }
          }
        });
      }
      else
      {
        var actualValue = value;

        // Handle object serialisation by converting them to JSON
        if (typeof actualValue === 'object')
        {
          actualValue = JSON.stringify(actualValue);
        }

        batchItems.push({
          PutRequest: {
            Item: {
              ContactId: {
                S: contactId
              }, 
              What: {
                S: key
              },
              Value: {
                S: actualValue
              },
              Expiry: {
                N: '' + expiry
              }
            }
          }
        });
      }
    }

    // console.log('[INFO] persisting state: ' + JSON.stringify(batchItems, null, 2));

    await batchUpdateLarge(stateTable, batchItems);
  }
  catch (error)
  {
    console.log(`[ERROR] failed to perist customer state for contact id: ${contactId}`, error);
    throw error;
  }
}

/**
 * Batch update with a small list of items, making sure all are processed
 */
async function batchUpdateSmall(tableName, batchItems)
{
  if (batchItems.length === 0)
  {
    return;
  }

  try
  {
    var request = 
    {
      RequestItems: 
      {
      }
    };

    request.RequestItems[tableName] = batchItems;

    var result = await dynamo.batchWriteItem(request).promise();

    while (result.UnprocessedItems[tableName] !== undefined)
    {
      request.RequestItems[tableName] = result.UnprocessedItems[tableName];
      result = await dynamo.batchWriteItem(request).promise();
    }
  }
  catch (error)
  {
    console.log('[ERROR] failed to batch update table with a small request', error);
    throw error;
  }
}

/**
 * Batch updates a table with a possibly large array of batch items
 */
async function batchUpdateLarge(tableName, batchItems)
{
  try
  {
    var batch = [];

    while (batchItems.length > 0)
    {
      batch.push(batchItems.shift());

      if (batch.length === 25)
      {
        await batchUpdateSmall(tableName, batch);
        batch = [];
      }
    }

    if (batch.length > 0)
    {
      await batchUpdateSmall(tableName, batch);
    }
  }
  catch (error)
  {
    console.log('[ERROR] failed to batch update table', error);
    throw error;
  }
}

/**
 * Fetches the state for the current contact id as a map
 */
module.exports.getParsedCustomerState = async function(stateTable, contactId)
{
  var stateItems = await module.exports.getStateItems(stateTable, contactId);

  var customerState = {};

  stateItems.forEach(stateItem => {
    customerState[stateItem.what] = stateItem.value;
  });
  
  var stateKeys = Object.keys(customerState);

  stateKeys.forEach(key => {
    try
    {
      var value = customerState[key].trim();

      if ((value.startsWith('{') && value.endsWith('}')) || (value.startsWith('[') && value.endsWith(']')))
      {
        customerState[key] = JSON.parse(value);
      }
    }
    catch (error)
    {
      console.log(`[ERROR] skipping parsing key: ${key} due to JSON parse failure of value: ${value}`, error);
    }
  });

  return customerState;
}

/**
 * Fetches the state for a customer using their contact id
 */
module.exports.getStateItems = async (stateTable, contactId) =>
{
  try
  {
    var statement = `SELECT * FROM "${stateTable}" WHERE "ContactId" = ?`;

    var request = {
      Statement: statement,
      // ConsistentRead: true, enable if required
      Parameters: [
        {
          S: contactId
        }
      ]
    };

    var results = await dynamo.executeStatement(request).promise();

    var stateItems = [];

    results.Items.forEach(item =>
    {
      stateItems.push(makeStateItem(item));
    });

    return stateItems;
  }
  catch (error)
  {
    console.log('[ERROR] failed to load state items for contact: ' + contactId, error);
    throw error;
  }
};

/**
 * Fetches customer accounts by phone number, querying both indices
 * NOTE: Foxtel specific logic
 */
module.exports.getCustomerAccounts = async (customersTable, phoneNumber) =>
{
  try
  {
    var normalisedPhoneNumber = phoneNumber;

    if (normalisedPhoneNumber.startsWith('+61'))
    {
      normalisedPhoneNumber = '0' + normalisedPhoneNumber.substring(3);
    }

    var statement1 = `SELECT * FROM "${customersTable}"."PhoneNumber1Index" WHERE "PhoneNumber1" = ?`;
    var statement2 = `SELECT * FROM "${customersTable}"."PhoneNumber2Index" WHERE "PhoneNumber2" = ?`;

    var request1 = {
      Statement: statement1,
      Parameters: [
        {
          S: normalisedPhoneNumber
        }
      ]
    };

    var request2 = {
      Statement: statement2,
      Parameters: [
        {
          S: normalisedPhoneNumber
        }
      ]
    };

    var results1 = await dynamo.executeStatement(request1).promise();
    var results2 = await dynamo.executeStatement(request2).promise();

    var accountNumbers = new Set();
    var accounts = [];

    results1.Items.forEach(item =>
    {
      var accountItem = makeAccountItem(item);

      if (!accountNumbers.has(accountItem.AccountNumber))
      {
        accounts.push(accountItem);
        accountNumbers.add(accountItem.AccountNumber);
      }
    });

    results2.Items.forEach(item =>
    {
      var accountItem = makeAccountItem(item);

      if (!accountNumbers.has(accountItem.AccountNumber))
      {
        accounts.push(accountItem);
        accountNumbers.add(accountItem.AccountNumber);
      }
    });

    return accounts;
  }
  catch (error)
  {
    console.log('[ERROR] failed to load account for phone number: ' + phoneNumber, error);
    throw error;
  }
};

/**
 * Inserts a weight into a rule
 */
module.exports.insertWeight = async (rulesTable, ruleSetId, ruleId, weight) =>
{
  try
  {
    var rule = await module.exports.getRule(rulesTable, ruleSetId, ruleId);
    rule.weights.push(weight);

    var newWeights = JSON.stringify(rule.weights);

    var statement = `UPDATE "${rulesTable}"` +
          ` SET "Weights" = ?` +
          ` WHERE "RuleSetId" = ?` +
          ` AND "RuleId" = ?`;

    var request = {
      Statement: statement,
      Parameters: [
        {
          S: newWeights
        },
        {
          S: ruleSetId
        },
        {
          S: ruleId
        }
      ]
    };

    await dynamo.executeStatement(request).promise();
  }
  catch (error)
  {
    console.log('[ERROR] failed to insert weight into rule in Dynamo', error);
    throw error;
  }
};

/**
 * Deletes a weight from a rule
 */
module.exports.deleteWeight = async (rulesTable, ruleSetId, ruleId, weightId) =>
{
  try
  {
    var rule = await module.exports.getRule(rulesTable, ruleSetId, ruleId);

    var weights = [];

    rule.weights.forEach(weight => {
      if (weight.weightId !== weightId)
      {
        weights.push(weight);
      }
    });

    var newWeights = JSON.stringify(weights);

    var statement = `UPDATE "${rulesTable}"` +
          ` SET "Weights" = ?` +
          ` WHERE "RuleSetId" = ?` +
          ` AND "RuleId" = ?`;

    var request = {
      Statement: statement,
      Parameters: [
        {
          S: newWeights
        },
        {
          S: ruleSetId
        },
        {
          S: ruleId
        }
      ]
    };

    await dynamo.executeStatement(request).promise();
  }
  catch (error)
  {
    console.log('[ERROR] failed to delete weight from rule in Dynamo', error);
    throw error;
  }
};

/**
 * Deletes a state key for a contact
 */
module.exports.deleteState = async (stateTable, contactId, what) =>
{
  try
  {
    var statement = `DELETE FROM "${stateTable}" WHERE "ContactId" = ? and "What" = ?`;

    var request = {
      Statement: statement,
      Parameters: [
        {
          S: contactId
        },
        {
          S: what
        }
      ]
    };

    await dynamo.executeStatement(request).promise();
  }
  catch (error)
  {
    console.log(`[ERROR] failed to remove state key: $what from contact id: $contactId from Dynamo `, error);
    throw error;
  }
};

/**
 * Fetches a test from DynamoDB by botId
 */
module.exports.getTest = async (testsTable, testId) =>
{
  try
  {
    var statement = `SELECT * FROM "${testsTable}" WHERE "TestId" = ?`;

    var request = {
      Statement: statement,
      Parameters: [
        {
          S: testId
        }
      ]
    };

    var results = await dynamo.executeStatement(request).promise();

    if (results.Items && results.Items.length === 1)
    {
      var item = results.Items[0];

      return makeTest(item);
    }
    else
    {
      throw new Error('Failed to find test for id: ' + testId);
    }
  }
  catch (error)
  {
    console.log('[ERROR] failed to load test from Dynamo', error);
    throw error;
  }
};

/**
 * Clones a rule set and it's rules, abandoning inbound numbers
 */
module.exports.cloneRuleSet = async function (ruleSetsTable, rulesTable, newRuleSetName, ruleSet)
{
  try
  {
    var newRuleSetId = await module.exports.insertRuleSet(ruleSetsTable, newRuleSetName, 
        ruleSet.enabled, ruleSet.description, undefined);

    for (var i = 0; i < ruleSet.rules.length; i++)
    {
      var rule = ruleSet.rules[i];

      await module.exports.insertRule(rulesTable, newRuleSetId, rule.name, 
        rule.enabled, rule.description, rule.priority, rule.activation, 
        rule.type, rule.params, rule.weights);
    }

    console.log('[INFO] finished cloning rule set');

    return newRuleSetId;
  }
  catch (error)
  {
    console.log('[ERROR] failed to clone rule set', error);
    throw error;
  }
}

/**
 * Renames a rule, assumes uniqueness checking is already done
 */
module.exports.updateRuleName = async function (rulesTable, ruleSetId, ruleId, ruleName)
{
  try
  {
    var statement = `UPDATE "${rulesTable}"` +
          ` SET "Name" = ?` +
          ` WHERE "RuleSetId" = ? AND` +
          ` "RuleId" = ?`;

    var request = {
      Statement: statement,
      Parameters: [
        {
          S: ruleName,
        },
        {
          S: ruleSetId
        },
        {
          S: ruleId
        }
      ]
    };

    await dynamo.executeStatement(request).promise();
  }
  catch (error)
  {
    console.log('[ERROR] failed to update rule set name', error);
    throw error;
  }
}

/**
 * Renames a rule set and all of the rules that refer to it
 */
module.exports.renameRuleSet = async function (ruleSetsTable, rulesTable, ruleSetName, ruleSet, referencingRules)
{
  try
  {
    for (var i = 0; i < referencingRules.length; i++)
    {
      var rule = referencingRules[i];

      if (rule.type === 'DTMFMenu')
      {
        var keys = Object.keys(rule.params);

        keys.forEach(key => {
          if (key.startsWith('dtmf') && rule.params[key] === ruleSet.name)
          {
            rule.params[key] = ruleSetName;
          }
        });

        if (rule.params.errorRuleSetName === ruleSet.name)
        {
          rule.params.errorRuleSetName = ruleSetName;
        } 
      }

      if (rule.type === 'RuleSet')
      {
        if (rule.params.ruleSetName === ruleSet.name)
        {
          rule.params.ruleSetName = ruleSetName;
        }
      }

      if (rule.type === 'RuleSetBail')
      {
        if (rule.params.ruleSetName === ruleSet.name)
        {
          rule.params.ruleSetName = ruleSetName;
        }
      }

      if (rule.type === 'RuleSetPrompt')
      {
        if (rule.params.ruleSetName === ruleSet.name)
        {
          rule.params.ruleSetName = ruleSetName;
        } 
        
        if (rule.params.errorRuleSetName === ruleSet.name)
        {
          rule.params.errorRuleSetName = ruleSetName;
        }
      }

      if (rule.type === 'DTMFInput')
      {
        if (rule.params.errorRuleSetName === ruleSet.name)
        {
          rule.params.errorRuleSetName = ruleSetName;
        }
      }

      await updateRuleParams(rulesTable, rule);
    }

    await updateRuleSetName(ruleSetsTable, ruleSet.ruleSetId, ruleSetName);

    console.log('[INFO] finished renaming rule set')
  }
  catch (error)
  {
    console.log('[ERROR] failed to rename rule set', error);
    throw error;
  }
}

/**
 * Updates a rule set name, this assumes that all references to this rule set
 * have been renamed via renameRuleSet
 */
async function updateRuleSetName(ruleSetsTable, ruleSetId, newName)
{
  try
  {
    var statement = `UPDATE "${ruleSetsTable}"` +
          ` SET "Name" = ?` +
          ` WHERE "RuleSetId" = ?`;

    var request = {
      Statement: statement,
      Parameters: [
        {
          S: newName
        },
        {
          S: ruleSetId
        }
      ]
    };

    await dynamo.executeStatement(request).promise();
  }
  catch (error)
  {
    console.log('[ERROR] failed to update rule set name', error);
    throw error;
  }
}

/**
 * Updates the params for this rule in DynamoDB used during rule set renaming
 */
async function updateRuleParams(rulesTable, rule)
{
  try
  {
    var statement = `UPDATE "${rulesTable}"` +
          ` SET "Params" = ?` +
          ` WHERE "RuleSetId" = ?` +
          ` AND "RuleId" = ?`;

    var request = {
      Statement: statement,
      Parameters: [
        {
          S: JSON.stringify(rule.params)
        },
        {
          S: rule.ruleSetId
        },
        {
          S: rule.ruleId
        }
      ]
    };

    await dynamo.executeStatement(request).promise();
  }
  catch (error)
  {
    console.log('[ERROR] failed to update rule params', error);
    throw error;
  }
}

/**
 * Deletes a ruleset from DynamoDB
 */
module.exports.deleteRuleSet = async (ruleSetsTable, ruleSetId) =>
{
  try
  {
    var statement = `DELETE FROM "${ruleSetsTable}" WHERE "RuleSetId" = ?`;

    var request = {
      Statement: statement,
      Parameters: [
        {
          S: ruleSetId
        }
      ]
    };

    await dynamo.executeStatement(request).promise();
  }
  catch (error)
  {
    console.log('[ERROR] failed to delete rule set from Dynamo', error);
    throw error;
  }
};

/**
 * Deletes a rule from DynamoDB
 */
module.exports.deleteRule = async (rulesTable, ruleSetId, ruleId) =>
{
  try
  {
    var statement = `DELETE FROM "${rulesTable}" WHERE "RuleSetId" = ? AND "RuleId" = ?`;

    var request = {
      Statement: statement,
      Parameters: [
        {
          S: ruleSetId
        },
        {
          S: ruleId
        }
      ]
    };

    await dynamo.executeStatement(request).promise();
  }
  catch (error)
  {
    console.log('[ERROR] failed to delete rule from Dynamo', error);
    throw error;
  }
};

/**
 * Deletes a user from DynamoDB
 */
module.exports.deleteUser = async (usersTable, userId) =>
{
  try
  {
    var statement = `DELETE FROM "${usersTable}" WHERE "UserId" = ?`;

    var request = {
      Statement: statement,
      Parameters: [
        {
          S: userId
        }
      ]
    };

    await dynamo.executeStatement(request).promise();
  }
  catch (error)
  {
    console.log('[ERROR] failed to delete user from Dynamo', error);
    throw error;
  }
};

/**
 * Deletes test from DynamoDB by testId
 */
module.exports.deleteTest = async (testsTable, testId) =>
{
  try
  {
    var statement = `DELETE FROM "${testsTable}" WHERE "TestId" = ?`;

    var request = {
      Statement: statement,
      Parameters: [
        {
          S: testId
        }
      ]
    };

    await dynamo.executeStatement(request).promise();
  }
  catch (error)
  {
    console.log('[ERROR] failed to delete test from Dynamo', error);
    throw error;
  }
};

/**
 * Updates a config item
 */
module.exports.updateConfigItem = async (configTable, configKey, configData) =>
{
try
  {
    var request = {
      TableName: configTable,
      Item: {
        ConfigKey: {
          S: configKey
        },
        ConfigData: {
          S: configData
        },
        LastUpdate: {
          S: moment().utc().format()
        }
      }
    };

    await dynamo.putItem(request).promise();
  }
  catch (error)
  {
    console.log('[ERROR] failed to update config item in Dynamo', error);
    throw error;
  }

};

/**
 * Load a config item by key
 */
module.exports.getConfigItem = async (configTable, configKey) =>
{
  try
  {
    var statement = `SELECT * FROM "${configTable}"` +
      ` WHERE "ConfigKey" = ?`;

    var request = {
      Statement: statement,
      Parameters: [
        {
          S: configKey
        }
      ]
    };

    var results = await dynamo.executeStatement(request).promise();

    if (results.Items && results.Items.length === 1)
    {
      return makeConfigItem(results.Items[0]);
    }

    return undefined;
  }
  catch (error)
  {
    console.log('[ERROR] failed to load config item for key: ' + configKey, error);
    throw error;
  }
};

/**
 * Inserts a new main event with auto removal 24 hours after expiry
 */
module.exports.insertMainEvent = async (mainEventsTable, event) =>
{
  try
  {
    // Expire events 24 hours after expiry timestamp
    var expiry = Math.floor(moment(event.endTimestamp).valueOf() / 1000) + 24 * 60 * 60;

    var request = {
      TableName: mainEventsTable,
      Item: {
        EventId: {
          S: event.eventId
        },
        Active: {
          S: '' + event.active
        },
        Name: {
          S: event.name
        },
        SpeechName: {
          S: event.speechName
        },
        FastPathMinutes: {
          S: '' + event.fastPathMinutes
        },
        Description: {
          S: event.description
        },
        Price: {
          S: event.price
        },
        StartTimestamp: {
          S: event.startTimestamp
        },
        EndTimestamp: {
          S: event.endTimestamp
        },
        Sessions: {
          S: JSON.stringify(event.sessions)
        },
        Expiry: {
          N: '' + expiry
        }
      }
    };

    console.log('[INFO] inserting main event: ' + JSON.stringify(request, null, 2));

    await dynamo.putItem(request).promise();
  }
  catch (error)
  {
    console.log('[ERROR] failed to insert main event into Dynamo', error);
    throw error;
  }
}

/**
 * Loads main events from Dynamo
 * Foxtel specific logic
 */
module.exports.getMainEvents = async (mainEventsTable) =>
{
  try
  {
    // TODO handle paging of these results?
    var statement = `SELECT * FROM "${mainEventsTable}"`;

    var request = {
      Statement: statement
    };

    var results = await dynamo.executeStatement(request).promise();

    var events = [];

    results.Items.forEach(item => {
      events.push(makeEvent(item));
    });

    return events;
  }
  catch (error)
  {
    console.log('[ERROR] failed to load main events', error);
    throw error;
  }
};

/**
 * Deletes a main event from DynamoDB
 */
module.exports.deleteMainEvent = async (mainEventsTable, eventId) =>
{
  try
  {
    var statement = `DELETE FROM "${mainEventsTable}" WHERE "EventId" = ?`;

    var request = {
      Statement: statement,
      Parameters: [
        {
          S: eventId
        }
      ]
    };

    await dynamo.executeStatement(request).promise();
  }
  catch (error)
  {
    console.log('[ERROR] failed to delete a main event', error);
    throw error;
  }
};

/**
 * Saves selected fields of a main event
 * 
 * Currently these fields are updated
 *  - name
 *  - decription
 */
module.exports.updateMainEvent = async (mainEventsTable, eventId, name, speechName, fastPathMinutes, description, active) =>
{
  try
  {
    var statement = `UPDATE "${mainEventsTable}"` +
        ` SET "Name" = ?` +
        ` SET "SpeechName" = ?` +
        ` SET "FastPathMinutes" = ?` +
        ` SET "Description" = ?` +
        ` SET "Active" = ?` +
        ` WHERE "EventId" = ?`;

      var request = {
        Statement: statement,
        Parameters: [
          {
            S: name
          },
          {
            S: speechName
          },
          {
            S: '' + fastPathMinutes
          },
          {
            S: description
          },
          {
            S: '' + active
          },
          {
            S: eventId
          }
        ]
      };

      await dynamo.executeStatement(request).promise();
  }
  catch (error)
  {
    console.log('[ERROR] failed to update main event', error);
    throw error;
  }
};


/**
 * Checks if this test exists by name
 */
module.exports.checkTestExistsByName = async (testsTable, testName) =>
{
  try
  {
    var statement = `SELECT * FROM "${testsTable}"` +
      ` WHERE "Name" = ?`;

    var request = {
      Statement: statement,
      Parameters: [
        {
          S: testName
        }
      ]
    };

    var results = await dynamo.executeStatement(request).promise();
    return (results.Items && results.Items.length > 0);
  }
  catch (error)
  {
    console.log('[ERROR] failed to check for test existence in DynamoDB', error);
    throw error;
  }
};

/**
 * Checks if this rule set exists by name
 */
module.exports.checkRuleSetExistsByName = async (ruleSetsTable, ruleSetName) =>
{
  try
  {
    var statement = `SELECT * FROM "${ruleSetsTable}"` +
      ` WHERE "Name" = ?`;

    var request = {
      Statement: statement,
      Parameters: [
        {
          S: ruleSetName
        }
      ]
    };

    var results = await dynamo.executeStatement(request).promise();
    return (results.Items && results.Items.length > 0);
  }
  catch (error)
  {
    console.log('[ERROR] failed to check for rule set existence in DynamoDB', error);
    throw error;
  }
};

/**
 * Checks if this rule exists in this rule set by name
 */
module.exports.checkRuleExistsByName = async (rulesTable, ruleSetId, ruleName) =>
{
  try
  {
    var statement = `SELECT * FROM "${rulesTable}"` +
      ` WHERE "RuleSetId" = ? AND "Name" = ?`;

    var request = {
      Statement: statement,
      Parameters: [
        {
          S: ruleSetId
        },
        {
          S: ruleName
        }
      ]
    };

    var results = await dynamo.executeStatement(request).promise();
    return (results.Items && results.Items.length > 0);
  }
  catch (error)
  {
    console.log('[ERROR] failed to check for rule existence in DynamoDB', error);
    throw error;
  }
};

/**
 * Updates a rule set
 */
module.exports.updateRuleSet = async (ruleSetsTable, ruleSetId,
  ruleSetEnabled, ruleSetDescription, inboundNumbers) =>
{
  try
  {
    if (inboundNumbers.length > 0)
    {
      var statement = `UPDATE "${ruleSetsTable}"` +
        ` SET "Enabled" = ?` +
        ` SET "Description" = ?` +
        ` SET "InboundNumbers" = ?` +
        ` WHERE "RuleSetId" = ?`;

      var request = {
        Statement: statement,
        Parameters: [
          {
            S: '' + ruleSetEnabled
          },
          {
            S: ruleSetDescription
          },
          {
            SS: inboundNumbers
          },        
          {
            S: ruleSetId
          }
        ]
      };

      await dynamo.executeStatement(request).promise();
    }
    else
    {
      var statement = `UPDATE "${ruleSetsTable}"` +
        ` SET "Enabled" = ?` +
        ` SET "Description" = ?` +
        ` REMOVE "InboundNumbers"` +
        ` WHERE "RuleSetId" = ?`;

      var request = {
        Statement: statement,
        Parameters: [
          {
            S: '' + ruleSetEnabled
          },
          {
            S: ruleSetDescription
          },        
          {
            S: ruleSetId
          }
        ]
      };

      await dynamo.executeStatement(request).promise();
    }
  }
  catch (error)
  {
    console.log('[ERROR] failed to update rule set in Dynamo', error);
    throw error;
  }
};

/**
 * Updates a rule
 */
module.exports.updateRule = async (rulesTable, ruleSetId, ruleId, 
  ruleEnabled, ruleDescription, rulePriority, ruleActivation, 
  ruleType, params) =>
{
  try
  {
    var statement = `UPDATE "${rulesTable}"` +
      ` SET "Enabled" = ?` +
      ` SET "Description" = ?` +
      ` SET "Priority" = ?` +
      ` SET "Activation" = ?` +
      ` SET "Type" = ?` +
      ` SET "Params" = ?` +
      ` WHERE "RuleSetId" = ?` +
      ` AND "RuleId" = ?`;

    var request = {
      Statement: statement,
      Parameters: [
        {
          S: '' + ruleEnabled
        },
        {
          S: ruleDescription
        },
        {
          S: rulePriority
        },
        {
          S: ruleActivation
        },
        {
          S: ruleType
        },
        {
          S: JSON.stringify(params)
        },
        {
          S: ruleSetId
        },
        {
          S: ruleId
        }
      ]
    };

    await dynamo.executeStatement(request).promise();
  }
  catch (error)
  {
    console.log('[ERROR] failed to update rule in Dynamo', error);
    throw error;
  }
};

/**
 * Updates a test
 */
module.exports.updateTest = async (testsTable, testId, testDescription, testPayload) =>
{
  try
  {
    var statement = `UPDATE "${testsTable}"` +
      ` SET "Description" = ?` +
      ` SET "Payload" = ?` +
      ` WHERE "TestId" = ?`;

    var request = {
      Statement: statement,
      Parameters: [
        {
          S: testDescription
        },
        {
          S: testPayload
        },
        {
          S: testId
        }
      ]
    };

    await dynamo.executeStatement(request).promise();
  }
  catch (error)
  {
    console.log('[ERROR] failed to update test in Dynamo', error);
    throw error;
  }
};


/**
 * Fetches a user by API key
 */
module.exports.getUserByAPIKey = async (usersTable, apiKey) =>
{
  try
  {
    var statement = `SELECT * FROM "${usersTable}"."APIKeyIndex"` +
      ` WHERE "APIKey" = ?`;

    var request = {
      Statement: statement,
      Parameters: [
        {
          S: apiKey
        }
      ]
    };

    var results = await dynamo.executeStatement(request).promise();

    if (results.Items && results.Items.length === 1)
    {
      return makeUser(results.Items[0]);
    }

    console.log('[ERROR] failed to find user for API key');
    return undefined;
  }
  catch (error)
  {
    console.log('[ERROR] failed to find user for API key', error);
    throw error;
  }
}

/**
 * Fetches a user by email address
 */
module.exports.getUserByEmailAddress = async (usersTable, emailAddress) =>
{
  try
  {
    var statement = `SELECT * FROM "${usersTable}"."EmailAddressIndex"` +
      ` WHERE "EmailAddress" = ?`;

    var request = {
      Statement: statement,
      Parameters: [
        {
          S: emailAddress
        }
      ]
    };

    var results = await dynamo.executeStatement(request).promise();

    if (results.Items && results.Items.length === 1)
    {
      return makeUser(results.Items[0]);
    }

    console.log('[INFO] failed to find user for email address key');
    return undefined;
  }
  catch (error)
  {
    console.log('[ERROR] failed to find user by email address', error);
    throw error;
  }
}

/**
 * Inserts a new user
 */
module.exports.insertUser = async (usersTable, firstName, lastName, 
  emailAddress, userRole, apiKey, userEnabled) =>
{
  try
  {
    var userId = uuidv4();

    var request = {
      TableName: usersTable,
      Item: {
        UserId: {
          S: userId
        },
        FirstName: {
          S: firstName
        },
        LastName: {
          S: lastName
        },
        FirstName: {
          S: firstName
        },
        EmailAddress: {
          S: emailAddress
        },
        UserRole: {
          S: userRole
        },
        APIKey: {
          S: apiKey
        },
        UserEnabled: {
          S: '' + userEnabled
        }
      }
    };

    await dynamo.putItem(request).promise();
    return userId;
  }
  catch (error)
  {
    console.log('[ERROR] failed to insert user into Dynamo', error);
    throw error;
  }
}

/**
 * Inserts a call history record
 */
module.exports.insertCallHistory = async (callHistoryTable, phoneNumber, when, action) =>
{
  try
  {

    var request = {
      TableName: callHistoryTable,
      Item: {
        PhoneNumber: {
          S: phoneNumber
        },
        When: {
          S: when
        },
        Action: {
          S: action
        }
      }
    };

    await dynamo.putItem(request).promise();
  }
  catch (error)
  {
    console.log('[ERROR] failed to insert call history record into DynamoDB', error);
    throw error;
  }
};

/**
 * Inserts a state record for a customer with a standard 24 hour expiry
 * handling converting complex objects to JSON as required
 */
module.exports.insertState = async (stateTable, contactId, what, value) =>
{
  try
  {
    var expiry = Math.floor(new Date().getTime() / 1000) + 24 * 60 * 60;

    var actualValue = value;

    // Handle object serialisation by converting them to JSON
    if (typeof actualValue === 'object')
    {
      actualValue = JSON.stringify(actualValue);
    }

    var request = {
      TableName: stateTable,
      Item: {
        ContactId: {
          S: contactId
        },
        What: {
          S: what
        },
        Value: {
          S: actualValue
        },
        Expiry: {
          N: '' + expiry
        }
      }
    };

    await dynamo.putItem(request).promise();
  }
  catch (error)
  {
    console.log('[ERROR] failed to insert state into Dynamo', error);
    throw error;
  }
};

/**
 * Updates a user in DynamoDB assumes checks have been made to prevent duplicate
 * email and api keys
 */
module.exports.updateUser = async(usersTable, 
      userId, firstName, lastName, emailAddress, 
      userRole, apiKey, enabled) =>
{
  try
  {
    var statement = `UPDATE "${usersTable}"` +
      ` SET "UserEnabled" = ?` +
      ` SET "FirstName" = ?` +
      ` SET "LastName" = ?` +
      ` SET "APIKey" = ?` +
      ` SET "EmailAddress" = ?` +
      ` SET "UserRole" = ?` +
      ` WHERE "UserId" = ?`;

    if (apiKey === '')
    {
      statement = `UPDATE "${usersTable}"` +
        ` SET "UserEnabled" = ?` +
        ` SET "FirstName" = ?` +
        ` SET "LastName" = ?` +
        ` SET "EmailAddress" = ?` +
        ` SET "UserRole" = ?` +
        ` WHERE "UserId" = ?`;
    }

    var request = {
      Statement: statement,
      Parameters: [
        {
          S: '' + enabled
        },
        {
          S: firstName
        },
        {
          S: lastName
        },
        {
          S: apiKey
        },
        {
          S: emailAddress
        },
        {
          S: userRole
        },
        {
          S: userId
        }
      ]
    };

    if (apiKey === '')
    {
      request.Parameters.splice(3, 1);
    }

    await dynamo.executeStatement(request).promise();
  }
  catch (error)
  {
    console.log('[ERROR] failed to update user into Dynamo', error);
    throw error;
  }
}

/**
 * Inserts a rule set into DynamoDB
 */
module.exports.insertRuleSet = async (ruleSetsTable, ruleSetName, 
  ruleSetEnabled, ruleSetDescription, inboundNumbers) =>
{
  try
  {
    var ruleSetId = uuidv4();

    var request = {
      TableName: ruleSetsTable,
      Item: {
        RuleSetId: {
          S: ruleSetId
        },
        Name: {
          S: ruleSetName
        },
        Enabled: {
          S: '' + ruleSetEnabled
        },
        Description: {
          S: ruleSetDescription
        }
      }
    };

    if (inboundNumbers !== undefined && inboundNumbers.length > 0)
    {
      request.Item.InboundNumbers = { SS: inboundNumbers };
    }

    await dynamo.putItem(request).promise();
    return ruleSetId;
  }
  catch (error)
  {
    console.log('[ERROR] failed to insert rule set into Dynamo', error);
    throw error;
  }
};

/**
 * Inserts a rule into DynamoDB
 */
module.exports.insertRule = async (rulesTable, ruleSetId, ruleName, 
  ruleEnabled, ruleDescription, rulePriority, ruleActivation, 
  ruleType, params, weights) =>
{
  try
  {
    var ruleId = uuidv4();

    weights.forEach(weight =>
    {
      weight.weightId = uuidv4();
    });

    var request = {
      TableName: rulesTable,
      Item: {
        RuleSetId: {
          S: ruleSetId
        },
        RuleId: {
          S: ruleId
        },
        Name: {
          S: ruleName
        },
        Enabled: {
          S: '' + ruleEnabled
        },
        Description: {
          S: ruleDescription
        },
        Priority: {
          S: rulePriority
        },
        Activation: {
          S: ruleActivation
        },
        Type: {
          S: ruleType
        },
        Params: {
          S: JSON.stringify(params)
        },
        Weights: {
          S: JSON.stringify(weights)
        }
      }
    };
    await dynamo.putItem(request).promise();
    return ruleId;
  }
  catch (error)
  {
    console.log('[ERROR] failed to insert rule into Dynamo', error);
    throw error;
  }
};

/**
 * Helper function that can import rule sets
 */
module.exports.importRuleSets = async (ruleSetsTable, rulesTable, newRuleSets) =>
{
  try
  {
    // Load existing rule sets
    var existingRuleSets = await module.exports.getRuleSetsAndRules(ruleSetsTable, rulesTable);

    // Walk over the existing rules to see if this is an insert or update
    for (var i = 0; i < newRuleSets.length; i++)
    {
      var newRuleSet = newRuleSets[i];
      var existingRuleSet = existingRuleSets.find(ruleSet => ruleSet.name === newRuleSet.name);

      var existingInbound = undefined;

      if (existingRuleSet !== undefined)
      {
        console.log('[INFO] removing existing rule set before replacing: ' + existingRuleSet.name);

        for (var j = 0; j < existingRuleSet.rules.length; j++)
        {
          await module.exports.deleteRule(rulesTable, existingRuleSet.rules[j].ruleSetId, existingRuleSet.rules[j].ruleId);
        }

        existingInbound = existingRuleSet.inboundNumbers;

        await module.exports.deleteRuleSet(ruleSetsTable, existingRuleSet.ruleSetId);
      }

      console.log('[INFO] importing rule set: ' + newRuleSet.name);

      var newRuleSetId = await module.exports.insertRuleSet(ruleSetsTable, 
          newRuleSet.name,
          newRuleSet.enabled,
          newRuleSet.description,
          existingInbound);

      for (var r = 0; r < newRuleSet.rules.length; r++)
      {
        var newRule = newRuleSet.rules[r];
        await module.exports.insertRule(rulesTable, newRuleSetId, 
          newRule.name, 
          newRule.enabled, 
          newRule.description, 
          newRule.priority, 
          newRule.activation, 
          newRule.type, 
          newRule.params, 
          newRule.weights);
      }
    }

    console.log(`[INFO] successfully imported: ${newRuleSets.length} rulesets`);
  }
  catch (error)
  {
    console.log('[ERROR] failed to import rule sets into Dynamo', error);
    throw error;
  }
};

/**
 * Inserts a test into DynamoDB
 */
module.exports.insertTest = async (testsTable, testName, testDescription, testPayload) =>
{
  try
  {
    var testId = uuidv4();

    var request = {
      TableName: testsTable,
      Item: {
        TestId: {
          S: testId
        },
        Name: {
          S: testName
        },
        Description: {
          S: testDescription
        },
        Payload: {
          S: testPayload
        }
      }
    };

    await dynamo.putItem(request).promise();
    return testId;
  }
  catch (error)
  {
    console.log('[ERROR] failed to insert test into Dynamo', error);
    throw error;
  }
};

/**
 * Makes a rule from a DynamoDB item
 */
function makeRule(item)
{
  var rule = {
    ruleSetId: item.RuleSetId.S,
    ruleId: item.RuleId.S,
    name: item.Name.S,
    description: item.Description.S,
    priority: item.Priority.S,
    activation: item.Activation.S,
    type: item.Type.S,
    enabled: item.Enabled.S === 'true',
    params: {},
    weights: []
  };

  if (item.Params !== undefined && item.Params.S !== undefined && item.Params.S !== '')
  {
    rule.params = JSON.parse(item.Params.S);
  }

  if (item.Weights !== undefined && item.Weights.S !== undefined && item.Weights.S !== '')
  {
    rule.weights = JSON.parse(item.Weights.S);
  }

  return rule;
}

/**
 * Makes a rule set from a DynamoDB item
 */
function makeRuleSet(item)
{
  var ruleSet = {
    ruleSetId: item.RuleSetId.S,
    name: item.Name.S,
    description: item.Description.S,
    enabled: item.Enabled.S === 'true',
    inboundNumbers: []
  };

  if (item.InboundNumbers !== undefined)
  {
    ruleSet.inboundNumbers = item.InboundNumbers.SS;
  }

  return ruleSet;
}

/**
 * Makes a test from a DynamoDB item
 */
function makeTest(item)
{
  var test = {
    testId: item.TestId.S,
    name: item.Name.S,
    description: item.Description.S,
    payload: item.Payload.S
  };

  return test;
}

/**
 * Makes a user from a DynamoDB item
 */
function makeUser(item)
{
  var user = {
    userId: item.UserId.S,
    firstName: item.FirstName.S,
    lastName: item.LastName.S,
    emailAddress: item.EmailAddress.S,
    enabled: item.UserEnabled.S === 'true',
    userRole: item.UserRole.S
  };

  return user;
}

/**
 * Makes a state item from a DynamoDB item
 */
function makeStateItem(item)
{
  var stateItem = {
    contactId: item.ContactId.S,
    what: item.What.S,
    value: item.Value.S,
    expiry: item.Expiry.N
  };

  return stateItem;
}

/**
 * Makes a config item
 */
function makeConfigItem(item)
{
  var configItem = {
    configKey: item.ConfigKey.S,
    configData: item.ConfigData.S,
    lastUpdate: moment(item.LastUpdate.S)
  };

  return configItem;
}

/**
 * Makes a main event from a DynamoDB item
 * Foxtel specific logic
 */
function makeEvent(item)
{
  var event = {
    eventId: item.EventId.S,
    active: (item.Active.S === 'true'),
    name: item.Name.S,
    speechName: item.SpeechName.S,
    fastPathMinutes: +item.FastPathMinutes.S,
    description: item.Description.S,
    price: item.Price.S,
    startTimestamp: item.StartTimestamp.S,
    endTimestamp: item.EndTimestamp.S,
    sessions: JSON.parse(item.Sessions.S)
  };

  return event;
}

/**
 * Makes a customer account from DynamoDB item
 * Note: Foxtel specific logic here
 */
function makeAccountItem(item)
{
  var accountItem = JSON.parse(item.Attributes.S);

  accountItem.DateOfBirthSimple = accountItem.DateOfBirth.replace(/\//g, '');

  accountItem.FirstName = '';
  accountItem.LastName = '';

  if (accountItem.AccountName !== undefined && accountItem.AccountName != null)
  {
    var names = accountItem.AccountName.split(' ');
    accountItem.FirstName = names[0];

    if (names.length > 1)
    {
      var lastNames = names.slice(1);
      accountItem.LastName = lastNames.join(' ');
    }
  }

  return accountItem;
}


