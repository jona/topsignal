import { githubGraphQL } from "../graphql.js";

export async function fetchProfileReadme(
  token: string,
  username: string
): Promise<string | null> {
  try {
    const result = await githubGraphQL<{
      repository: { readme: { text: string | null } | null } | null;
    }>(
      token,
      `query ProfileReadme($owner: String!, $name: String!) {
        repository(owner: $owner, name: $name) {
          readme: object(expression: "HEAD:README.md") {
            ... on Blob { text }
          }
        }
      }`,
      { owner: username, name: username }
    );
    const text = result.repository?.readme?.text ?? null;
    return text ? text.slice(0, 5000) : null;
  } catch {
    return null;
  }
}
