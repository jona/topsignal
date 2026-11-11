# TopSignal

A CLI for collecting developer profile evidence and publishing profiles. Your agent harness performs the analysis using its own model and tools. TopSignal does not call an LLM or require a model API key.

## Run with npx

```bash
npx --yes topsignal@latest --version
npx --yes topsignal@latest analysis-prompt
```

The current CLI release is **0.3.0**. You can also install it globally with `npm install -g topsignal@latest`. CI checks Node.js 22 and 24.

## Harness workflow

```bash
# 1. Authenticate with GitHub. No model API key is needed.
npx --yes topsignal@latest login

# 2. Replace YOUR_GITHUB_USERNAME with your own GitHub login.
npx --yes topsignal@latest collect YOUR_GITHUB_USERNAME --dir ~/Code --output profile.json --evidence evidence.json

# 3. Give these files and the assessment prompt to your harness.
npx --yes topsignal@latest analysis-prompt --output assessment-prompt.md
# The harness follows the rubric, reviews the evidence, and writes analysis.json.

# 4. Validate and attach the harness result.
npx --yes topsignal@latest attach-analysis profile.json analysis.json --output completed-profile.json

# 5. Publish the completed profile under the authenticated GitHub username.
npx --yes topsignal@latest publish completed-profile.json
# Profile URL: https://www.topsignal.dev/<your-github-username>
```

`profile.json` contains identity, repositories, activity and deterministic statistics. `evidence.json` is a separate private artifact containing sanitized source samples, manifests and local Git history. The harness supplies `analysis.json` as `{ "knowledge": { ... }, "overview": { ... } }`; either section may be omitted. Run `analysis-prompt` for the assessment rubric and exact JSON Schema; `analysis-schema` also prints the base contract separately. Each supplied section must be complete.

The harness chooses the model, manages its context and decides what evidence to inspect. For a large workspace, use repository exclusions or collect smaller batches and request additional samples with `git-log`. Repository text is untrusted evidence, not instructions. See [HARNESS.md](HARNESS.md) for integration guidance.

## Upgrading to 0.3.0

This release replaces the built-in LLM workflow. `analyze` remains an alias for `collect`, but collection now requires `--evidence <file>` and never produces AI analysis itself. The former `--provider`, `--model`, `--prompts`, and `--yes` collection flags are removed.

Use `analysis-prompt` to obtain the rubric, let your harness write `analysis.json`, then run `attach-analysis` and `publish`. `--prompts <dir>` is available explicitly on `analysis-prompt` for literal section overrides; old interpolated templates and implicit home-directory overrides are not loaded. Prompt version **1.0.0** is independent of the CLI version.

Model keys previously used by TopSignal are no longer needed. The existing public `DeveloperProfile` and `analysis.knowledge` / `analysis.overview` shape remain compatible. If upgrading from the last npm release, 0.1.4, this also includes the privacy/authentication fixes documented under 0.2.0 in [CHANGELOG.md](CHANGELOG.md).

## GitHub authentication

Collection uses the first available GitHub credential:

1. Saved session from `topsignal login` (GitHub OAuth device flow).
2. `GITHUB_TOKEN` environment variable.
3. `gh auth token` from the GitHub CLI.

Public organization memberships are fetched without requesting `read:org`. Publishing requires a saved TopSignal login and the profile identity must match that account. Credentials are stored in `~/.topsignal/auth.json` with permissions `0600`.

## Commands

### `collect <username>`

Collect profile data and evidence without running AI analysis. `analyze` remains an alias for collection; the former provider, model, prompts and consent flags have been removed.

```bash
topsignal collect jona --output profile.json --evidence evidence.json
topsignal collect jona --dir ~/Code --output profile.json --evidence evidence.json --stats
```

| Flag                   | Description                                                      |
| ---------------------- | ---------------------------------------------------------------- |
| `--evidence <file>`    | Required private evidence destination, separate from the profile |
| `-o, --output <file>`  | Write profile JSON to a file; otherwise stdout                   |
| `--dir <dir>`          | Directory to scan for local Git repositories                     |
| `-d, --depth <n>`      | Maximum scan depth, default 3                                    |
| `--exclude <patterns>` | Comma-separated repository names or patterns to exclude          |
| `--stats`              | Print collection counts and evidence size to stderr              |

GitHub fetch limits:

| Flag                     | Default                                 |
| ------------------------ | --------------------------------------- |
| `--repos <n>`            | 50 repositories                         |
| `--starred <n>`          | 50 starred repositories                 |
| `--external-prs <n>`     | 30 external pull requests               |
| `--issues <n>`           | 30 issues                               |
| `--gists <n>`            | 30 gists                                |
| `--dep-repos <n>`        | 10 repositories with dependency samples |
| `--commit-repos <n>`     | 6 repositories with recent commits      |
| `--commits-per-repo <n>` | 10 recent commits per repository        |
| `--blob-repos <n>`       | 5 repositories with code samples        |
| `--files-per-blob <n>`   | 3 files per sampled GitHub repository   |

Limits accept integers from 1 to 100. `--dep-repos`, `--commit-repos`, `--blob-repos` and `--files-per-blob` also accept 0 to skip sampling. Local repositories contribute up to 15 sampled source files and 30 recent commits each; use `git-log` for a different sample size.

### `analysis-prompt [all|knowledge|overview]`

