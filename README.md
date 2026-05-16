# Whistle Postman

A Postman-like HTTP request management plugin for Whistle debugging proxy.

## Features

- **Import Requests**: Paste cURL commands, HAR files, or raw HTTP messages
- **Request Editor**: Edit HTTP method, URL, headers, body, and authentication
- **Environment Variables**: Support `{{variable}}` syntax with multiple environments
- **Collections**: Save and organize requests in virtual folder structure
- **AI Mock**: Generate mock responses using AI based on request context or JSON schema
- **HTTP Client**: Send requests and view responses with Body/Headers/Cookies tabs
- **Pre-request Scripts**: Execute JavaScript before sending requests
- **Tests**: Validate responses with assertions
- **Whistle Rules**: Generate and apply mock/redirect/delay rules
- **Network Integration**: Import requests from Whistle Network panel

## Installation

```bash
# Install the plugin
npm install whistle.postman

# Or link for development
cd whistle.postman
npm link
```

## Usage

1. Start Whistle: `w2 start`
2. Access the Postman plugin from the Whistle web UI
3. Import requests by pasting cURL commands or other formats
4. Edit and send requests directly from the plugin

### Importing Requests

Supports multiple formats:
- **cURL**: Paste any cURL command
- **HAR**: HTTP Archive format
- **Raw HTTP**: Raw HTTP request message
- **OpenAPI**: Import from OpenAPI specification

### Environment Variables

Create environments in Settings and use `{{variableName}}` in:
- URL
- Headers
- Query Parameters
- Request Body

### Pre-request Scripts

Execute JavaScript before sending requests:
```javascript
// Set variables
pm.variables.set('token', 'abc123');

// Modify request
pm.request.headers['Authorization'] = 'Bearer ' + pm.variables.get('token');
```

### Tests

Validate responses with assertions:
```javascript
pm.test('Status is 200', function() {
  pm.expect(pm.response.status).toBe(200);
});

pm.test('Response has id', function() {
  var body = pm.response.json();
  pm.expect(body).toHaveProperty('id');
});
```

### Whistle Rules

Generate and apply Whistle rules:
- **Mock Response**: Return mock data for a URL
- **Redirect**: Redirect to another URL
- **Add Delay**: Simulate slow network
- **Throttle**: Limit bandwidth

### AI Mock

1. Go to "AI Mock" tab
2. Optionally provide a JSON schema
3. Click "Generate" to create mock response
4. Save generated mocks as templates for reuse

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Cmd/Ctrl + Enter | Send request |
| Cmd/Ctrl + S | Save to collection |

## Configuration

Access Settings to configure:
- AI Provider (OpenAI or custom endpoint)
- API Key
- Environment variables

## Data Storage

Plugin data is stored in:
```
~/.whistle.postman/plugins/whistle.postman/
├── config.json
├── history.json
├── environments.json
├── collections.json
└── mock-templates.json
```

## Development

### Build

```bash
npm run build
```

### Publish

```bash
# Interactive publish with version bump
bash scripts/publish.sh

# Or manually
npm version patch|minor|major
npm publish
```

### Changelog

See [CHANGELOG.md](CHANGELOG.md) for version history.

## License

MIT
