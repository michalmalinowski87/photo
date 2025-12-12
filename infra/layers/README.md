# Lambda Layers

This directory contains Lambda Layer definitions for shared dependencies.

## AWS SDK Layer

The AWS SDK v3 layer contains all `@aws-sdk/*` packages and Express framework, reducing bundle sizes for Lambda functions by 50-70%.

### Building the Layer

**Option 1: Manual Build (No Docker required)**
```bash
cd infra/layers/aws-sdk
mkdir -p nodejs
cp package.json nodejs/
cd nodejs
npm install --production
```

**Option 2: Using Build Script**
```bash
cd infra/layers
./build-layer.sh
```

**Option 3: Let CDK Build It (Requires Docker)**
CDK will automatically build the layer during `cdk synth` or `cdk deploy` if the `nodejs/node_modules` directory doesn't exist. This requires Docker to be running.

### Layer Structure

```
layers/aws-sdk/
  ├── package.json          # Layer dependencies
  ├── nodejs/               # Lambda layer structure
  │   ├── package.json
  │   └── node_modules/     # Installed packages
  └── build-layer.sh        # Build script
```

### Usage

The layer is automatically attached to all Lambda functions via `defaultFnProps` in `app-stack.ts`. Functions externalize `@aws-sdk/*` packages and `express` in their bundling configuration to use the layer.

### Expected Bundle Size Reductions

- **ApiFunction**: 2.9MB → ~800KB-1.2MB (60-70% reduction)
- **AuthFunction**: 1.5MB → ~400KB-600KB (60-70% reduction)
- **DownloadsZipFn**: 1.1MB → ~400KB-600KB (50-60% reduction)
- **Other functions**: 30-60% reduction depending on AWS SDK usage

