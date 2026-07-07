# Contributing

## Commit Convention

This project follows [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/).

### Format

```
<type>[optional scope]: <description>
```

### Types

- `feat` — new feature
- `fix` — bug fix
- `chore` — maintenance, tooling, dependencies
- `docs` — documentation only
- `style` — formatting, missing semicolons, etc. (no production change)
- `refactor` — code change that neither fixes a bug nor adds a feature
- `test` — adding or updating tests
- `perf` — performance improvement
- `ci` — CI configuration change
- `build` — build system or external dependency changes

### Examples

```
feat(uci): add MultiPV option
fix(search): correct null move pruning condition
docs: update README with build instructions
```

## Pull Requests

1. Keep changes focused and atomic.
2. Write clear commit messages following the convention above.
3. Ensure the project builds and tests pass before submitting.
