# klinex

`klinex` is a Bun-powered OpenTUI dashboard for local HTTP/HTTPS dev servers.

It scans local TCP listeners, ranks likely dev servers first, probes them over HTTP/HTTPS, lets you open them in your browser, and gives you safe stop controls directly from the terminal.

## Features

- macOS and Linux support
- likely-dev-first view with a toggle for all local TCP listeners
- fuzzy search across host, port, process, command, and framework
- lightweight HTTP/HTTPS probing with title/status hints
- browser open on `Enter`
- stop actions for PID-only and process-tree modes
- permission-aware behavior with clear sudo guidance
- cyber-styled OpenTUI interface built on `@opentui/core`

## Requirements

- [Bun](https://bun.sh) `>= 1.3.3`
- macOS or Linux

`klinex` is published through npm, but v1 is Bun-runtime-only because OpenTUI is Bun-first today.

## Install

One-off usage:

```bash
bunx klinex
```

Global install:

```bash
bun add -g klinex
klinex
```

## Local Development

```bash
bun install
bun run dev
```

## Keybindings

- `Enter`: open selected server in the default browser
- `/`: focus fuzzy filter
- `Tab`: switch focus between list and filter
- `r`: refresh now
- `a`: toggle likely-dev-only vs all listeners
- `s`: cycle sort mode
- `x`: open stop dialog
- `q`: quit

Stop dialog actions:

- `TERM PID`: graceful stop for only the selected PID
- `KILL PID`: force stop for only the selected PID
- `TERM TREE`: graceful stop for the PID and its children
- `KILL TREE`: force stop for the PID and its children

## Permissions

When the current user cannot inspect or signal a process, `klinex` shows the listener but marks ownership as hidden.

If you need deeper inspection or stop controls for those listeners, relaunch the app with `sudo`.

## Scripts

```bash
bun run check
bun run test
bun run build
bun run ci
bun run package:dry-run
```

`bun run package:dry-run` validates the package tarball without writing it to disk.

If you later want to validate the actual registry publish flow, run `bun publish --dry-run` after authenticating with npm.

## Release

`klinex` is published to npm as a public package.

### Manual Publish

1. Ensure you are logged into npm:
   ```bash
   npm whoami
   ```
2. Bump the version in `package.json`.
3. Run release checks:
   ```bash
   bun install
   bun run ci
   bun run package:dry-run
   bun publish --dry-run
   ```
4. Publish:
   ```bash
   bun publish
   ```

### CI Publish

The recommended release path is GitHub Actions publishing from a semver tag.

1. Bump `package.json` to the intended release version.
2. Merge to `main`.
3. Create and push a matching tag:
   ```bash
   git tag v0.1.1
   git push origin v0.1.1
   ```
4. The publish workflow validates the version, runs CI, and publishes to npm.

### Requirements

- package name: `klinex`
- install target: npm registry
- runtime requirement: Bun
- repo target: `https://github.com/spencerjireh/klinex`
- npm access to the `klinex` package
- `NPM_TOKEN` configured in GitHub Actions for CI publishing

## License

MIT
