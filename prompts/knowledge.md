# Technical knowledge assessment

Assess observed engineering practices in the code and configuration, applying the shared assessment rules. Produce the `knowledge` section of the final analysis wrapper. This is an evidence inventory, not a scorecard: include demonstrated strengths, bounded observations, and only findings useful to understanding the developer's work.

## Technology inventory

List concrete languages, frameworks, databases, infrastructure, cloud services, development tools, and libraries actually implemented, imported, or configured in reviewed original work. Direct dependency declarations may establish declared usage, but do not imply proficiency. Exclude transitive packages, unused scaffolding, vendor code, and technologies seen only in clones, stars, or unrelated contributors' code. Prefer the smallest set that explains the work; group obvious duplicates and avoid a dependency dump. Attach relevant public repository names or approved local aliases as `repoExamples`.

Use the schema's category enum exactly. A library and a managed service are different kinds of technology; choose the category supported by how the project uses it.

## Knowledge categories

For each category, choose a few distinct, material observations. Zero entries is valid. Do not force a pattern into every category or restate the same implementation under several names.

| Key                     | Look for                                                                                                                                                         | Do not infer from                                                                            |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `csFundamentals`        | Concrete data structures, algorithmic tradeoffs, parsing, numerical work, concurrency control, memory or resource management                                     | Language choice, a dependency, or a function name alone                                      |
| `architecturePatterns`  | Actual module boundaries, dependency direction, interfaces/adapters, event flow, service boundaries, state transitions                                           | Directory names, buzzwords in a README, or an unused interface                               |
| `testingPractices`      | Assertions and fixtures that exercise behavior, boundary/failure cases, concurrency, integration contracts, or architecture; actual runs when available          | Test script presence, test-file counts, or coverage tooling alone                            |
| `systemThinking`        | Persistence and transaction boundaries, recovery, cancellation, failure ownership, operational constraints, data modeling, observability, and explicit tradeoffs | A queue SDK, retries without their failure semantics, or unmeasured scale claims             |
| `devOps`                | Reviewed CI steps, packaging, deployment configuration, container builds, environment management, and operability                                                | Configuration presence as proof that deployment succeeded                                    |
| `security`              | Trust boundaries, identity/access checks, input/output validation, secret handling, subprocess/file restrictions, resource limits                                | An auth package as proof of secure authentication or broad security expertise                |
| `apiDesign`             | Contracts, validation, errors, versioning, pagination, compatibility, typed client/server interaction, and meaningful integration boundaries                     | An endpoint or generated schema alone                                                        |
| `documentation`         | Specific usable setup, examples, constraints, architecture decisions, operational guidance, and maintained contracts                                             | README length or quantity of comments                                                        |
| `performance`           | Bounded work, caching/invalidation, request coalescing, query/index choices, streaming, lazy work, or measured profiling results                                 | Faster/scalable claims without a baseline or measurements                                    |
| `openSourceCitizenship` | Attributable merged contributions, useful reusable tools, maintenance, releases, review, and contributor guidance                                                | Stars, followers, account age, or repository ownership as measures of skill or collaboration |

## Node quality

Each node must name a concrete practice, give concise evidence, select calibrated confidence, and identify its repository examples. Prefer a citation of the form `owner/repo, path/to/file.ts::symbol — observed behavior and relevant boundary`. For a private source, use the stable local alias and a safe locator or retain sensitive details in the private ledger. Describe why the evidence supports this node without copying source.

Distinguish a mechanism from a guarantee. For example, observing an outbox transaction and retry identifiers supports transactional publication and deduplication design; it does not establish exactly-once external delivery, production throughput, or fault tolerance under every failure. Observing a review loop supports an orchestration pattern; permissive fallback paths may limit claims about enforcement. Report the narrow behavior the code supports.

Do not give high confidence to a broad category merely because one small example exists. Prefer specific node names such as "Bounded upstream response reads" over "Expert distributed systems". Avoid ranking or rating the developer in this section. Use all eleven required knowledge keys, with `[]` for categories lacking evidence, and output only the requested JSON wrapper matching the supplied schema.
