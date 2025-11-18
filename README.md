# PhotoHub Monorepo

PhotoHub is a SaaS for photographers to create secure private galleries with client selection and final delivery. This monorepo contains infrastructure (AWS CDK), backend Lambdas, and frontend apps (dashboard, client gallery).

## Tech Stack
- Infra: AWS CDK v2 (TypeScript), API Gateway (HTTP API), Lambda (Node.js 20), S3, DynamoDB, Cognito
- Frontend: Next.js (dashboard, gallery)
- Logging: JSON logs via shared logger; CloudWatch logs/metrics

## Repository Layout
- `infra/` – CDK app (stacks, resources, routing)
- `backend/functions/` – Lambda handlers (payments, galleries, uploads, downloads, etc.)
- `backend/lib/` – Shared backend utilities
- `frontend/dashboard/` – Photographer admin dashboard (Next.js)
- `frontend/gallery/` – Client gallery (Next.js)
- `packages/config/` – Shared types/config
- `packages/logger/` – Shared logger + lambda wrapper
- `scripts/smoke.mjs` – Simple synthetic health check

## Prerequisites
- Node.js 20+, Yarn Classic (1.x)
- AWS credentials configured (for deploys)

## Install
```bash
yarn install
```

## Infrastructure
Build/synth/deploy the CDK app:
```bash
cd infra
yarn build
yarn synth            # optional: preview CloudFormation
yarn deploy           # deploys the stack (uses AWS creds)
```

Context/stage:
- Default stage: `dev` (read from `--context stage=...` or `STAGE` env)

Outputs:
- Bucket name, Cognito UserPool, UserPool ClientId, and API URL are printed after deploy.

## Full AWS Setup & Deployment

### 1) AWS Account & CLI
- Install AWS CLI and configure credentials:
  ```bash
  aws configure
  # Provide Access key ID, Secret access key, region (e.g., eu-central-1), output format
  ```
- Ensure your IAM user/role has permissions to manage: CloudFormation, S3, DynamoDB, Cognito, Lambda, API Gateway, CloudWatch, IAM (for roles created by CDK).

### 2) Install Dependencies
```bash
yarn install
```

### 3) CDK Bootstrap (first time per account/region)
CDK v2 typically auto-bootstraps via deploy, but if needed:
```bash
cd infra
npx cdk bootstrap aws://<ACCOUNT_ID>/<REGION>
```

### 4) Select Stage and Region
- Default stage is `dev`. You can override with:
  - CLI context: `yarn deploy --context stage=prod`
  - Environment: `STAGE=prod yarn deploy`
- Region is taken from your AWS credentials environment (or `CDK_DEFAULT_REGION`).

### 5) Deploy
```bash
cd infra
yarn build
yarn deploy
```
- CDK will show a change set; approve to deploy.
- On success, note the outputs:
  - `BucketName`
  - `UserPoolId`
  - `UserPoolClientId`
  - `HttpApiUrl`

### 6) Verify API Is Live
- Health endpoint:
  ```bash
  API_URL=<HttpApiUrl_from_outputs>
  curl -i "$API_URL/health"
  ```
- Or use the smoke script:
  ```bash
  API_URL=$API_URL yarn smoke
  ```

### 7) Cognito Authentication (Photographer Admin)
- Create a test user in the user pool (AWS Console > Cognito > User pools > Create user).
- Alternatively via AWS CLI:
  ```bash
  # Sign-up flow if self-sign-up enabled; otherwise admin create via console is simpler for MVP
  ```
- The API routes for payments/galleries/uploads are protected by the Cognito authorizer. Use the dashboard app to authenticate and call these routes (future step: Hosted UI/JWT flow).

### 8) Frontend Configuration & Run
- Dashboard:
  ```bash
  cd frontend/dashboard
  NEXT_PUBLIC_API_URL=$API_URL yarn dev
  ```
  - Open http://localhost:3000 and run the API Health Check.
- Client Gallery:
  ```bash
  cd frontend/gallery
  yarn dev
  ```

### 9) Creating a Gallery (MVP Flow)
- For now, handlers are stubbed for payments; galleries can be created once auth flows are integrated.
- After auth integration, the dashboard will call `POST /galleries` (protected) to create an entry in DynamoDB and folder in S3.

