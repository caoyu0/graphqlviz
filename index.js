// Shamelessly copied from:
// https://github.com/NathanRSmith/graphql-visualizer

var _ = require('lodash');

// process a graphql type object
// returns simplified version of the type
function processType(item, entities, types) {
  var type = _.find(types, {name: item});

  var fields = _.map(type.fields, function (field) {
    var obj = {};
    obj.name = field.name;

    if (field.type.ofType) {
      obj.type = field.type.ofType.name;
      obj.isObjectType = field.type.ofType.kind === 'OBJECT';
      obj.isList = field.type.kind === 'LIST';
    } else {
      obj.type = field.type.name;
      obj.isObjectType = field.type.kind === 'OBJECT';
    }

    return obj;
  });

  entities[type.name] = {
    name: type.name,
    fields: fields
  };

  var linkeditems = _.chain(fields)
    .filter('isObjectType')
    .map('type')
    .uniq()
    .value();

  return linkeditems;
}

// walks the object in level-order
// invokes iter at each node
// if iter returns truthy, breaks & returns the value
// assumes no cycles
function walkBFS(obj, iter) {
  var q = _.map(_.keys(obj), function (k) {
    return {key: k, path: '["' + k + '"]'};
  });

  var current;
  var currentNode;
  var retval;
  var push = function (v, k) {
    q.push({key: k, path: current.path + '["' + k + '"]'});
  };
  while (q.length) {
    current = q.shift();
    currentNode = _.get(obj, current.path);
    retval = iter(currentNode, current.key, current.path);
    if (retval) {
      return retval;
    }

    if (_.isPlainObject(currentNode) || _.isArray(currentNode)) {
      _.each(currentNode, push);
    }
  }
}

module.exports.render = function (schema) {
  if (_.isString(schema)) {
    schema = JSON.parse(schema);
  }

  if (!_.isPlainObject(schema)) {
    throw new Error('Must be plain object');
  }

  // find entry points
  var rootPath = walkBFS(schema, function (v, k, p) {
    if (k === '__schema') {
      return p;
    }
  });
  if (!rootPath) {
    throw new Error('Cannot find "__schema" object');
  }

  var root = _.get(schema, rootPath);

  // build the graph
  var q = [];
  if (root.queryType) {
    q.push(root.queryType.name);
  }
  // if(root.mutationType) q.push(root.mutationType.name);

  // walk the graph & build up nodes & edges
  var current;
  var entities = {};
  while (q.length) {
    current = q.shift();

    // if item has already been processed
    if (entities[current]) {
      continue;
    }

    // process item
    q = q.concat(processType(current, entities, root.types));
  }

  // build the dot
  var dotfile = 'digraph erd {\n' +
    'graph [\n' +
    '  rankdir = "LR"\n' +
    '];\n' +
    'node [\n' +
    '  fontsize = "16"\n' +
    '  shape = "ellipse"\n' +
    '];\n' +
    'edge [\n' +
    '];\n';

  // nodes
  dotfile += _.map(entities, function (v) {
    var rows = _.map(v.fields, function (v) {
      return v.name + ': ' + (v.isList ? '[' + v.type + ']' : v.type);
    });
    rows.unshift(v.name);

    return v.name + ' [label="' + rows.join(' | ') + '" shape="record"];';
  }).join('\n');

  dotfile += '\n\n';

  // edges
  dotfile += _.chain(entities)
  .reduce(function (a, v) {
    _.each(v.fields, function (f) {
      if (!f.isObjectType) {
        return;
      }

      a.push(v.name + ' -> ' + f.type);
    });

    return a;
  }, [])
  .uniq()
  .value()
  .join('\n');

  dotfile += '\n}';

  return dotfile;
};

module.exports.query = 'query IntrospectionQuery { __schema { queryType { name } mutationType { name } subscriptionType { name } types { ...FullType } directives { name description args { ...InputValue } onOperation onFragment onField } } } fragment FullType on __Type { kind name description fields(includeDeprecated: true) { name description args { ...InputValue } type { ...TypeRef } isDeprecated deprecationReason } inputFields { ...InputValue } interfaces { ...TypeRef } enumValues(includeDeprecated: true) { name description isDeprecated deprecationReason } possibleTypes { ...TypeRef } } fragment InputValue on __InputValue { name description type { ...TypeRef } defaultValue } fragment TypeRef on __Type { kind name ofType { kind name ofType { kind name ofType { kind name } } } }';
