# Changelog

## 0.2.0

### Privacy & Security

- Send authenticated publishes to the official TopSignal HTTPS endpoint and reject redirects. The profile identity must match the saved GitHub login.
- Limit local scans to Git-tracked regular files within the selected directory. Include GitHub repository content and review repository names only for public repos.
- Screen source, manifests, and prompt metadata for credentials before sending them to the AI provider. Press `v` at the consent prompt to preview the exact prompts.
- Use the saved GitHub login for profile reads and look up the account with the selected token. Store credentials atomically with restrictive permissions and report logout failures.
- Update Ink's `ws` dependency to `8.22.2` to resolve two security advisories.

### Fixes

- Handle repos with no push date, attribute commit evidence to the selected GitHub account, and validate the AI overview before exporting it.
- Match local clones with their GitHub repos by origin while keeping unrelated repos with the same name distinct.
- Validate CLI and fetch limits, correct the first commit date in `git-log`, and repair `npm start`.
- Add offline regression tests and run them in GitHub Actions on Node 22 and 24.

### Breaking Changes

- `TOPSIGNAL_PUBLISH_URL` no longer overrides the publish endpoint.
- Use `closedAssignedIssues` for closed issues assigned to the account. The legacy `issuesResolved` field is empty because assignment does not establish who resolved an issue.
- `analyze` and `github-profile` prefer the saved TopSignal login over `GITHUB_TOKEN`. Remove the saved login with `topsignal logout` to use an environment or GitHub CLI token.

## 0.1.4

### Features

- Add `login` command — authenticate with GitHub via OAuth device flow
- Add `logout` command — remove stored GitHub credentials
- Add GitHub OAuth device flow module with polling, token persistence (`~/.topsignal/auth.json`), and file-level permissions (0600)
- Update `publish` command to use stored auth instead of `gh` CLI token

### Breaking Changes

- `publish` now requires `topsignal login` instead of relying on `GH_TOKEN` or `gh auth token`

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
