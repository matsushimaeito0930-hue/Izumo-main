[CmdletBinding()]
param(
  [Parameter(Mandatory = $true, Position = 0)]
  [string]$Task,

  [ValidateSet("working-tree", "architecture", "tests", "security")]
  [string]$Focus = "working-tree",

  [ValidateRange(1, 12)]
  [int]$MaxTurns = 5,

  [string]$Model = "sonnet",

  [switch]$ConfirmExternalReview
)

$ErrorActionPreference = "Stop"

if (-not $ConfirmExternalReview) {
  throw "Claude review can send relevant repository content to Anthropic. Obtain explicit user approval, then rerun with -ConfirmExternalReview."
}

$claudeCommand = Get-Command claude -ErrorAction SilentlyContinue
$claudePath = if ($claudeCommand) { $claudeCommand.Source } else { $null }

if (-not $claudePath) {
  $packageRoot = Join-Path $env:LOCALAPPDATA "Microsoft\WinGet\Packages"
  if (Test-Path -LiteralPath $packageRoot) {
    $claudePath = Get-ChildItem -LiteralPath $packageRoot -Filter "claude.exe" -Recurse -ErrorAction SilentlyContinue |
      Where-Object { $_.FullName -like "*Anthropic.ClaudeCode*" } |
      Sort-Object LastWriteTime -Descending |
      Select-Object -First 1 -ExpandProperty FullName
  }
}

if (-not $claudePath -or -not (Test-Path -LiteralPath $claudePath)) {
  throw "Claude Code was not found. Restart the terminal after installation, then run 'claude --version'."
}

$focusInstructions = switch ($Focus) {
  "architecture" { "Focus on data boundaries, ownership, event scoping, failure modes, and maintainability." }
  "tests" { "Focus on missing regression tests, false-positive tests, concurrency, and realistic end-to-end coverage." }
  "security" { "Focus on authentication, authorization, data exposure, secret handling, injection, and abuse cases." }
  default { "Inspect the current git status and diff, then focus on correctness, regressions, and missing tests." }
}

$reviewPrompt = @"
You are the independent reviewing partner in a Codex + Claude pair-programming workflow.
Work in read-only mode. Do not edit, create, move, or delete files. Do not commit, push, install packages, or change external state.

Repository: $((Get-Location).Path)
Review task: $Task
Review focus: $Focus
$focusInstructions

Inspect only the repository context needed for this task. Never read or reproduce .env files, credentials, tokens, or unrelated private data.
Return a concise review with:
1. Blocking findings, with file and line evidence.
2. Important non-blocking findings.
3. Missing or weak tests.
4. A clear verdict: approve, approve with follow-ups, or request changes.
If you find no material issue, say so directly. Do not invent findings.
"@

& $claudePath `
  -p $reviewPrompt `
  --permission-mode plan `
  --max-turns $MaxTurns `
  --model $Model `
  --output-format text `
  --no-session-persistence

if ($LASTEXITCODE -ne 0) {
  throw "Claude Code review failed with exit code $LASTEXITCODE. Run 'claude' interactively once to complete authentication."
}
