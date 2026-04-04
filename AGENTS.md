# AGENTS.md

This file is for coding agents working in `klinex`.

## Project Snapshot
- Runtime: Bun `>=1.3.3`
- Language: TypeScript with `strict` mode enabled
- Package manager: `bun`
- App type: terminal UI for discovering and controlling local dev servers
- Supported platforms: macOS and Linux
- Main dependency: `@opentui/core`
- CI runs typecheck, tests, and build on Ubuntu

## Instruction Sources
- `AGENTS.md` is the sole repo-local agent instruction file
- No `.cursorrules` file was found
- No `.cursor/rules/` directory was found
- No `.github/copilot-instructions.md` file was found
- If new Cursor or Copilot rules are added later, fold them into this file

## Important Paths
- `bin/klinex`: Bun executable entrypoint
- `index.ts`: top-level runtime entrypoint
- `src/index.ts`: `main()` bootstrapping
- `src/app.ts`: primary OpenTUI app and UI orchestration
- `src/discovery.ts`: listener discovery, heuristics, and entry construction
- `src/parse.ts`: parser helpers for `lsof`, `ss`, `ps`, and HTML titles
- `src/filter.ts`: fuzzy filtering and sort behavior
- `src/probe.ts`: HTTP/HTTPS probing logic
- `src/actions.ts`: browser-open and process-stop actions
- `src/process-tree.ts`: process tree resolution
- `src/types.ts`: shared domain types
- `src/*.test.ts`: colocated Bun tests

## Install
```bash
bun install
```
Use Bun for everything in this repo.
- Prefer `bun run <script>` over npm, pnpm, or yarn equivalents
- Prefer `bun test` over Jest or Vitest commands
- Prefer `bun build` over custom bundler wrappers unless the repo already defines a script
- Bun automatically loads `.env`; do not add `dotenv` unless the repo explicitly adopts it

## Commands
```bash
bun run dev
bun run start
bun run check
bun run test
bun run build
bun run ci
bun run pack
bun run package:dry-run
```
- `bun run dev` and `bun run start` both execute `bun run index.ts`
- `bun run check` runs `bun x tsc --noEmit`
- `bun run test` runs `bun test`
- `bun run build` runs `bun build ./index.ts --target bun --outdir dist`
- `bun run ci` runs typecheck, tests, then build
- There is no ESLint, Biome, or Prettier config; TypeScript typecheck is the lint-equivalent gate
Single-test commands:
```bash
bun test src/filter.test.ts
bun test src/filter.test.ts --test-name-pattern "cycleSortMode"
bun test --test-name-pattern "normalizeHost|formatUrl"
```
- Positional arguments are file patterns
- `--test-name-pattern` filters test names, not filenames
- Test files should follow Bun conventions such as `*.test.ts`

## Validation Expectations
- For logic changes, run the nearest relevant `src/*.test.ts` file first
- Before finishing substantial work, run `bun run check` and `bun run test`
- Run `bun run build` when entrypoints, packaging, or bundling behavior changes
- If CLI startup or publish surface changes, run `bun run ci`

## Code Style
### Imports
- Use ESM imports everywhere
- Keep external imports before local imports
- Use `import type` for type-only imports
- Keep local import paths explicit, including the `.ts` extension
- Prefer named exports; source modules do not use default exports
- Split dense imports across multiple lines instead of cramming them

### Formatting
- Use 2-space indentation
- Use semicolons
- Use double quotes
- Keep trailing commas in multiline literals and calls
- Prefer readable multiline objects and arrays over compressed one-liners
- Use numeric separators for large literals when helpful, e.g. `5_000`

### Types
- Preserve strict TypeScript compatibility
- Add explicit return types to exported functions
- Use interfaces for shared object shapes
- Use string-literal unions for closed state and mode sets
- Avoid `any`
- Avoid unnecessary type assertions
- Use `null` for explicit absence in domain state when the value is expected but unavailable
- Use optional properties only when a field is genuinely absent from the shape
- Prefer narrow type predicates in filters such as `(pid): pid is number => pid !== null`

### Naming
- Use `camelCase` for variables, functions, methods, and helpers
- Use `PascalCase` for interfaces, types, and classes
- Use `UPPER_SNAKE_CASE` for top-level constants
- Name functions with verbs, e.g. `discoverServers`, `resolveProcessTree`
- Name booleans as predicates when possible, e.g. `isLikelyDev`, `ownerKnown`
- Keep test names descriptive and behavior-focused

### Control Flow
- Prefer early returns over deep nesting
- Keep helpers small and single-purpose
- Use `switch` for closed unions when it improves exhaustiveness
- Do not rely on switch fallthrough; `tsconfig` forbids it
- Prefer `Map` and `Set` for keyed lookups and deduplication
- Preserve deterministic ordering when sorting or merging collections

### Error Handling
- Treat expected operational failures as data, not exceptional control flow
- Return structured result objects for recoverable failures, e.g. `ActionResult`, `CommandResult`
- Reserve throwing for truly unexpected failures
- In `catch` blocks, treat the error as `unknown`
- Convert caught errors with `error instanceof Error ? error.message : String(error)`
- Include context flags when useful, e.g. `permissionDenied`, `stillRunning`
- Favor user-facing error messages that explain the recovery path

### Runtime And Platform
- Prefer Bun APIs already used here: `Bun.which`, `Bun.spawn`, `Bun.sleep`
- Prefer built-in `fetch` and `AbortSignal.timeout()` for probes
- Do not introduce Express, Vite, Jest, Vitest, or dotenv here
- Use Node built-ins only when Bun does not already provide the needed API
- Keep macOS and Linux behavior explicit when command paths or process inspection differ

### Data Modeling
- Keep shared domain models centralized in `src/types.ts`
- Normalize external command output before constructing domain objects
- Preserve previous entry state across refreshes when that state is still valid
- Prefer immutable return values at module boundaries, even if local accumulators mutate internally
- When merging listeners, preserve stable IDs and stable selection behavior

### Testing Style
- Use `import { expect, test } from "bun:test"`
- Keep tests next to the module they cover
- Prefer focused unit tests over large integration fixtures
- Build fixtures inline when they stay readable
- Assert exact parsed structures for parser code
- Add regression tests for fixes in filtering, parsing, discovery, process-tree, or probe logic

## Repository-Specific Notes
- This repo is Bun-first; do not swap in Node-oriented tooling without a clear reason
- Preserve the current explicit `.ts` import style because `tsconfig.json` enables it
- Maintain compatibility with both macOS and Linux
- The app discovers local listeners, probes HTTP/HTTPS, opens URLs, and can stop PIDs or process trees
- Favor minimal changes that fit the current module layout over new abstractions

## Editing Guidance
- Start in the module that already owns the behavior instead of adding new files by default
- Update colocated tests when behavior changes
- Keep public behavior and CLI ergonomics aligned with `README.md`
- If new agent, Cursor, or Copilot instruction files are added later, update this file too
