# Changelog

## 0.1.2

### Breaking Changes

- `username` argument is now required for the `analyze` command (previously optional)

### Refactors

- Remove local-only analysis mode — `analyze` always fetches GitHub data now
- Remove unused imports (`getGhUsername`, `analyzeKnowledge`, `LocalProfile`)

## 0.1.1

### Fixes

- Update `VERSION` constant to match 0.1.1 release

### Docs

- Update README with current CLI features and configuration

### Refactors

- Replace `process.stderr.write` output with `ora` spinners and `chalk` styling in `git-log` and `scan-repos` commands
- Rewrite `publish` command to use `withSpinner` utility and display profile URL on success
- Move CLI entrypoint to `src/entrypoints/cli/index.ts`

## 0.1.0

- Initial release of the `topsignal` CLI
- Commands: `git-log`, `scan-repos`, `publish`
- GitHub authentication via `gh` token
- README with full CLI documentation
