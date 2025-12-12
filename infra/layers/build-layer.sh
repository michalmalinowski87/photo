#!/bin/bash
# Build script for AWS SDK Lambda Layer
# This script prepares the layer directory structure for CDK

set -e

LAYER_DIR="$(dirname "$0")/aws-sdk"

echo "Building AWS SDK Lambda Layer..."

# Create nodejs directory structure
mkdir -p "${LAYER_DIR}/nodejs"

# Copy package.json to nodejs directory
cp "${LAYER_DIR}/package.json" "${LAYER_DIR}/nodejs/"

# Install dependencies in nodejs directory
cd "${LAYER_DIR}/nodejs"
npm install --production

echo "Layer built successfully at ${LAYER_DIR}/nodejs"

