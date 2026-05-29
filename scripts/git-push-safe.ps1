param(
  [string]$Message,
  [string]$Branch = "main",
  [string]$Remote = "origin"
)

$ErrorActionPreference = "Stop"

function Write-Step {
  param([string]$Text)
  Write-Host ""
  Write-Host "==> $Text" -ForegroundColor Cyan
}

try {
  $repoRoot = git rev-parse --show-toplevel
} catch {
  Write-Error "Current directory is not inside a Git repository."
  exit 1
}

Set-Location $repoRoot

Write-Step "Repository"
Write-Host $repoRoot

Write-Step "Current status"
git status --short --branch

$changes = git status --porcelain
if (-not $changes) {
  Write-Host "No local changes to commit."
  exit 0
}

if (-not $Message) {
  $Message = Read-Host "Commit message"
}

if (-not $Message.Trim()) {
  Write-Error "Commit message cannot be empty."
  exit 1
}

Write-Step "Staging files except local env files"
git add -A -- . ":(exclude).env" ":(exclude).env.*"

$staged = git diff --cached --name-only
if (-not $staged) {
  Write-Host "No staged changes. Only excluded files may have changed."
  exit 0
}

Write-Host "Staged files:"
$staged | ForEach-Object { Write-Host "  $_" }

Write-Step "Committing"
git commit -m $Message

Write-Step "Pushing to $Remote/$Branch"
git push $Remote $Branch

Write-Step "Done"
git status --short --branch