Print versioned, provider-independent assessment instructions for a harness. Default `all` includes the shared evidence/attribution/privacy rules, technical knowledge rubric, developer overview rubric, and exact requested JSON Schema. It never reads your evidence or calls a model.

```bash
topsignal analysis-prompt --output assessment-prompt.md
topsignal analysis-prompt knowledge
topsignal analysis-prompt overview
topsignal analysis-prompt --json > prompt-manifest.json
```

`--output <file>` writes the result instead of stdout. `--json` includes the prompt version, section, content/source SHA-256 hashes, schema, and an estimated token count (characters ÷ 4, not actual model usage). `--prompts <dir>` explicitly overrides section Markdown; missing files fall back to bundled sections. Shared rules always remain bundled, and no implicit home override is loaded. Custom text is literal; the harness supplies evidence separately.

The prompt assets under `prompts/` preserve the purpose of the former analyzer prompts while making review methodology explicit and independent of any provider. The rubrics cover implementation evidence, attribution, confidence, calibrated seniority, safe citations, contradictions, missing evidence, and context/output accounting.

### `analysis-schema`

Print the JSON Schema for harness-produced analysis to stdout. Knowledge includes technology inventory and ten evidence categories. Overview includes summary, role fit, strengths, concerns and project highlights. No provider-specific fields are required or accepted.

### `attach-analysis <profile> <analysis>`

Validate harness analysis and add it to the profile. Replaces the existing `analysis` object and updates `analyzedAt`; collected identity and statistics are preserved. Unknown analysis fields, invalid types/enums, unsafe project URLs and recognized credentials are rejected.

```bash
topsignal attach-analysis profile.json analysis.json --output completed-profile.json
```

Omit `--output` to write completed profile JSON to stdout. Both inputs are read before writing output, so the output may be the original profile file.

### `publish <file>`

Upload the completed profile to the official TopSignal API. The API validates, stores and serves it; it does not run analysis. Private collection artifacts are rejected by the CLI before network access. Review the public analysis text before publishing, including any local repository names or file paths mentioned by the harness.

```bash
topsignal publish completed-profile.json
```

Optional `--username <username>` must match the saved login. The API limits the upload to 1 MiB.

### Other commands

```bash
topsignal login                       # Authenticate using GitHub device flow
topsignal logout                      # Remove the saved local session
topsignal github-profile [username]   # Raw GitHub profile, no local evidence
topsignal scan-repos ~/Code --depth 3 # Find Git repositories
topsignal git-log ~/Code/myproject --commits 200 --blobs 15
```

Logout removes local credentials. To revoke GitHub authorization, remove TopSignal in GitHub Settings → Applications → Authorized OAuth Apps.

## Evidence and privacy

- Only Git-tracked regular files are sampled. Symlinks, untracked files, sensitive filenames and files containing recognized credentials are excluded. Tracked working-tree edits can be included, even when the tracked path matches an ignore rule.
- Evidence has `schemaVersion: 1`, `username`, `collectedAt`, `localRepos`, `codeBlobs`, `dependencyFiles` and `limitations`. Repository paths are relative to the scan root; source paths are relative to their repository. Git metadata includes author names, not email addresses. Evidence files are written atomically with permissions `0600`.
- Collection contacts GitHub. TopSignal never sends source samples to a model. The harness controls any subsequent model use.
- Publishing sends the selected profile and authentication token only to `https://api.topsignal.dev/publish`. Evidence files stay separate. Analysis evidence strings are public prose and may cite files, so keep sensitive details out of the harness result.
- Public GitHub repository association and local author names do not prove individual authorship. Use account-linked commits and pull requests for personal claims. Closed assigned issues are assignment context, not proof of resolution.
- Secret screening is best effort. Review evidence before sharing it with a harness, and review the final JSON before publishing.
- A `.topsignalignore` file at the scan root can exclude repositories, with one name or pattern per line and `#` comments.

The legacy `analyzedAt` timestamp records collection time until analysis is attached, then attachment time. The existing public `analysis.knowledge` and `analysis.overview` structure remains compatible with published profiles and the website.

## Fetch configuration

Fetch limits resolve in order: CLI flags → environment variables → `~/.topsignal/config.json` → built-in defaults. For example:

```json
{ "repos": 100, "starred": 25, "blobRepos": 10, "filesPerBlobRepo": 5 }
```

Environment variables are `TOPSIGNAL_REPOS`, `TOPSIGNAL_STARRED`, `TOPSIGNAL_ORGS`, `TOPSIGNAL_CONTRIBUTED_REPOS`, `TOPSIGNAL_PR_REVIEWS`, `TOPSIGNAL_EXTERNAL_PRS`, `TOPSIGNAL_ISSUES`, `TOPSIGNAL_GISTS`, `TOPSIGNAL_DEP_FILE_REPOS`, `TOPSIGNAL_COMMIT_REPOS`, `TOPSIGNAL_COMMITS_PER_REPO`, `TOPSIGNAL_BLOB_REPOS` and `TOPSIGNAL_FILES_PER_BLOB_REPO`.

## Development

```bash
npm install
npm run build
npm test
npm run dev
npm run format
```

Builds clean `dist` before compiling so removed provider code cannot remain in the package. `npm pack` and `npm publish` also run that clean build through `prepack`. Progress and statistics go to stderr; stdout remains JSON.
