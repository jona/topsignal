import { githubGraphQL } from "../graphql.js";
import { screenOutboundFile } from "../../privacy/outbound.js";

export async function fetchProfileReadme(
  token: string,
  username: string
): Promise<string | null> {
  try {
    const result = await githubGraphQL<{
      repository: {
        visibility: string;
        readme: { text: string | null } | null;
      } | null;
    }>(
      token,
      `query ProfileReadme($owner: String!, $name: String!) {
        repository(owner: $owner, name: $name) {
          visibility
          readme: object(expression: "HEAD:README.md") {
            ... on Blob { text }
          }
        }
      }`,
      { owner: username, name: username }
    );
    if (result.repository?.visibility !== "PUBLIC") return null;
    const text = screenOutboundFile(result.repository.readme?.text);
    return text ? text.slice(0, 5000) : null;
  } catch {
    return null;
  }
}
