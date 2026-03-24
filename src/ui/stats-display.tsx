import React, { useEffect } from "react";
import { render, useApp, Box, Text } from "ink";
import type { AnalysisStats } from "../stats.js";

function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

function truncatePath(repo: string, path: string, max = 40): string {
  const full = `${repo}/${path}`;
  return full.length > max ? `…${full.slice(-(max - 1))}` : full;
}

function Bar({
  value,
  max,
  width = 18,
}: {
  value: number;
  max: number;
  width?: number;
}) {
  const filled = max > 0 ? Math.round((value / max) * width) : 0;
  const empty = width - filled;
  return (
    <Text>
      <Text color="cyan">{"█".repeat(filled)}</Text>
      <Text color="gray">{"░".repeat(empty)}</Text>
    </Text>
  );
}

function Row({
  label,
  value,
  labelWidth = 26,
}: {
  label: string;
  value: string;
  labelWidth?: number;
}) {
  return (
    <Box>
      <Text color="gray">{label.padEnd(labelWidth)}</Text>
      <Text>{value}</Text>
    </Box>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold color="white">
        {title}
      </Text>
      <Box flexDirection="column" marginLeft={2}>
        {children}
      </Box>
    </Box>
  );
}

function StatsApp({ data }: { data: AnalysisStats }) {
  const { exit } = useApp();
  useEffect(() => {
    exit();
  }, [exit]);

  const maxLangCount = data.blobs.byLanguage[0]?.count ?? 1;

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="cyan"
      paddingX={2}
      paddingY={1}
    >
      <Box justifyContent="center" marginBottom={1}>
        <Text bold color="cyan">
          Analysis Statistics
        </Text>
      </Box>

      {data.remoteRepos.length > 0 && (
        <Section title="REMOTE REPOS (GitHub)">
          {data.remoteRepos.map((repo) => {
            const blobCount = data.blobs.byRepo.find((r) => r.repo === repo)?.count ?? 0;
            return (
              <Box key={repo} gap={1}>
                <Text color={blobCount > 0 ? "green" : "gray"}>
                  {blobCount > 0 ? "✓" : "✗"}
                </Text>
                <Text color={blobCount > 0 ? "white" : "gray"}>{repo.padEnd(32)}</Text>
                <Text color={blobCount > 0 ? "white" : "gray"}>
                  {blobCount > 0 ? `${blobCount} ${blobCount === 1 ? "file" : "files"}` : "no matching files"}
                </Text>
              </Box>
            );
          })}
        </Section>
      )}

      {data.localRepos.length > 0 && (
        <Section title="LOCAL REPOS">
          {data.localRepos.map((repo) => {
            const blobCount = data.blobs.byRepo.find((r) => r.repo === repo)?.count ?? 0;
            return (
              <Box key={repo} gap={1}>
                <Text color={blobCount > 0 ? "green" : "gray"}>
                  {blobCount > 0 ? "✓" : "✗"}
                </Text>
                <Text color={blobCount > 0 ? "white" : "gray"}>{repo.padEnd(32)}</Text>
                <Text color={blobCount > 0 ? "white" : "gray"}>
                  {blobCount > 0 ? `${blobCount} ${blobCount === 1 ? "file" : "files"}` : "no matching files"}
                </Text>
              </Box>
            );
          })}
        </Section>
      )}

      <Section title="CODE FILES">
        <Row label="Files analyzed" value={fmt(data.blobs.count)} />
        <Row label="Total characters" value={fmt(data.blobs.totalChars)} />
        <Row
          label="Avg file size"
          value={`${fmt(data.blobs.avgChars)} chars`}
        />
        {data.blobs.smallestFile && (
          <Row
            label="Smallest"
            value={`${fmt(data.blobs.minChars)} chars  ${truncatePath(data.blobs.smallestFile.repo, data.blobs.smallestFile.path)}`}
          />
        )}
        {data.blobs.largestFile && (
          <Row
            label="Largest"
            value={`${fmt(data.blobs.maxChars)} chars  ${truncatePath(data.blobs.largestFile.repo, data.blobs.largestFile.path)}`}
          />
        )}
      </Section>

      {data.blobs.byLanguage.length > 0 && (
        <Section title="LANGUAGE BREAKDOWN">
          {data.blobs.byLanguage.map(({ language, count }) => {
            const pct = Math.round((count / data.blobs.count) * 100);
            return (
              <Box key={language} gap={1}>
                <Text color="gray">{language.padEnd(14)}</Text>
                <Text>{String(count).padStart(3)}</Text>
                <Bar value={count} max={maxLangCount} width={18} />
                <Text color="gray">{String(pct).padStart(3)}%</Text>
              </Box>
            );
          })}
        </Section>
      )}


<Section title="PROMPT ESTIMATE">
        <Row
          label="Total input characters"
          value={fmt(data.prompt.totalInputChars)}
        />
        <Row
          label="Estimated tokens"
          value={`~${fmt(data.prompt.estimatedTokens)}  (4 chars/token)`}
        />
      </Section>
    </Box>
  );
}

export async function renderStats(data: AnalysisStats): Promise<void> {
  const { waitUntilExit } = render(<StatsApp data={data} />, {
    stdout: process.stderr,
  });
  await waitUntilExit();
}
