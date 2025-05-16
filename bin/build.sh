#!/bin/bash
set -e

# Debug - show current directory and files
echo "Current directory: $(pwd)"
echo "Files in directory: $(ls -la)"

# Remove yarn.lock if it exists
if [ -f "yarn.lock" ]; then
  echo "Removing yarn.lock file..."
  rm yarn.lock
fi

# Install dependencies with npm
echo "Installing dependencies with npm..."
npm install

# Build the application
echo "Building the application..."
npm run build

echo "Build completed successfully!"