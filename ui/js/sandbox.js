(function() {
  'use strict';

  function deepCopy(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(deepCopy);
    var copy = {};
    for (var key in obj) {
      if (obj.hasOwnProperty(key)) {
        copy[key] = deepCopy(obj[key]);
      }
    }
    return copy;
  }

  function headersToObject(headers) {
    if (!headers) return {};
    if (typeof headers === 'string') {
      var result = {};
      headers.split('\r\n').forEach(function(line) {
        var idx = line.indexOf(': ');
        if (idx > 0) {
          result[line.substring(0, idx)] = line.substring(idx + 2);
        }
      });
      return result;
    }
    if (Array.isArray(headers)) {
      var obj = {};
      headers.forEach(function(h) {
        obj[h.name] = h.value;
      });
      return obj;
    }
    return deepCopy(headers);
  }

  function headersToArray(headers) {
    if (!headers) return [];
    if (Array.isArray(headers)) return headers;
    if (typeof headers === 'object') {
      return Object.keys(headers).map(function(k) {
        return { name: k, value: headers[k] };
      });
    }
    return [];
  }

  function createVariablesStore(initial) {
    var vars = deepCopy(initial || {});
    return {
      get: function(key) { return vars[key]; },
      set: function(key, value) { vars[key] = value; },
      unset: function(key) { delete vars[key]; },
      clear: function() { vars = {}; },
      _getAll: function() { return deepCopy(vars); }
    };
  }

  function createEnvironmentStore(initial) {
    var env = deepCopy(initial || {});
    return {
      get: function(key) { return env[key]; },
      set: function(key, value) { env[key] = value; },
      _getAll: function() { return deepCopy(env); }
    };
  }

  function createExpect(actual) {
    var obj = {};

    obj.toBe = function(expected) {
      if (actual !== expected) {
        throw new Error('Expected ' + JSON.stringify(expected) + ' but got ' + JSON.stringify(actual));
      }
    };

    obj.toEqual = function(expected) {
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error('Expected ' + JSON.stringify(expected) + ' but got ' + JSON.stringify(actual));
      }
    };

    obj.toBeDefined = function() {
      if (actual === undefined) {
        throw new Error('Expected value to be defined but got undefined');
      }
    };

    obj.toBeUndefined = function() {
      if (actual !== undefined) {
        throw new Error('Expected undefined but got ' + JSON.stringify(actual));
      }
    };

    obj.toBeNull = function() {
      if (actual !== null) {
        throw new Error('Expected null but got ' + JSON.stringify(actual));
      }
    };

    obj.toBeTruthy = function() {
      if (!actual) {
        throw new Error('Expected truthy value but got ' + JSON.stringify(actual));
      }
    };

    obj.toBeFalsy = function() {
      if (actual) {
        throw new Error('Expected falsy value but got ' + JSON.stringify(actual));
      }
    };

    obj.toContain = function(expected) {
      if (typeof actual === 'string') {
        if (actual.indexOf(expected) === -1) {
          throw new Error('Expected "' + actual + '" to contain "' + expected + '"');
        }
      } else if (Array.isArray(actual)) {
        if (actual.indexOf(expected) === -1) {
          throw new Error('Expected array to contain ' + JSON.stringify(expected));
        }
      } else {
        throw new Error('toContain can only be used with strings or arrays');
      }
    };

    obj.toBeGreaterThan = function(expected) {
      if (!(actual > expected)) {
        throw new Error('Expected ' + actual + ' to be greater than ' + expected);
      }
    };

    obj.toBeLessThan = function(expected) {
      if (!(actual < expected)) {
        throw new Error('Expected ' + actual + ' to be less than ' + expected);
      }
    };

    obj.toMatch = function(regex) {
      var r = typeof regex === 'string' ? new RegExp(regex) : regex;
      if (!r.test(actual)) {
        throw new Error('Expected "' + actual + '" to match ' + r);
      }
    };

    obj.toHaveProperty = function(key) {
      if (actual === null || actual === undefined || !actual.hasOwnProperty(key)) {
        throw new Error('Expected object to have property "' + key + '"');
      }
    };

    return obj;
  }

  function createPmContext(type, data) {
    var variables = createVariablesStore(data.variables);
    var environment = createEnvironmentStore(data.environment);
    var requestCopy = deepCopy(data.request || {});
    var testResults = [];

    var pm = {
      variables: variables,
      environment: environment,
      request: requestCopy,
      test: function(name, fn) {
        try {
          fn();
          testResults.push({ name: name, passed: true });
        } catch (e) {
          testResults.push({ name: name, passed: false, error: e.message });
        }
      },
      expect: function(actual) {
        return createExpect(actual);
      }
    };

    if (type === 'test' && data.response) {
      var resp = data.response;
      var headersObj = headersToObject(resp.headers);
      var body = resp.body || '';

      pm.response = {
        status: resp.status,
        statusText: resp.statusText || '',
        headers: headersObj,
        body: body,
        responseTime: resp.responseTime || 0,
        json: function() {
          try { return JSON.parse(body); }
          catch (e) { throw new Error('Response body is not valid JSON'); }
        },
        text: function() {
          return typeof body === 'string' ? body : JSON.stringify(body);
        }
      };
    }

    pm._testResults = testResults;
    return pm;
  }

  function executeScript(type, script, data) {
    var result = {
      success: true,
      results: [],
      variables: {},
      modifiedRequest: null,
      error: null
    };

    try {
      var pm = createPmContext(type, data);

      var fn = new Function('pm', script);
      fn(pm);

      result.results = pm._testResults;
      result.variables = pm.variables._getAll();
      result.modifiedRequest = deepCopy(pm.request);
    } catch (e) {
      result.success = false;
      result.error = e.message || String(e);
    }

    return result;
  }

  window.Sandbox = { execute: executeScript };
})();
