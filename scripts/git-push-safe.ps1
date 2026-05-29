param(
  [string]$Message,
  [string]$Branch = "main",
  [string]$Remote = "origin",
  [switch]$NoRebase
)

$ErrorActionPreference = "Stop"

function Write-Step {
  param([string]$Text)
  Write-Host ""
  Write-Host "==> $Text" -ForegroundColor Cyan
}

function Invoke-Git {
  param([string[]]$GitArgs)
  & git @GitArgs
  if ($LASTEXITCODE -ne 0) {
    throw "git $($GitArgs -join ' ') failed."
  }
}

function Has-Output {
  param([string[]]$CommandArgs)
  $output = & git @CommandArgs
  if ($LASTEXITCODE -ne 0) {
    throw "git $($CommandArgs -join ' ') failed."
  }
  return [bool]$output
}

function Get-ChangedEnvFiles {
  $files = & git status --porcelain -- .env .env.*
  if ($LASTEXITCODE -ne 0) {
    throw "git status --porcelain -- .env .env.* failed."
  }
  return @($files | ForEach-Object {
    $path = $_.Substring(3).Trim()
    if ($path.StartsWith('"') -and $path.EndsWith('"')) {
      $path = $path.Trim('"')
    }
    $path
  } | Where-Object { $_ })
}

try {
  $repoRoot = git rev-parse --show-toplevel
  if ($LASTEXITCODE -ne 0) { throw "not a git repository" }
} catch {
  Write-Error "Current directory is not inside a Git repository."
  exit 1
}

Set-Location $repoRoot

$envStashName = "git-push-safe-env-$(Get-Date -Format 'yyyyMMddHHmmss')"
$envWasStashed = $false

try {
  Write-Step "Repository"
  Write-Host $repoRoot

  Write-Step "Current status"
  Invoke-Git -GitArgs @("status", "--short", "--branch")

  Write-Step "Saving local env files"
  $envFiles = Get-ChangedEnvFiles
  if ($envFiles.Count -gt 0) {
    $stashArgs = @("stash", "push", "-m", $envStashName, "--") + $envFiles
    Invoke-Git -GitArgs $stashArgs
    $envWasStashed = $true
  } else {
    Write-Host "No local env file changes."
  }

  Write-Step "Staging files except local env files"
  Invoke-Git -GitArgs @("add", "-A", "--", ".", ":(exclude).env", ":(exclude).env.*")

  $stagedFiles = & git diff --cached --name-only
  if ($LASTEXITCODE -ne 0) { throw "git diff --cached --name-only failed." }

  if ($stagedFiles) {
    if (-not $Message) {
      $Message = Read-Host "Commit message"
    }
    if (-not $Message.Trim()) {
      throw "Commit message cannot be empty."
    }

    Write-Host "Staged files:"
    $stagedFiles | ForEach-Object { Write-Host "  $_" }

    Write-Step "Committing"
    Invoke-Git -GitArgs @("commit", "-m", $Message)
  } else {
    Write-Host "No non-env changes to commit."
  }

  Write-Step "Synchronizing with $Remote/$Branch"
  Invoke-Git -GitArgs @("fetch", $Remote, $Branch)
  if ($NoRebase) {
    Invoke-Git -GitArgs @("merge", "--ff-only", "$Remote/$Branch")
  } else {
    Invoke-Git -GitArgs @("rebase", "$Remote/$Branch")
  }

  Write-Step "Pushing to $Remote/$Branch"
  Invoke-Git -GitArgs @("push", $Remote, $Branch)

  Write-Step "Done"
  Invoke-Git -GitArgs @("status", "--short", "--branch")
} catch {
  Write-Error $_
  Write-Host ""
  Write-Host "The script stopped before finishing. Resolve the message above, then run:" -ForegroundColor Yellow
  Write-Host "  git status"
  if ($envWasStashed) {
    Write-Host "  git stash list"
    Write-Host "  git stash pop"
  }
  exit 1
} finally {
  if ($envWasStashed) {
    Write-Step "Restoring local env files"
    & git stash list | Select-String -SimpleMatch $envStashName | ForEach-Object {
      & git stash pop
      if ($LASTEXITCODE -ne 0) {
        Write-Host "Could not restore env stash automatically. Run 'git stash list' and 'git stash pop' manually." -ForegroundColor Yellow
      }
    }
  }
}
