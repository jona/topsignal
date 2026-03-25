# TopSignal

Your dev profile backed by code. Open source, privacy-first and yours to customize.

## Install

```bash
npx topsignal <command>
```

Or install globally:

```bash
npm install -g topsignal
```

## Auth

**GitHub** (required for `publish` and when passing a username to `analyze` or `github-profile`) — uses the first available source:

1. `GITHUB_TOKEN` environment variable
2. `gh auth token` (zero-config if you have the [GitHub CLI](https://cli.github.com/) installed)

**LLM** — auto-detects from environment:

- `ANTHROPIC_API_KEY` → Claude (default model: `claude-sonnet-4-6`)
- `OPENAI_API_KEY` → OpenAI (default model: `gpt-4o`)

If no LLM key is found, the tool still runs and returns raw profile data without AI analysis.

## Commands

### `analyze [username]`

Scans a local directory for git repositories and runs AI analysis. Pass a GitHub username to also fetch public GitHub profile data.

```bash
# Local only — no GitHub required
topsignal analyze --dir ~/Code

# Local + GitHub
topsignal analyze torvalds --dir ~/Code

# With options
topsignal analyze torvalds --dir ~/Code --output profile.json --depth 5 --stats
```

| Flag                    | Description                                                          |
| ----------------------- | -------------------------------------------------------------------- |
| `--dir <dir>`           | Directory to scan for git repositories (defaults to cwd)             |
| `-p, --provider <name>` | `anthropic` or `openai`                                              |
| `-m, --model <model>`   | Override the default model                                           |
| `-o, --output <file>`   | Write JSON to a file instead of stdout                               |
| `-d, --depth <n>`       | Max directory depth to scan (default: `3`)                           |
| `--prompts <dir>`       | Directory with custom prompt templates                               |
| `--stats`               | Print a rich statistics panel after completion (see [Stats](#stats)) |

**GitHub fetching limits** — control how much data is pulled from GitHub when a username is provided:

| Flag                     | Description                          | Default |
| ------------------------ | ------------------------------------ | ------- |
| `--repos <n>`            | Max repos to fetch                   | `50`    |
| `--starred <n>`          | Max starred repos to fetch           | `50`    |
| `--external-prs <n>`     | Max external PRs to fetch            | `30`    |
| `--issues <n>`           | Max issues to fetch                  | `30`    |
| `--gists <n>`            | Max gists to fetch                   | `30`    |
| `--dep-repos <n>`        | Repos to fetch dependency files from | `10`    |
| `--commit-repos <n>`     | Repos to fetch recent commits from   | `6`     |
| `--commits-per-repo <n>` | Commits to fetch per repo            | `10`    |
| `--blob-repos <n>`       | Repos to sample code blobs from      | `5`     |
| `--files-per-blob <n>`   | Code files to fetch per blob repo    | `3`     |

These limits can also be set via environment variables or a config file (see [Configuration](#configuration)).

**Without a username** — outputs a `LocalProfile` with per-repo git history, authors, branches, dependency files, and AI knowledge analysis.

**With a username** — outputs a full `DeveloperProfile` combining GitHub data with local code blobs from repos not already fetched via the API.

Progress messages go to stderr; JSON output goes to stdout.

---

### `github-profile [username]`

Fetch raw GitHub profile data without running AI analysis.

```bash
topsignal github-profile
topsignal github-profile torvalds
```

---

### `scan-repos [dir]`

Find git repositories under a directory.

```bash
topsignal scan-repos ~/Code
topsignal scan-repos --depth 5
```

| Flag              | Description                                |
| ----------------- | ------------------------------------------ |
| `-d, --depth <n>` | Max directory depth to scan (default: `3`) |

---

### `git-log <repo-path>`

Analyze a single local git repository and print structured commit/file data.

```bash
topsignal git-log ~/Code/myproject
topsignal git-log ~/Code/myproject --commits 500 --blobs 30
```

| Flag                | Description                              |
| ------------------- | ---------------------------------------- |
| `-n, --commits <n>` | Max commits to retrieve (default: `200`) |
| `-b, --blobs <n>`   | Max code files to read (default: `15`)   |

---

### `publish <file>`

Publish a profile JSON to the TopSignal API. On success, prints the public profile URL.

```bash
topsignal publish profile.json
topsignal publish profile.json --username torvalds
# ✔ Profile URL: https://www.topsignal.dev/torvalds
```

| Flag                        | Description                                                         |
| --------------------------- | ------------------------------------------------------------------- |
| `-u, --username <username>` | Username to publish as (auto-detected from GitHub token if omitted) |

## Output shape

**Local-only** (`analyze --dir <dir>`) outputs a `LocalProfile`:

```jsonc
{
  "dir": "/Users/you/Code",
  "repos": [
    {
      "name": "myproject",
      "path": "/Users/you/Code/myproject",
      "remote": "git@github.com:you/myproject.git",
      "totalCommits": 312,
      "firstCommitDate": "2023-01-15T...",
      "lastCommitDate": "2025-03-20T...",
      "authors": [{ "name": "You", "commits": 310 }],
      "branches": [...],
      "commits": [...],
      "dependencyFiles": { "packageJson": "...", ... },
      "codeBlobs": [...]
    }
  ],
  "analysis": {
    "knowledge": { "techStack": [...], "architecturePatterns": [...], ... }
  },
  "analyzedAt": "2025-01-01T00:00:00.000Z"
}
```

**With a username** outputs a full `DeveloperProfile`:

```jsonc
{
  "identity": { "username": "...", "followers": 0, ... },
  "repos": [...],
  "languageStats": { "ranked": [...], "topLanguages": [...] },
  "superlatives": { "mostStarredRepo": "...", ... },
  "contributionCounts": { "totalCommits": 0, ... },
  "analysis": {
    "knowledge": {
      "techStack": [...],
      "architecturePatterns": [...],
      "csFundamentals": [...],
      ...
    },
    "overview": {
      "executiveSummary": "...",
      "seniorityLevel": "senior",
      "roleFit": { "primary": "...", "environment": "startup" },
      "strengths": [...],
      "standoutProjects": [...],
      "hiringRecommendation": "..."
    }
  },
  "analyzedAt": "2025-01-01T00:00:00.000Z"
}
```

## Stats

Pass `--stats` to the `analyze` command to display a terminal panel (rendered with [Ink](https://github.com/vadimdemedes/ink)) showing:

- **Remote repos** and **local repos** included in the analysis, with per-repo file counts
- **Code files** — total files analyzed, character counts, smallest/largest files
- **Language breakdown** — bar chart of languages by file count
- **Prompt estimate** — total input characters and estimated token count

Stats are printed to stderr so they don't interfere with JSON output.

## Configuration

### Custom prompts

Override the default LLM prompts by placing Markdown files in `~/.topsignal/prompts/`:

- `knowledge.md` — prompt for the tech stack / knowledge analysis
- `overview.md` — prompt for the executive summary / seniority analysis

Templates support `{{variable}}` interpolation. Pass a different directory with `--prompts <dir>`.

### Fetch limits

GitHub fetching limits are resolved in this order (highest priority first):

1. **CLI flags** (`--repos`, `--starred`, etc.)
2. **Environment variables** (`TOPSIGNAL_REPOS`, `TOPSIGNAL_STARRED`, etc.)
3. **Config file** at `~/.topsignal/config.json`
4. **Built-in defaults**

The config file is a JSON object with the same keys as the `FetchLimits` interface:

```json
{
  "repos": 100,
  "starred": 25,
  "blobRepos": 10,
  "filesPerBlobRepo": 5
}
```

Full list of environment variables:

| Variable                        | Limit                       |
| ------------------------------- | --------------------------- |
| `TOPSIGNAL_REPOS`               | Repositories to fetch       |
| `TOPSIGNAL_STARRED`             | Starred repositories        |
| `TOPSIGNAL_ORGS`                | Organizations               |
| `TOPSIGNAL_CONTRIBUTED_REPOS`   | Contributed-to repositories |
| `TOPSIGNAL_PR_REVIEWS`          | PR review contributions     |
| `TOPSIGNAL_EXTERNAL_PRS`        | External PRs                |
| `TOPSIGNAL_ISSUES`              | Issues                      |
| `TOPSIGNAL_GISTS`               | Gists                       |
| `TOPSIGNAL_DEP_FILE_REPOS`      | Repos for dependency files  |
| `TOPSIGNAL_COMMIT_REPOS`        | Repos for recent commits    |
| `TOPSIGNAL_COMMITS_PER_REPO`    | Commits per repo            |
| `TOPSIGNAL_BLOB_REPOS`          | Repos for code blobs        |
| `TOPSIGNAL_FILES_PER_BLOB_REPO` | Files per blob repo         |

## Development

```bash
npm install
npm run build      # compile TypeScript
npm run dev        # watch mode
npm run format     # prettier
```
