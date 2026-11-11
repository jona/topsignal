# Developer overview and role assessment

Produce a clear public overview of this developer's demonstrated work, applying the shared assessment rules and the supplied schema. Use the collected profile, attributable contributions, and freshly checked technical evidence or a knowledge assessment with its evidence ledger. A previous generated biography is not an independent source. The overview must agree with the technical findings, their scope, and their confidence.

## Evidence and calibration

Lead with the kind of work the evidence demonstrates, the strongest concrete capabilities, and representative projects. Make the account's contribution clear. Separate an observed practice from a proposed role fit. Do not infer professional experience from GitHub account age; do not use followers, stars, commit volume, language percentages that include forks, organization membership, sponsorship, or self-described titles as measures of seniority, quality, or employability.

Use a provisional seniority assessment supported by demonstrated scope, judgment, maintenance and ownership, not a fixed quota of repositories or technologies. Independent delivery refers to supported technical ownership at that scope, not proof of unaided creation; repository ownership alone does not establish it:

- `junior`: attributable work primarily establishes bounded implementation tasks; do not assign it simply because the sample is small or quiet.
- `mid`: attributable work establishes independent delivery of cohesive features or a component, with practical integration and maintenance decisions.
- `senior`: substantive work supports independent end-to-end delivery and explicit tradeoffs across interfaces, state, failure handling, testing and maintenance. Breadth of dependencies alone is insufficient.
- `staff`: evidence establishes technical direction and sustained influence across teams or multiple independently owned systems; code complexity alone does not establish this scope.
- `principal`: evidence establishes organization-wide technical strategy and sustained impact at that scope. Repository counts or a founder title are insufficient.

Choose only a level the supplied evidence can reasonably support and explain the scope and uncertainty in `seniorityReasoning`. A sparse sample does not establish a low level. If no meaningful assessment is possible, obtain more evidence or return the task to the harness as insufficient; do not fabricate a level to satisfy an enum. Role/environment fit is a recommendation based on demonstrated technical work, scope, and project context, not a verified employment history, personal preference, or a hiring decision.

## Field guidance

- **`executiveSummary`:** two or three specific, readable sentences. Explain the developer's focus and strongest substantiated work. Avoid generic praise, exhaustive stacks, stereotypes, invented experience, or methodological boilerplate.
- **`seniorityLevel` / `seniorityReasoning`:** apply the calibration above. Keep the reasoning concise and state that an assessment is provisional where evidence warrants it.
- **`roleFit`:** choose one useful primary role and up to three complementary secondary roles. Use `startup`, `enterprise`, or `either` only with an evidence-based explanation. Multiple side projects or a self-described founder title alone do not prove organizational fit; choose `either` when context is not established.
- **`strengths`:** select roughly three to five distinct capabilities. Each `evidence` must cite an attributable public contribution or a safe private-work alias and explain the concrete capability. Do not repeat the summary or equate tooling with expertise.
- **`concerns`:** include concrete limitations or verified risks material to interpreting the profile. Distinguish observed defects from evidence gaps and keep scope proportionate. Do not manufacture weaknesses to balance positive findings, treat absent activity as poor collaboration, or penalize private work. `[]` is valid. Missing scale or leadership evidence is a limit on claims, not itself a demonstrated weakness.
- **`interviewAngles`:** ask a few project-specific questions that would clarify real tradeoffs or uncertainties. Avoid generic trivia and questions based on sensitive/private details. A question must not smuggle in an unverified achievement or defect.
- **`standoutProjects`:** select a few projects for demonstrated substance, not popularity. Use only verified public URLs; describe the account's supported contribution. Do not promote an upstream fork as an original project. When evidence does not establish public details, omit the project rather than inventing a link.
- **`communicationStyle`:** describe observed developer-facing communication in sampled documentation, pull requests or commits. Do not infer personality, fluency, or interpersonal traits from identity or commit style. Say when evidence is limited.
- **`collaborationProfile`:** describe attributable collaboration, such as merged external contributions or reviewed discussions. Distinguish authoring from reviewing; a zero or sparse review count in a sampled period does not establish inability. Avoid claims of team leadership without evidence.
- **`hiringRecommendation`:** frame one or two sentences as a conditional role-fit assessment and useful validation topics. Do not make an automated hire/reject decision, predict job performance, or claim verified organizational impact from source alone.

## Final consistency check

Ensure every named technology, project and accomplishment is supported and that public citations are safe. Keep sampled counts and their time windows distinct; do not call a multi-year sample "recent" or equate repository byte share with personal proficiency. Verify that the summary, level, role fit, strengths and recommendation agree with the knowledge section. State consequential uncertainty once where useful instead of repeating disclaimers throughout the profile. Return only the requested JSON wrapper matching the schema, with every required overview field and no extra keys.
