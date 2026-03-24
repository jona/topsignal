# topsignal

Analyze a developer's code locally using your own LLM API key. Scans local git repositories, optionally pulls public GitHub profile data, and produces a structured JSON profile with language stats, contribution data, and AI-generated analysis — without sending your code to any third-party service.

## Install

```bash
npx topsignal <command>
```

Or install globally:

```bash
npm install -g topsignal
```

## Auth

**GitHub** (required only when using `--username`) — uses the first available source:

1. `GITHUB_TOKEN` environment variable
2. `gh auth token` (zero-config if you have the [GitHub CLI](https://cli.github.com/) installed)

**LLM** — auto-detects from environment:

- `ANTHROPIC_API_KEY` → uses Claude
- `OPENAI_API_KEY` → uses OpenAI

If no LLM key is found, the tool still runs and returns raw profile data without AI analysis.

## Commands

### `analyze [username]`

Scans a local directory for git repositories and runs AI analysis. Pass a GitHub username to also fetch public GitHub profile data.

```bash
# Local only — no GitHub required
topsignal analyze

# Local + GitHub
topsignal analyze torvalds

# With options
topsignal analyze torvalds --dir ~/Code --output profile.json --depth 5
```

| Flag | Description |
|---|---|
| `--dir <dir>` | Directory to scan for git repositories (defaults to cwd) |
| `-p, --provider <name>` | `anthropic` or `openai` |
| `-m, --model <model>` | Override the default model |
| `-o, --output <file>` | Write JSON to a file instead of stdout |
| `-d, --depth <n>` | Max directory depth to scan (default: `3`) |
| `--prompts <dir>` | Directory with custom prompt templates |
| `--stats` | Print analysis statistics after completion |

**Without `--username`** — outputs a `LocalProfile` with per-repo git history, authors, branches, dependency files, and AI knowledge analysis.

**With `--username`** — outputs a full `DeveloperProfile` combining GitHub data with local code blobs from repos not already fetched via the API.

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

| Flag | Description |
|---|---|
| `-d, --depth <n>` | Max directory depth to scan (default: `3`) |

---

### `git-log <repo-path>`

Analyze a single local git repository and print structured commit/file data.

```bash
topsignal git-log ~/Code/myproject
topsignal git-log ~/Code/myproject --commits 500 --blobs 30
```

| Flag | Description |
|---|---|
| `-n, --commits <n>` | Max commits to retrieve (default: `200`) |
| `-b, --blobs <n>` | Max code files to read (default: `15`) |

---

### `publish <file>`

Publish a profile JSON to the TopSignal API.

```bash
topsignal publish profile.json
topsignal publish profile.json --username torvalds
```

| Flag | Description |
|---|---|
| `-u, --username <username>` | Username to publish as |

## Output shape

**Local-only** (`analyze <dir>`) outputs a `LocalProfile`:

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

**With `--username`** outputs a full `DeveloperProfile`:

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

## Custom prompts

Override the default LLM prompts by placing Markdown files in `~/.topsignal/prompts/`:

- `knowledge.md` — prompt for the tech stack / knowledge analysis
- `overview.md` — prompt for the executive summary / seniority analysis

Templates support `{{variable}}` interpolation. Pass a different directory with `--prompts <dir>`.

## Development

```bash
npm install
npm run build      # compile TypeScript
npm run dev        # watch mode
npm run format     # prettier
```
