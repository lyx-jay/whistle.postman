function parseOpenApi(specStr) {
  var requests = [];
  
  try {
    var spec = JSON.parse(specStr);
    var paths = spec.paths || {};
    
    for (var path in paths) {
      var methods = paths[path];
      
      for (var method in methods) {
        if (['get', 'post', 'put', 'patch', 'delete', 'head', 'options'].indexOf(method) === -1) {
          continue;
        }
        
        var operation = methods[method];
        var request = {
          name: operation.summary || operation.operationId || method.toUpperCase() + ' ' + path,
          method: method.toUpperCase(),
          url: '{{base_url}}' + path,
          headers: {},
          params: {},
          body: { type: 'none', content: '' },
          auth: { type: 'none' }
        };
        
        if (operation.parameters) {
          operation.parameters.forEach(function(param) {
            if (param.in === 'query' && param.default) {
              request.params[param.name] = param.default;
            }
          });
        }
        
        if (operation.requestBody) {
          var content = operation.requestBody.content || {};
          
          if (content['application/json'] && content['application/json'].schema) {
            request.body.type = 'json';
            request.body.content = JSON.stringify(generateSampleFromSchema(content['application/json'].schema), null, 2);
            request.headers['Content-Type'] = 'application/json';
          } else if (content['application/x-www-form-urlencoded']) {
            request.body.type = 'form-data';
          }
        }
        
        requests.push(request);
      }
    }
  } catch (e) {
    console.error('Failed to parse OpenAPI:', e);
  }
  
  return requests;
}

function generateSampleFromSchema(schema, visited) {
  visited = visited || new Set();
  
  if (!schema || visited.has(schema)) {
    return null;
  }
  visited.add(schema);
  
  var type = schema.type;
  
  if (schema.example) {
    return schema.example;
  }
  
  if (schema.default) {
    return schema.default;
  }
  
  if (type === 'object' || schema.properties) {
    var obj = {};
    var properties = schema.properties || {};
    
    for (var key in properties) {
      obj[key] = generateSampleFromSchema(properties[key], visited);
    }
    
    return obj;
  }
  
  if (type === 'array' && schema.items) {
    return [generateSampleFromSchema(schema.items, visited)];
  }
  
  if (type === 'string') {
    if (schema.format === 'date') return '2024-01-01';
    if (schema.format === 'date-time') return '2024-01-01T00:00:00Z';
    if (schema.format === 'email') return 'user@example.com';
    if (schema.format === 'uuid') return '550e8400-e29b-41d4-a716-446655440000';
    if (schema.enum) return schema.enum[0];
    return 'string';
  }
  
  if (type === 'integer' || type === 'number') {
    return schema.minimum || 0;
  }
  
  if (type === 'boolean') {
    return true;
  }
  
  return null;
}

module.exports = {
  parse: parseOpenApi,
  generateSample: generateSampleFromSchema
};