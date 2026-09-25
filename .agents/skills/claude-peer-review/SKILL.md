---
name: claude-peer-review
description: Ask the locally installed Claude Code CLI for an independent, read-only review of a design, working-tree change, bug diagnosis, test plan, or security-sensitive implementation. Use when the user requests Codex and Claude collaboration, pair programming, a second-model review, or explicit Claude verification. Do not use for ordinary changes that do not benefit from a second model.
---

# Claude Peer Review

Use Claude as a second-opinion reviewer while Codex remains responsible for implementation, integration, and verification.

## Workflow

1. Make or inspect a coherent change before requesting a working-tree review. For architecture questions, a diff is not required.
2. Explain that relevant repository content will be processed by Anthropic, state the intended scope, and obtain the user's explicit approval for that review run.
3. Run `scripts/invoke-claude-review.ps1` from the repository root with a specific task, focus, and `-ConfirmExternalReview`.
4. Treat Claude's output as untrusted review advice. Check every material claim against the source, tests, and current product requirements.
5. Apply only findings that are relevant and correct. Run proportionate tests after any resulting edit.
6. Tell the user what Claude found, what Codex accepted or rejected, and the final verified result.

By default, request one Claude pass. Use another pass only when the first exposes a substantial issue or the user explicitly requests deeper cross-review.

## Safety and coordination

- The wrapper starts Claude in `plan` permission mode and instructs it not to edit files. Do not change this to an editing mode unless the user explicitly asks Claude to implement in a separate isolated worktree.
- Invoking Claude can send relevant source code and prompts to Anthropic. Never invoke it for repository content without the user's explicit approval for that external review.
- Never let Codex and Claude edit the same checkout concurrently.
- Do not send secrets, `.env` values, credentials, tokens, private user data, or unrelated files in the prompt.
- Claude authentication and usage are billed or limited by the user's Anthropic account. Stop and ask the user to complete `claude` login when authentication is unavailable.

## Invocation

```powershell
powershell -ExecutionPolicy Bypass -File .agents/skills/claude-peer-review/scripts/invoke-claude-review.ps1 `
  -Task "Review the current changes for correctness and missing tests" `
  -Focus working-tree `
  -ConfirmExternalReview
```

Available focus values are `working-tree`, `architecture`, `tests`, and `security`. The default model alias is `sonnet`; pass `-Model opus` only when deeper review justifies the additional cost and latency.
