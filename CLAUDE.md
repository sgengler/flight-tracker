# gina-flights

## TypeScript

After every edit to TypeScript files, run a type check before considering the task complete:

```bash
cd server && npx tsc --noEmit
cd client && npx tsc --noEmit
```

Do not proceed if either command reports errors. Fix all type errors before moving on.

## Versioning and changelog

Whenever the user asks you to commit code, decide — without prompting — whether the change warrants a version bump and changelog entry. Use judgment; not every commit needs one.

**Bump and add an entry when the change is user-visible:** new features, UI/UX changes, bug fixes a user would notice, behavior changes (e.g. API usage limits, caching strategy that affects data freshness), endpoint additions/removals.

**Skip the bump when the change is invisible to users:** internal refactors with no behavior change, comment/doc-only edits, test-only changes, dependency bumps with no observable effect, code-style or formatting fixes.

**How to bump:**
1. Edit `client/src/changelog.ts` and add a new entry at the top of `CHANGELOG`.
2. Use semver-ish: `patch` (0.2.0 → 0.2.1) for fixes/small tweaks, `minor` (0.2.0 → 0.3.0) for new features or notable UX changes, `major` (0.x → 1.0) only when the user explicitly says so.
3. Use today's date in `YYYY-MM-DD` format.
4. Each `changes` bullet should be one short sentence describing the user-visible effect, not the implementation detail.
5. `APP_VERSION` is derived from the top entry — do not edit `version.ts`.
6. Include the changelog edit in the same commit as the change it describes.

If you're unsure whether a change is user-visible, lean toward bumping — a small extra entry is cheaper than a missing one.
