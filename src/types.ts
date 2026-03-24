// ─── GitHub Data Types ───────────────────────────────────────────────────────

export interface GithubUser {
  login: string;
  name: string | null;
  bio: string | null;
  location: string | null;
  company: string | null;
  blog: string | null;
  avatar_url: string;
  html_url: string;
  followers: number;
  following: number;
  public_repos: number;
  public_gists: number;
  created_at: string;
  hireable: boolean | null;
}

export interface GithubRepo {
  name: string;
  full_name: string;
  description: string | null;
  html_url: string;
  homepage: string | null;
  language: string | null;
  stargazers_count: number;
  forks_count: number;
  watchers_count: number;
  fork: boolean;
  topics: string[];
  pushed_at: string;
  created_at: string;
  updated_at: string;
  size: number;
  open_issues_count: number;
  default_branch: string;
  owner: { login: string };
}

export interface GithubCommit {
  sha: string;
  commit: {
    message: string;
    author: { name: string; date: string };
  };
  html_url: string;
  author: { login: string } | null;
}

export interface GithubGist {
  id: string;
  description: string | null;
  html_url: string;
  public: boolean;
  created_at: string;
  updated_at: string;
  comments: number;
  files: Record<
    string,
    { filename: string; language: string | null; size: number }
  >;
}

export interface GithubStarredRepo {
  name: string;
  full_name: string;
  description: string | null;
  language: string | null;
  topics: string[];
  stargazers_count: number;
}

export interface GithubOrganization {
  login: string;
  name: string | null;
  description: string | null;
  url: string;
  avatarUrl: string;
  memberCount: number;
}

export interface GithubSocialAccount {
  provider: string;
  url: string;
  displayName: string;
}

export interface GithubContributedRepo {
  fullName: string;
  description: string | null;
  url: string;
  language: string | null;
  stars: number;
  forks: number;
  isOrg: boolean;
  owner: string;
}

export interface MappedIssue {
  title: string;
  url: string;
  repo: string;
  state: string;
  createdAt: string;
  closedAt?: string;
  comments: number;
  labels: string[];
  merged?: boolean;
  additions?: number;
  deletions?: number;
  changedFiles?: number;
  reviewDecision?: string;
}

export interface RepoDependencyData {
  repoName: string;
  packageJson: string | null;
  pyproject: string | null;
  requirements: string | null;
  goMod: string | null;
  cargoToml: string | null;
  gemfile: string | null;
  composerJson: string | null;
  readme: string | null;
  dockerfile: string | null;
  dockerCompose: string | null;
  openapi: string | null;
  securityMd: string | null;
  changelogMd: string | null;
  hasTestsDir: boolean;
  hasTestDir: boolean;
  hasSpecDir: boolean;
  hasWorkflows: boolean;
  hasProtoDir: boolean;
  hasDocsDir: boolean;
}

export interface CodeBlob {
  repoName: string;
  path: string;
  language: string;
  content: string;
}

// ─── Wave Data (fetcher output) ─────────────────────────────────────────────

export interface Wave1Data {
  user: GithubUser;
  repos: GithubRepo[];
  repoLanguageMap: Map<string, Record<string, number>>;
  gists: GithubGist[];
  starred: GithubStarredRepo[];
  organizations: GithubOrganization[];
  socialAccounts: GithubSocialAccount[];
  contributedRepos: GithubContributedRepo[];
  sponsorship: {
    hasListing: boolean;
    sponsorCount: number;
    sponsoringCount: number;
  };
  pinnedRepos: {
    name: string;
    fullName: string;
    description: string | null;
    language: string | null;
    stars: number;
    topics: string[];
  }[];
  contributionCalendar: {
    weeks: { days: { date: string; count: number }[] }[];
  };
  contributionCounts: {
    totalCommits: number;
    totalPRReviews: number;
    totalIssues: number;
    totalPRs: number;
  };
  codeReviews: {
    count: number;
    recent: { repo: string; submittedAt: string }[];
  };
  externalPRs: MappedIssue[];
  issuesOpened: MappedIssue[];
  issuesResolved: MappedIssue[];
}

export interface Wave2Data {
  repoCommitMap: Map<string, GithubCommit[]>;
  profileReadme: string | null;
  dependencyFiles: RepoDependencyData[];
  codeBlobs: CodeBlob[];
}

// ─── Commit Info (transformed) ──────────────────────────────────────────────

export interface CommitInfo {
  sha: string;
  message: string;
  date: string;
  url: string;
  author?: string;
}

// ─── Output Types ───────────────────────────────────────────────────────────

export interface DeveloperIdentity {
  username: string;
  name?: string;
  bio?: string;
  location?: string;
  company?: string;
  blog?: string;
  avatarUrl: string;
  profileUrl: string;
  followers: number;
  following: number;
  publicRepos: number;
  publicGists: number;
  createdAt: string;
  hireable?: boolean;
  organizations: GithubOrganization[];
  socialAccounts: GithubSocialAccount[];
  sponsorship: Wave1Data["sponsorship"];
}

