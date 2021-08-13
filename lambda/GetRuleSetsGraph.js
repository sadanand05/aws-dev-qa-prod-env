
var requestUtils = require('./utils/RequestUtils.js');
var dynamoUtils = require('./utils/DynamoUtils.js');

/**
 * Fetches a rule set graph
 */
exports.handler = async(event, context, callback) =>
{
  try
  {
    requestUtils.logRequest(event);
    requestUtils.checkOrigin(event);
    var user = await requestUtils.verifyAPIKey(event);
    requestUtils.requireRole(user, ['ADMINISTRATOR', 'POWER_USER', 'TESTER']);

    var ruleSets = await dynamoUtils.getRuleSetsAndRules(process.env.RULE_SETS_TABLE, process.env.RULES_TABLE);

    var nodes = [];
    var edges = [];

    // Create the graph
    computeGraph(ruleSets, nodes, edges);

    callback(null, requestUtils.buildSuccessfulResponse({
      nodes: nodes,
      edges: edges
    }));
  }
  catch (error)
  {
    console.log('[ERROR] failed to load rule set graph', error);
    callback(null, requestUtils.buildErrorResponse(error)); 
  }
};

/**
 * Computes the top level graph for all rule sets
 */
function computeGraph(ruleSets, nodes, edges)
{
  var inboundColour = '#4ea435';
  var outboundColour = '#f89800';

  var ruleSetIdMap = new Map();
  var externalNumberIdMap = new Map();
  var uniqueEdgesSet = new Set();
  var id = 0;

  // Add a node for each rule set
  ruleSets.forEach(rs => {
    var ruleSetId = id++;

    ruleSetIdMap.set(rs.name, ruleSetId);

    // Add a node for each rule set
    nodes.push({
      id: ruleSetId, 
      ruleSetId: rs.ruleSetId,
      label: rs.name.replace(' - ', '\n'),
      title: rs.description,
      type: 'ruleSet',
      shape: 'image',
      image: 'img/icons/ruleset.png'
    });

    // Iterate all inbound numbers
    rs.inboundNumbers.forEach(inboundNumber => {

      var inboundId = id++;

      // Add a node for each inbound phone number
      nodes.push({
        id: inboundId, 
        label: inboundNumber,
        title: 'Direct inbound dial: ' + inboundNumber,
        shape: 'image',
        type: 'inbound',
        image: 'img/icons/phone.png'
      });

      addEdge(uniqueEdgesSet, edges, inboundId, ruleSetId, inboundColour, inboundColour);
    });
  });

  // Iterate each rule set creating forward links
  // and potentially assets for linked objects
  ruleSets.forEach(rs => {

    var sourceId = ruleSetIdMap.get(rs.name);

    rs.rules.forEach(rule => {

      if (rule.type === 'DTMFMenu')
      {
        var keys = Object.keys(rule.params);

        keys.forEach(key => {
          if (key.match(/dtmf[0-9]+/))
          {
            var linkedRuleSetName = rule.params[key];
            var targetId = ruleSetIdMap.get(linkedRuleSetName);

            var label = key.substring(4);

            addEdge(uniqueEdgesSet, edges, sourceId, targetId, null, null, label);
          }
        })
      }

      if (rule.type === 'RuleSet')
      {
        var targetId = ruleSetIdMap.get(rule.params.ruleSetName);
        addEdge(uniqueEdgesSet, edges, sourceId, targetId, null, null);
      }

      if (rule.type === 'RuleSetPrompt')
      {
        var targetId = ruleSetIdMap.get(rule.params.ruleSetName);
        addEdge(uniqueEdgesSet, edges, sourceId, targetId, null, null);
      }

      if (rule.type === 'Queue' || rule.type === 'QueuePrompt')
      {
        var queueId = id++;

        nodes.push({
          id: queueId, 
          label: rule.params.queueName,
          title: 'Queue: ' + rule.params.queueName,
          shape: 'image',
          type: 'queue',
          image: 'img/icons/queue.png'
        });

        addEdge(uniqueEdgesSet, edges, sourceId, queueId, outboundColour, outboundColour);
      }

      if (rule.type === 'Flow' || rule.type === 'FlowPrompt')
      {
        var flowId = id++;

        nodes.push({
          id: flowId, 
          label: rule.params.flowName,
          title: 'Flow: ' + rule.params.flowName,
          shape: 'image',
          type: 'flow',
          image: 'img/icons/connect_blue.png'
        });

        addEdge(uniqueEdgesSet, edges, sourceId, flowId, outboundColour, outboundColour);
      }

      if (rule.type === 'ExternalNumber')
      {
        var externalNumberId = externalNumberIdMap.get(rule.params.externalNumber);

        if (externalNumberId === undefined)
        {
          externalNumberId = id++;
          externalNumberIdMap.set(rule.params.externalNumber, externalNumberId);

          nodes.push({
            id: externalNumberId, 
            label: rule.params.externalNumber,
            title: 'External number: ' + rule.params.externalNumber,
            shape: 'image',
            type: 'outbound',
            image: 'img/icons/phone.png'
          });
        }

        addEdge(uniqueEdgesSet, edges, sourceId, externalNumberId, outboundColour, outboundColour);
      }
    });
  });
}

/**
 * Add an edge, checking for an existing edge to reverse
 */ 
function addEdge(uniqueEdgesSet, edges, id1, id2, colour1, colour2, label = null)
{
  if (uniqueEdgesSet.has(`${id1}_${id2}`))
  {
    return;
  }

  if (uniqueEdgesSet.has(`${id2}_${id1}`))
  {
    var edge = edges.find(edge => edge.from === id2 && edge.to === id1);

    if (edge !== undefined)
    {
      // Add the return arrow
      edge.arrows.from =  
      {
        enabled: true,
        type: 'arrow'
      };

      if (label !== null)
      {
        if (edge.label !== undefined)
        {
          edge.label += ',' + label;
        }
        else
        {
          edge.label = label;
        }
      }
    }
  }
  else
  {
    var edge = {
      from: id1, 
      to: id2,
      font: { 
        align: 'top',
        color: '#418aeb'
      },
      arrows: 
      {
        to: 
        {
          enabled: true,
          type: 'arrow'
        }
      }
    };

    if (colour1 && colour2)
    {
      edge.color = {
        color: colour1, 
        highlight: colour2
      };
    }

    if (label != null)
    {
      edge.label = label;
    } 

    edges.push(edge);
  }

  uniqueEdgesSet.add(`${id1}_${id2}`);
}
