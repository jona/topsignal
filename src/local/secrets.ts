const SECRET_PATTERNS: { pattern: RegExp; label: string }[] = [
  // API keys — provider-specific
  { pattern: /\bsk-[a-zA-Z0-9]{20,}\b/, label: "OpenAI API key" },
  { pattern: /\bsk-ant-[a-zA-Z0-9-]{20,}\b/, label: "Anthropic API key" },
  { pattern: /\bghp_[a-zA-Z0-9]{36,}\b/, label: "GitHub PAT" },
  { pattern: /\bghs_[a-zA-Z0-9]{36,}\b/, label: "GitHub App token" },
  { pattern: /\bghu_[a-zA-Z0-9]{36,}\b/, label: "GitHub user token" },
  { pattern: /\bghr_[a-zA-Z0-9]{36,}\b/, label: "GitHub refresh token" },
  { pattern: /\bAKIA[A-Z0-9]{16}\b/, label: "AWS access key" },
  { pattern: /\bxoxb-[a-zA-Z0-9-]+\b/, label: "Slack bot token" },
  { pattern: /\bxoxp-[a-zA-Z0-9-]+\b/, label: "Slack user token" },
  { pattern: /\bsk_live_[a-zA-Z0-9]{24,}\b/, label: "Stripe secret key" },
  { pattern: /\bpk_live_[a-zA-Z0-9]{24,}\b/, label: "Stripe publishable key" },
  { pattern: /\bSG\.[a-zA-Z0-9_-]{22}\.[a-zA-Z0-9_-]{43}\b/, label: "SendGrid API key" },
  { pattern: /\bAIza[a-zA-Z0-9_-]{35}\b/, label: "Google API key" },

  // Private keys
  { pattern: /-----BEGIN\s+(RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/, label: "private key" },
  { pattern: /-----BEGIN\s+PGP\s+PRIVATE\s+KEY\s+BLOCK-----/, label: "PGP private key" },

  // Connection strings with credentials
  { pattern: /(?:mongodb(?:\+srv)?|postgres(?:ql)?|mysql|redis|amqp|mssql):\/\/[^\s"'`]+:[^\s"'`]+@/, label: "connection string with credentials" },

  // Generic secret assignments
  { pattern: /(?:password|passwd|pwd)\s*[:=]\s*["'][^"']{8,}["']/i, label: "hardcoded password" },
  { pattern: /(?:api_?key|apikey|api_?secret)\s*[:=]\s*["'][^"']{8,}["']/i, label: "hardcoded API key" },
  { pattern: /(?:secret_?key|auth_?token|access_?token)\s*[:=]\s*["'][^"']{8,}["']/i, label: "hardcoded secret/token" },

  // JWT tokens (header.payload.signature)
  { pattern: /\beyJ[a-zA-Z0-9_-]{20,}\.eyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}\b/, label: "JWT token" },
];

export interface SecretMatch {
  label: string;
  line: number;
}

export function scanForSecrets(content: string): SecretMatch[] {
  const matches: SecretMatch[] = [];
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    for (const { pattern, label } of SECRET_PATTERNS) {
      if (pattern.test(lines[i])) {
        matches.push({ label, line: i + 1 });
        break; // one match per line is enough
      }
    }
  }

  return matches;
}

export function redactSecrets(content: string): string {
  let redacted = content;
  for (const { pattern } of SECRET_PATTERNS) {
    redacted = redacted.replace(new RegExp(pattern.source, "g"), "[REDACTED]");
  }
  return redacted;
}
