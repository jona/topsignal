import { githubGraphQL } from "../graphql.js";
import type { GithubRepo, RepoDependencyData } from "../../types.js";
import type { GQLBlobText, GQLDirNode } from "./types.js";

export async function fetchDependencyFiles(
  token: string,
  username: string,
  repos: GithubRepo[],
  limit: number
): Promise<RepoDependencyData[]> {
  const targets = repos.filter((r) => !r.fork).slice(0, limit);
  if (targets.length === 0) return [];

  const repoFragments = targets
    .map((r, i) => {
      const safeName = r.name.replace(/[^a-zA-Z0-9_.-]/g, "");
      return `
      r${i}: repository(owner: "${username}", name: "${safeName}") {
        packageJson:   object(expression: "HEAD:package.json")       { ... on Blob { text } }
        pyproject:     object(expression: "HEAD:pyproject.toml")     { ... on Blob { text } }
        requirements:  object(expression: "HEAD:requirements.txt")   { ... on Blob { text } }
        goMod:         object(expression: "HEAD:go.mod")             { ... on Blob { text } }
        cargoToml:     object(expression: "HEAD:Cargo.toml")         { ... on Blob { text } }
        gemfile:       object(expression: "HEAD:Gemfile")            { ... on Blob { text } }
        composerJson:  object(expression: "HEAD:composer.json")      { ... on Blob { text } }
        readme:        object(expression: "HEAD:README.md")          { ... on Blob { text } }
        dockerfile:    object(expression: "HEAD:Dockerfile")         { ... on Blob { text } }
        dockerCompose: object(expression: "HEAD:docker-compose.yml") { ... on Blob { text } }
        openapiYaml:   object(expression: "HEAD:openapi.yaml")       { ... on Blob { text } }
        openapiJson:   object(expression: "HEAD:openapi.json")       { ... on Blob { text } }
        swaggerYaml:   object(expression: "HEAD:swagger.yaml")       { ... on Blob { text } }
        securityMd:    object(expression: "HEAD:SECURITY.md")        { ... on Blob { text } }
        changelogMd:   object(expression: "HEAD:CHANGELOG.md")       { ... on Blob { text } }
        testsDir:      object(expression: "HEAD:tests")              { __typename }
        testDir:       object(expression: "HEAD:test")               { __typename }
        specDir:       object(expression: "HEAD:spec")               { __typename }
        workflows:     object(expression: "HEAD:.github/workflows")  { __typename }
        protoDir:      object(expression: "HEAD:proto")              { __typename }
        docsDir:       object(expression: "HEAD:docs")               { __typename }
      }`;
    })
    .join("\n");

  const query = `query DependencyFiles {\n${repoFragments}\n}`;

  type DepsResult = Record<
    string,
    {
      packageJson: GQLBlobText | null;
      pyproject: GQLBlobText | null;
      requirements: GQLBlobText | null;
      goMod: GQLBlobText | null;
      cargoToml: GQLBlobText | null;
      gemfile: GQLBlobText | null;
      composerJson: GQLBlobText | null;
      readme: GQLBlobText | null;
      dockerfile: GQLBlobText | null;
      dockerCompose: GQLBlobText | null;
      openapiYaml: GQLBlobText | null;
      openapiJson: GQLBlobText | null;
      swaggerYaml: GQLBlobText | null;
      securityMd: GQLBlobText | null;
      changelogMd: GQLBlobText | null;
      testsDir: GQLDirNode | null;
      testDir: GQLDirNode | null;
      specDir: GQLDirNode | null;
      workflows: GQLDirNode | null;
      protoDir: GQLDirNode | null;
      docsDir: GQLDirNode | null;
    }
  >;

  const result = await githubGraphQL<DepsResult>(token, query, {}).catch(
    () => ({}) as DepsResult
  );

  const emptyDep = (repoName: string): RepoDependencyData => ({
    repoName,
    packageJson: null,
    pyproject: null,
    requirements: null,
    goMod: null,
    cargoToml: null,
    gemfile: null,
    composerJson: null,
    readme: null,
    dockerfile: null,
    dockerCompose: null,
    openapi: null,
    securityMd: null,
    changelogMd: null,
    hasTestsDir: false,
    hasTestDir: false,
    hasSpecDir: false,
    hasWorkflows: false,
    hasProtoDir: false,
    hasDocsDir: false,
  });

  return targets.map((r, i) => {
    const d = result[`r${i}`];
    if (!d) return emptyDep(r.full_name);
    const trim = (s: string | null | undefined, max: number) =>
      s ? s.slice(0, max) : null;
    const openapiText =
      d.openapiYaml?.text ?? d.openapiJson?.text ?? d.swaggerYaml?.text ?? null;
    return {
      repoName: r.full_name,
      packageJson: trim(d.packageJson?.text, 8000),
      pyproject: trim(d.pyproject?.text, 4000),
      requirements: trim(d.requirements?.text, 3000),
      goMod: trim(d.goMod?.text, 3000),
      cargoToml: trim(d.cargoToml?.text, 4000),
      gemfile: trim(d.gemfile?.text, 3000),
      composerJson: trim(d.composerJson?.text, 4000),
      readme: trim(d.readme?.text, 3000),
      dockerfile: trim(d.dockerfile?.text, 3000),
      dockerCompose: trim(d.dockerCompose?.text, 3000),
      openapi: trim(openapiText, 4000),
      securityMd: trim(d.securityMd?.text, 2000),
      changelogMd: trim(d.changelogMd?.text, 2000),
      hasTestsDir: d.testsDir !== null,
      hasTestDir: d.testDir !== null,
      hasSpecDir: d.specDir !== null,
      hasWorkflows: d.workflows !== null,
      hasProtoDir: d.protoDir !== null,
      hasDocsDir: d.docsDir !== null,
    };
  });
}
