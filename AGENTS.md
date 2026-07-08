# AGENTS.md

## Development Commands

Do not waste time on manual formatting. Use the project's automated commands.

For the frontend, always run:

```bash
pnpm lint:fix
pnpm format
pnpm build
```

For the Go server, always run:

```bash
go vet ./...
go fmt ./...
go build -o /dev/null ./...
```

The Go build command is only for compilation validation and debugging. Do not generate or keep a binary artifact.

## Code Style

### Prefer Simple and Clean Code

Always prefer the simplest clear solution.

Do not create unnecessary abstractions under any circumstances.

Do not introduce abstractions for hypothetical future needs.

Do not overengineer solutions.

Do not create extra layers, wrappers, helpers, utilities, services, factories, adapters, interfaces, hooks, or generic abstractions unless they solve a concrete and current problem.

Prefer direct, explicit code when it is easier to read and understand.

Avoid premature generalization.

Avoid extracting code merely to make functions look shorter.

Avoid creating a helper for logic that is used only once unless the extraction significantly improves readability.

Avoid generic solutions when a small, specific implementation is sufficient.

Do not add indirection without a clear benefit.

Do not introduce design patterns merely for architectural purity.

Prefer:

* Simple code
* Clean code
* Explicit behavior
* Clear control flow
* Minimal indirection
* Small and focused changes
* Existing project patterns

The goal is not to maximize abstraction or reuse. The goal is to produce code that is easy to read, easy to debug, and easy to maintain.

When choosing between a clever solution and a straightforward solution, choose the straightforward solution.

### Prefer Block-Style Conditionals

Avoid inline `if` statements and compressed conditional logic.

Do not write:

```ts
if (condition) doSomething()
```

Prefer:

```ts
if (condition) {
  doSomething()
}
```

Apply the same principle when compact control flow makes the code harder to scan.

### Avoid Crowded Code

Do not pack unrelated or distinct logical operations together without visual separation.

Bad:

```ts
const user = getUser()
const permissions = getPermissions(user)
const settings = getSettings(user)
const result = processUser(user, permissions, settings)
saveResult(result)
return result
```

Better:

```ts
const user = getUser()
const permissions = getPermissions(user)
const settings = getSettings(user)

const result = processUser(user, permissions, settings)

saveResult(result)

return result
```

Use blank lines to separate logical groups and phases of execution.

This rule is not specific to constants or variable declarations. It applies to declarations, transformations, side effects, validation, control flow, function calls, and other code structures.

Do not mechanically separate every line. Closely related statements should remain grouped together.

Bad:

```ts
const firstName = user.firstName

const lastName = user.lastName

const fullName = `${firstName} ${lastName}`
```

Better:

```ts
const firstName = user.firstName
const lastName = user.lastName

const fullName = `${firstName} ${lastName}`
```

The goal is balance: code should not be visually crowded, but it should also not be excessively fragmented.

### General Readability

Prefer code that is easy to scan vertically.

Keep related statements together.

Separate distinct logical steps with blank lines.

Avoid unnecessary compression.

Avoid excessive fragmentation.

Use whitespace intentionally to communicate structure.
