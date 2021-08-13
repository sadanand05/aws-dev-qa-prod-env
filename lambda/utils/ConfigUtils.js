
var LRU = require("lru-cache");
var dynamoUtils = require('./DynamoUtils.js');
var moment = require('moment');

/**
 * 1 minute LRU cache for performance
 */
var cacheOptions = { max: 100, maxAge: 1000 * 60 * 1 };
var cache = new LRU(cacheOptions);

/**
 * Fetches the cached operating hours
 */
module.exports.getOperatingHours = async function(configTable)
{
  var configItem = await module.exports.getCachedConfigItem(configTable, 'OperatingHours');

  return JSON.parse(configItem.configData);
}

/**
 * Fetches the cached holidays
 */
module.exports.getHolidays = async function(configTable)
{
  var configItem = await module.exports.getCachedConfigItem(configTable, 'Holidays');

  return JSON.parse(configItem.configData);
}

module.exports.getCallCentreTimeZone = async function(configTable)
{
  var configItem = await module.exports.getCachedConfigItem(configTable, 'CallCentreTimeZone');

  return configItem.configData;
}

/**
 * Fetches the last change to the rule sets or rules this can be used to safely
 * cache data until the next change. This will set last change to now if not
 * already set
 */
module.exports.getLastChangeTimestamp = async function(configTable)
{
  var configItem = await module.exports.getUncachedConfigItem(configTable, 'LastChangeTimestamp');

  if (configItem === undefined)
  {
    return await module.exports.setLastChangeTimestampToNow(configTable);
  }
  else
  {
    return configItem.configData;  
  }
}

/**
 * Update the last change to now
 */ 
module.exports.setLastChangeTimestampToNow = async function(configTable)
{
  var lastChange = moment.utc().format();
  await module.exports.updateConfigItem(configTable, 'LastChangeTimestamp', lastChange);
  return lastChange;
}

/**
 * Fetches a potentially cached config item
 */
module.exports.getCachedConfigItem = async function (configTable, configKey)
{
  try
  {
    var configItem = cache.get(configKey);

    if (configItem !== undefined)
    {
      return configItem;
    }

    configItem = await module.exports.getUncachedConfigItem(configTable, configKey);

    cache.set(configKey, configItem);

    return configItem;
  }
  catch (error)
  {
    console.log('[ERROR] failed to fetch uncached config item', error);
    throw error;
  }
}

/**
 * Fetches an uncached config item
 */
module.exports.getUncachedConfigItem = async function (configTable, configKey)
{
  try
  {
    return await dynamoUtils.getConfigItem(configTable, configKey);
  }
  catch (error)
  {
    console.log('[ERROR] failed to uncached config item', error);
    throw error;
  }
}

/**
 * Updates a config item
 */
module.exports.updateConfigItem = async function (configTable, configKey, configValue)
{
  try
  {
    return await dynamoUtils.updateConfigItem(configTable, configKey, configValue);
  }
  catch (error)
  {
    console.log('[ERROR] failed to update config item', error);
    throw error;
  }
}

