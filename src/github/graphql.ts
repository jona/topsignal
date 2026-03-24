import { GITHUB_GRAPHQL_URL, GITHUB_REST_URL, USER_AGENT } from "../env.js";

function queryName(query: string): string {
  const m = query.match(/query\s+(\w+)/);
  return m?.[1] ?? "unknown";
}

export async function githubGraphQL<T>(
  token: string,
  query: string,
  variables: Record<string, unknown>,
  attempt = 0
): Promise<T> {
  const name = queryName(query);

  const res = await fetch(GITHUB_GRAPHQL_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": USER_AGENT,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (res.status === 401) {
    throw {
      status: 401,
      message:
        "GitHub authentication failed — run `gh auth login` to re-authenticate",
    };
  }

  if (res.status === 403 || res.status === 429) {
    throw {
      status: 429,
      message: "GitHub API rate limit exceeded. Try again later.",
    };
  }

  if (res.status === 502 || res.status === 503 || res.status === 504) {
    if (attempt < 3) {
      const delay = (attempt + 1) * 1500;
      await new Promise((r) => setTimeout(r, delay));
      return githubGraphQL<T>(token, query, variables, attempt + 1);
    }
    throw {
      status: res.status,
      message: `GitHub API error: ${res.status} (after 3 retries)`,
    };
  }

  if (!res.ok) {
    throw {
      status: res.status,
      message: `GitHub API error: ${res.status}`,
    };
  }

  const json: {
    data: T;
    errors?: {
      type?: string;
      message?: string;
      extensions?: { code?: string };
    }[];
  } = await res.json();

  if (json.errors?.length) {
    const err = json.errors[0];
    if (err.type === "NOT_FOUND")
      throw { status: 404, message: "GitHub user not found" };
    if (err.type === "RATE_LIMITED" || err.extensions?.code === "RATE_LIMITED")
      throw { status: 429, message: "GitHub API rate limit exceeded" };
    if (
      err.type === "FORBIDDEN" ||
      (err.message ?? "").includes("not accessible")
    )
      throw { status: 403, message: err.message ?? "Forbidden" };
    throw { status: 500, message: err.message ?? "GraphQL error" };
  }

  return json.data;
}

export async function githubREST<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`${GITHUB_REST_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "User-Agent": USER_AGENT,
      Accept: "application/vnd.github+json",
    },
  });

  if (!res.ok) {
    throw {
      status: res.status,
      message: `GitHub REST API error: ${res.status} ${path}`,
    };
  }

  return res.json() as Promise<T>;
}
