# Changelog

## 0.1.3

### Privacy & Security

- Add content-level secret scanning for code blobs — redacts API keys, private keys, connection strings, JWTs, and hardcoded passwords before sending to LLMs
- Sanitize dependency files before LLM transmission — strip `author`/`contributors`/`publishConfig` from package.json, redact secret ARG/ENV from Dockerfiles and docker-compose.yml
- Sanitize git remote URLs to strip embedded credentials (e.g. `https://token@github.com/...`)
- Add sensitive-file exclusion patterns to GitHub blob fetcher (`.env`, `credentials`, `.pem`, `.key`, `.npmrc`, `.pypirc`, etc.)
- Strip absolute filesystem paths from local repo entries in output JSON
- Add user consent prompt before sending data to LLM APIs — displays summary and requires confirmation (skip with `--yes`/`-y`)
- List each repo by name in consent prompt, labeled as GitHub or Local
- Refine `/token/i` file exclusion to avoid false positives on files like `tokenizer.ts`; add `.npmrc`, `.pypirc`, `application.yml`, `application.properties`, `local_settings.py` to exclusions

### Features

- Add `.topsignalignore` file support — place in the scan root to exclude repos by name or glob pattern
- Add `--exclude <patterns>` CLI flag for comma-separated repo exclusion patterns
- Add `--yes`/`-y` CLI flag to skip the LLM consent prompt

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
