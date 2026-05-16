#!/bin/bash

# Build script for whistle.postman
set -e

echo "🔨 Building whistle.postman..."

# Get version from package.json
VERSION=$(node -p "require('./package.json').version")
echo "📦 Version: $VERSION"

# Create build info
BUILD_DATE=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
BUILD_HASH=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")

# Generate build info file
cat > ui/build-info.json << EOF
{
  "version": "$VERSION",
  "buildDate": "$BUILD_DATE",
  "gitHash": "$BUILD_HASH"
}
EOF

echo "✅ Build info generated: ui/build-info.json"

# Validate package structure
echo ""
echo "📋 Package contents:"
echo "  - index.js (main entry)"
echo "  - lib/ (parsers, http client)"
echo "  - ui/ (frontend assets)"
echo "  - README.md"
echo "  - CHANGELOG.md"

# Check for required files
REQUIRED_FILES=("index.js" "lib/parsers/openapi.js" "lib/http/client.js" "ui/index.html" "ui/js/app.js" "ui/css/styles.css")

echo ""
echo "🔍 Validating required files..."
for file in "${REQUIRED_FILES[@]}"; do
  if [ -f "$file" ]; then
    echo "  ✓ $file"
  else
    echo "  ✗ $file (MISSING!)"
    exit 1
  fi
done

# Dry run npm pack
echo ""
echo "📦 Testing npm pack (dry run)..."
npm pack --dry-run 2>/dev/null | head -20

echo ""
echo "✅ Build complete!"
echo ""
echo "To publish:"
echo "  npm version patch|minor|major"
echo "  npm publish"
