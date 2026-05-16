#!/bin/bash

# Publish script for whistle.postman
set -e

echo "🚀 Publishing whistle.postman..."

# Check if logged in to npm
if ! npm whoami &>/dev/null; then
  echo "❌ Not logged in to npm. Please run: npm login"
  exit 1
fi

# Check for uncommitted changes
if [ -n "$(git status --porcelain)" ]; then
  echo "❌ Uncommitted changes detected. Please commit or stash them first."
  exit 1
fi

# Get current version
CURRENT_VERSION=$(node -p "require('./package.json').version")
echo "📦 Current version: $CURRENT_VERSION"

# Ask for version bump
echo ""
echo "Select version bump:"
echo "  1) patch (1.0.0 -> 1.0.1)"
echo "  2) minor (1.0.0 -> 1.1.0)"
echo "  3) major (1.0.0 -> 2.0.0)"
echo "  4) skip version bump"
read -p "Enter choice [1-4]: " choice

case $choice in
  1) BUMP="patch" ;;
  2) BUMP="minor" ;;
  3) BUMP="major" ;;
  4) BUMP="" ;;
  *) echo "Invalid choice"; exit 1 ;;
esac

# Bump version if selected
if [ -n "$BUMP" ]; then
  echo ""
  echo "📝 Bumping version ($BUMP)..."
  npm version $BUMP --no-git-tag-version
  NEW_VERSION=$(node -p "require('./package.json').version")
  echo "✅ Version bumped: $CURRENT_VERSION -> $NEW_VERSION"

  # Update CHANGELOG
  echo ""
  echo "📝 Please update CHANGELOG.md with the new version changes."
  echo "   Press Enter when ready to continue..."
  read

  # Commit changes
  git add -A
  git commit -m "chore: release v$NEW_VERSION"
  git tag "v$NEW_VERSION"
fi

# Run build
echo ""
echo "🔨 Running build..."
npm run build

# Publish
echo ""
echo "📦 Publishing to npm..."
npm publish

echo ""
echo "✅ Published successfully!"
echo ""
echo "Next steps:"
echo "  git push && git push --tags"
