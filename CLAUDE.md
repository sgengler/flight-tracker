# gina-flights

## TypeScript

After every edit to TypeScript files, run a type check before considering the task complete:

```bash
cd server && npx tsc --noEmit
cd client && npx tsc --noEmit
```

Do not proceed if either command reports errors. Fix all type errors before moving on.
