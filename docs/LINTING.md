# Linting & Code Quality Setup

This project uses industry-standard tools to catch issues early and maintain code quality.

## Tools Configured

### TypeScript
- **Strict mode enabled** - Catches type errors, null checks, and more
- **Additional checks** - Unused variables, implicit returns, fallthrough cases
- **Build-time validation** - Builds fail on TypeScript errors

### ESLint
- **Next.js recommended rules** - Best practices for Next.js
- **TypeScript ESLint** - Type-aware linting rules
- **Import ordering** - Automatic import organization
- **React hooks** - Ensures hooks are used correctly
- **Promise handling** - Catches unhandled promises and async issues

### Prettier
- **Code formatting** - Consistent code style
- **Auto-format on save** - VS Code integration

### Pre-commit Hooks (Husky)
- **Automatic linting** - Runs ESLint and Prettier before commits
- **Type checking** - Validates TypeScript before commits

## Available Scripts

```bash
# Run ESLint
npm run lint

# Fix ESLint issues automatically
npm run lint:fix

# Run strict ESLint (all files)
npm run lint:strict

# Type check only
npm run type-check

# Type check in watch mode
npm run type-check:watch

# Format all files with Prettier
npm run format

# Check if files are formatted
npm run format:check

# Run all validations (type-check + lint + format check)
npm run validate
```

## VS Code Integration

The `.vscode/settings.json` file configures:
- Format on save
- Auto-fix ESLint issues on save
- Organize imports on save
- Use workspace TypeScript version

Recommended extensions (auto-suggested):
- ESLint
- Prettier
- Tailwind CSS IntelliSense
- TypeScript and JavaScript Language Features

## What Gets Caught

### TypeScript
- ✅ Undefined variables (like missing imports)
- ✅ Type mismatches
- ✅ Null/undefined access
- ✅ Unused variables and parameters
- ✅ Missing return statements
- ✅ Implicit any types

### ESLint
- ✅ Unused imports
- ✅ Missing dependencies in useEffect/useMemo
- ✅ Unhandled promises
- ✅ Console.log statements (warns)
- ✅ Debugger statements
- ✅ Import ordering issues
- ✅ React hooks violations

### Prettier
- ✅ Inconsistent formatting
- ✅ Trailing whitespace
- ✅ Missing semicolons
- ✅ Quote style consistency

## Pre-commit Hooks

Before each commit, Husky automatically:
1. Runs ESLint on staged files
2. Fixes auto-fixable issues
3. Formats code with Prettier
4. Prevents commit if errors remain

## CI/CD Integration

The build process will:
- Fail if TypeScript errors exist
- Fail if ESLint errors exist
- Ensure code quality before deployment

## Troubleshooting

If you see errors after enabling strict mode:
1. Run `npm run lint:fix` to auto-fix issues
2. Run `npm run format` to format code
3. Fix remaining TypeScript errors manually
4. Use `// eslint-disable-next-line` sparingly and with comments explaining why