export interface LanguageRank {
  language: string;
  bytes: number;
  repoCount: number;
  percentage: number;
  lastUsed?: string;
}

export interface LanguageStats {
  all: Record<string, number>;
  ranked: LanguageRank[];
  mostUsed?: string;
  leastUsed?: string;
  mostRecent?: string;
  leastRecent?: string;
  primaryLanguage?: string;
  topLanguages: { name: string; percentage: number }[];
}

export interface Superlatives {
  mostUsedLanguage?: string;
  leastUsedLanguage?: string;
  mostRecentLanguage?: string;
  leastRecentLanguage?: string;
  mostStarredRepo?: string;
  mostForkedRepo?: string;
  oldestRepo?: string;
  newestRepo?: string;
  mostActiveRepo?: string;
  largestRepo?: string;
}

export interface MappedRepo {
  name: string;
  fullName: string;
  description?: string;
  url: string;
  homepage?: string;
  language?: string;
  languages: Record<string, number>;
  stars: number;
  forks: number;
  watchers: number;
  isForked: boolean;
  isFork: boolean;
  topics: string[];
  lastCommitAt: string;
  createdAt: string;
  updatedAt: string;
  size: number;
  openIssues: number;
  defaultBranch: string;
  recentCommits: CommitInfo[];
  detectedPatterns: string[];
  detectedFrameworks: string[];
}

export interface MappedGist {
  id: string;
  description?: string;
  url: string;
  createdAt: string;
  updatedAt: string;
  comments: number;
  files: { name: string; language?: string; size: number }[];
}

export interface DeveloperProfile {
  identity: DeveloperIdentity;
  repos: MappedRepo[];
  contributedRepos: GithubContributedRepo[];
  profileReadme?: string;
  commitActivity: {
    recentCommits: CommitInfo[];
    totalRepos: number;
    activeRepos: number;
    mostActiveRepo?: string;
  };
  externalPRs: MappedIssue[];
  issuesOpened: MappedIssue[];
  issuesResolved: MappedIssue[];
  codeReviews: {
    count: number;
    recent: { repo: string; submittedAt: string }[];
  };
  contributionCounts: {
    totalCommits: number;
    totalPRReviews: number;
    totalIssues: number;
    totalPRs: number;
  };
  gists: MappedGist[];
  starredInterests: {
    topLanguages: string[];
    topTopics: string[];
    totalStarred: number;
  };
  languageStats: LanguageStats;
  superlatives: Superlatives;
  pinnedRepos: {
    name: string;
    fullName: string;
    description: string | null;
    language: string | null;
    stars: number;
    topics: string[];
  }[];
  contributionCalendar: {
    weeks: { days: { date: string; count: number }[] }[];
  };
  analysis?: {
    knowledge?: AnalyzedKnowledge;
    overview?: AiAnalysis;
  };
  analyzedAt: string;
}

// ─── Local Analysis Types ────────────────────────────────────────────────────

export interface LocalRepoSummary {
  path: string;
  name: string;
  remote: string | null;
  totalCommits: number;
  firstCommitDate: string | null;
  lastCommitDate: string | null;
  authors: { name: string; commits: number }[];
  branches: { name: string; isCurrent: boolean; lastCommitDate: string | null }[];
  commits: { sha: string; message: string; date: string; author: string }[];
  dependencyFiles: RepoDependencyData;
  codeBlobs: CodeBlob[];
}

export interface LocalProfile {
  dir: string;
  repos: LocalRepoSummary[];
  analysis?: {
    knowledge?: AnalyzedKnowledge;
  };
  analyzedAt: string;
}

// ─── AI Analysis Types ──────────────────────────────────────────────────────

export interface KnowledgeNode {
  name: string;
  evidence: string[];
  confidence: "high" | "medium" | "low";
  repoExamples: string[];
}

export interface TechStackItem {
  name: string;
  category:
    | "language"
    | "framework"
    | "database"
    | "cloud"
    | "devtool"
    | "library"
    | "infrastructure";
  repoExamples: string[];
}

export interface AnalyzedKnowledge {
  techStack: TechStackItem[];
  csFundamentals: KnowledgeNode[];
  architecturePatterns: KnowledgeNode[];
  testingPractices: KnowledgeNode[];
  systemThinking: KnowledgeNode[];
  devOps: KnowledgeNode[];
  security: KnowledgeNode[];
  apiDesign: KnowledgeNode[];
  documentation: KnowledgeNode[];
  performance: KnowledgeNode[];
  openSourceCitizenship: KnowledgeNode[];
}

export interface AiAnalysis {
  executiveSummary: string;
  seniorityLevel: "junior" | "mid" | "senior" | "staff" | "principal";
  seniorityReasoning: string;
  roleFit: {
    primary: string;
    secondary: string[];
    environment: "startup" | "enterprise" | "either";
    environmentReasoning: string;
  };
  strengths: { title: string; evidence: string }[];
  concerns: { title: string; detail: string }[];
  interviewAngles: string[];
  standoutProjects: { name: string; url: string; why: string }[];
  communicationStyle: string;
  collaborationProfile: string;
  hiringRecommendation: string;
}