### 10) Logs & Monitoring
- CloudWatch Logs: each Lambda has a log group under `/aws/lambda/...`.
- Check errors and invocations:
  - CloudWatch > Logs > Log groups
  - CloudWatch > Metrics (Lambda/API Gateway)

### 11) Teardown
To remove the stack:
```bash
cd infra
yarn deploy # ensure you’re deploying to the correct stage
npx cdk destroy
```
Note: Buckets with retained data may block deletion; empty S3 buckets or switch removal policy to DESTROY for development if needed.

### 12) Troubleshooting
- Missing alpha package versions: we pin CDK alpha packages with a caret range; run `yarn install` again if resolution fails.
- TypeScript path issues in Lambdas: repo uses relative imports inside Lambda handlers to avoid editor tooling issues.
- 403 on API calls: ensure you supply valid Cognito JWT when calling protected routes; health and webhook are public.
- Region mismatch: verify `aws configure get region` matches your intended region.

## Smoke Test
After deploy, run a basic health check:
```bash
API_URL=https://xxxxx.execute-api.<region>.amazonaws.com yarn smoke
```

## Frontend Apps
Dashboard (set API URL to enable health check UI):
```bash
cd frontend/dashboard
NEXT_PUBLIC_API_URL=https://xxxxx.execute-api.<region>.amazonaws.com yarn dev
```

Client Gallery:
```bash
cd frontend/gallery
yarn dev
```

## Development Notes
- API security: Cognito authorizer protects admin routes; health and webhook are public.
- Lambdas currently include stub handlers for quick end-to-end verification.
- Add real logic incrementally (payments, wallet, gallery CRUD, presign, zip, selections).

### Access Control Model (important)
- Photographers (Cognito-authenticated) may access only their own galleries:
  - Protected endpoints (e.g., `GET/DELETE /galleries/{id}`, `POST /uploads/presign`) verify `ownerId === sub` and return 403 if not.
  - `ownerId` is set on gallery creation from JWT `sub`.
- Clients (password link) may access only the specific gallery they were invited to:
  - Public gallery routes will validate the supplied gallery password (or owner preview token) scoped to that galleryId only.

Enforcement implemented now:
- `GET /galleries/{id}`: 403 if requester isn’t owner.
- `DELETE /galleries/{id}`: fetch, enforce owner match, then delete.
- `POST /uploads/presign`: fetch gallery, enforce owner match before issuing URL.

Planned next:
- Client password set/verify APIs and enforcement on public gallery endpoints.

## CI
GitHub Actions workflow `.github/workflows/ci.yml` installs deps, runs basic scripts, and lists workspaces. Extend with tests and CDK diff/deploy as needed.

## Troubleshooting
- Missing alpha package versions: CDK HTTP API L2 is in alpha; use a version range (already configured).
- Next.js “React in scope”: pages import React or use `.jsx` to avoid TS type dependency issues before installing types.

## Testing

See [docs/testing.md](docs/testing.md) for comprehensive testing instructions covering:
- Infrastructure deployment
- Frontend setup
- Authentication flow
- Gallery creation & wallet management
- Image upload & processing
- Client selection workflow
- Email notifications
- GDPR deletion
- API testing with curl

Quick test checklist:
- [ ] Deploy infrastructure (`cd infra && yarn deploy`)
- [ ] Configure frontend environment variables
- [ ] Create Cognito user and login
- [ ] Create gallery (with wallet top-up)
- [ ] Upload images and verify processing
- [ ] Test client gallery access
- [ ] Complete selection & approval flow
- [ ] Verify order creation and ZIP generation

## Roadmap (from plan)
- Phase 1: MVP – gallery creation/payment, uploads, selection flow, final delivery, emails. ✅
- Phase 2: Previews + CloudFront, upload/download progress, mobile responsive. ✅
- Phase 3: GDPR deletion, export to Google/Apple Photos. ✅ (Archive pending)
- Phase 4: Wallet, billing, referrals. ✅ (Referrals pending)
- Phase 5: Analytics, monitoring, testing, UI polish. ⏳

---
We will keep this README updated as new features and commands land. PRs should include README updates when behavior changes. 

