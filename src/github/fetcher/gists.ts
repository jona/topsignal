import { githubREST } from "../graphql.js";
import type { GithubGist } from "../../types.js";

export async function fetchGistsREST(
  token: string,
  username: string,
  limit: number
): Promise<GithubGist[]> {
  try {
    return await githubREST<GithubGist[]>(
      token,
      `/users/${encodeURIComponent(username)}/gists?per_page=${limit}`
    );
  } catch {
    return [];
  }
}
