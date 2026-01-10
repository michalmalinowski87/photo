# Development Setup

## Catching Build Errors During Development

By default, `yarn dev` doesn't run the same strict checks as `yarn build`. To catch errors early:

### Option 1: Run Checks Before Dev (Recommended)

```bash
yarn dev:check
```

This runs TypeScript type checking and ESLint before starting the dev server. If there are errors, the dev server won't start.

### Option 2: Watch Mode (Best for Active Development)

Run in two terminals:

```bash
# Terminal 1: Type checking in watch mode
yarn dev:watch

# Terminal 2: Dev server
yarn dev
```

This runs TypeScript type checking in watch mode. You'll see type errors in the terminal as you code, while the dev server runs separately.

### Option 3: Standard Dev (Fastest, but may miss errors)

```bash
yarn dev
```

Next.js will show TypeScript errors in the browser overlay, but ESLint warnings may not be visible until build time.

## Available Scripts

- `yarn dev` - Start Next.js dev server (fast, but may miss some errors)
- `yarn dev:check` - Run type-check + lint, then start dev server
- `yarn dev:watch` - Run type-check in watch mode + dev server simultaneously
- `yarn build` - Production build (runs all checks)
- `yarn type-check` - Run TypeScript type checking
- `yarn type-check:watch` - Run TypeScript type checking in watch mode
- `yarn lint` - Run ESLint
- `yarn validate` - Run all checks (type-check + lint + format check)

## Why Build Catches Errors But Dev Doesn't?

1. **TypeScript**: Dev mode shows errors in browser overlay, but build runs stricter checks
2. **ESLint**: Dev mode doesn't run ESLint by default, only during build
3. **Type Checking**: Dev mode uses faster, less strict type checking

## Recommended Workflow

1. **During active development**: Use `yarn dev:watch` to catch errors as you type
2. **Before committing**: Run `yarn validate` to ensure everything passes
3. **Before deploying**: Always run `yarn build` to catch any remaining issues
