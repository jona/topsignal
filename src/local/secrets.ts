const CREDENTIAL_NAME =
  "(?:[a-z][a-z0-9_-]{0,64}[-_])?(?:password|passwd|pwd|(?:api|private|secret)[-_]?key|api[-_]?secret|(?:(?:auth|access|refresh)[-_]?)?token|client[-_]?secret|credential|secret[-_]?access[-_]?key)";

const credentialKey = new RegExp("^" + CREDENTIAL_NAME + "$", "i");
const assignmentPrefix = String.raw`\b${CREDENTIAL_NAME}(?:\\?["'])?\s*[:=]\s*`;
const bareCredential = /[a-z0-9+/_-]{8,}(?![a-z0-9+/_.$(-])/.source;
const quotedAssignments = ['"', "'"].flatMap((quote) => [
  new RegExp(
    String.raw`(${assignmentPrefix}${quote})(?!\[REDACTED\]${quote})(?:\\.|[^\\${quote}\r\n])+(?=${quote})`,
    "i"
  ),
  new RegExp(
    String.raw`(${assignmentPrefix}\\${quote})(?!\[REDACTED\]\\${quote})[^${quote}\r\n]+?(?=\\${quote})`,
    "i"
  ),
]);
const CREDENTIAL_ASSIGNMENTS = [
  ...quotedAssignments,
  new RegExp("(" + assignmentPrefix + ")" + bareCredential, "i"),
  new RegExp(
    "(^[ \\t]*(?:ARG|ENV)[ \\t]+" +
      CREDENTIAL_NAME +
      "[ \\t]+)" +
      bareCredential,
    "im"
  ),
];

const SECRET_PATTERNS = [
  // Consume the entire block, even if the file ends before its closing marker.
  /-----BEGIN[ \t]+([A-Z0-9 ]*PRIVATE KEY(?: BLOCK)?)-----[\s\S]*?(?:-----END[ \t]+\1-----|$)/i,
  /\bsk-(?:proj-|svcacct-|ant-)?[a-zA-Z0-9_-]{20,}\b/,
  /\bgh[pousr]_[a-zA-Z0-9]{36,}\b/,
  /\bgithub_pat_[a-zA-Z0-9_]{40,}\b/,
  /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/,
  /\bxox[bpars]-[a-zA-Z0-9-]+\b/,
  /\b[sp]k_live_[a-zA-Z0-9]{24,}\b/,
  /\bSG\.[a-zA-Z0-9_-]{22}\.[a-zA-Z0-9_-]{43}\b/,
  /\bAIza[a-zA-Z0-9_-]{35}\b/,
  /\beyJ[a-zA-Z0-9_-]{8,}\.[a-zA-Z0-9_-]{4,}\.[a-zA-Z0-9_-]{12,}\b/,
  /\bBearer[ \t]+[a-zA-Z0-9._~+/-]{16,}={0,2}/i,
  // Cover authenticated package registry URLs as well as database URLs.
  /\b[a-z][a-z0-9+.-]*:\/\/[^/\s"'<>@]+:[^/\s"'<>@]+@/i,
];

const ALL_PATTERNS = [...SECRET_PATTERNS, ...CREDENTIAL_ASSIGNMENTS];

export function isCredentialKey(key: string): boolean {
  return credentialKey.test(key);
}

export function hasSecrets(content: string): boolean {
  return ALL_PATTERNS.some((pattern) => pattern.test(content));
}

export function redactSecrets(content: string): string {
  const redacted = SECRET_PATTERNS.reduce(
    (text, pattern) =>
      text.replace(
        new RegExp(pattern.source, pattern.flags + "g"),
        "[REDACTED]"
      ),
    content
  );
  return CREDENTIAL_ASSIGNMENTS.reduce(
    (text, pattern) =>
      text.replace(
        new RegExp(pattern.source, pattern.flags + "g"),
        "$1[REDACTED]"
      ),
    redacted
  );
}
