Why it's dominant:
Automation-friendly: Tools like semantic-release, commitlint, and release-please can parse these messages to auto-generate changelogs and bump SemVer versions (fix → patch, feat → minor, BREAKING CHANGE → major).
Industry-wide adoption: Used by Google, Meta, Microsoft, and countless open-source projects (Angular, Electron, yargs, etc.).
Tooling ecosystem: GitHub, GitLab, and various CI/CD platforms have built-in support or plugins for Conventional Commits.
The standard format:
plain
<type>(<optional scope>): <description>

[optional body]

[optional footer(s)]
The most commonly used types are feat, fix, chore, docs, style, refactor, perf, test, build, and ci.
