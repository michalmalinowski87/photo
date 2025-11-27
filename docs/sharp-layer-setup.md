# Sharp Lambda Layer Setup

Sharp has native dependencies that are difficult to bundle with CDK. The simplest solution is to use a pre-built Lambda Layer.

## Quick Setup

1. **Download a pre-built Sharp layer:**
   ```bash
   # Visit https://github.com/pH200/sharp-layer/releases
   # Download release-x64.zip for x86_64 architecture
   # Or release-arm64.zip for ARM64 architecture
   ```

2. **Publish the layer to AWS:**
   ```bash
   aws lambda publish-layer-version \
     --layer-name photocloud-sharp \
     --description "Sharp library for PhotoCloud image processing" \
     --zip-file fileb://release-x64.zip \
     --compatible-runtimes nodejs20.x \
     --compatible-architectures x86_64
   ```

3. **Get the layer ARN from the output** (look for `LayerVersionArn`)

4. **Deploy with the layer ARN:**
   ```bash
   cd infra
   yarn deploy --context sharpLayerArn=arn:aws:lambda:REGION:ACCOUNT:layer:photocloud-sharp:VERSION
   ```

## Alternative: Skip WebP (Simplest but loses cost savings)

If you want to avoid the layer setup entirely, you can temporarily disable WebP conversion and keep using Jimp for JPEG only. This will work immediately but won't provide the WebP cost savings (~$106-148/month).

To do this, modify `backend/functions/images/onUploadResize.ts` to only generate JPEG versions (remove WebP code).

