param(
    [string]$HostName = "8.148.248.214",
    [string]$User = "root",
    [int]$Port = 22,
    [string]$RemoteDir = "/var/www/online-shopping",
    [string]$KeyFile = "",
    [switch]$IncludeEnv
)

$ErrorActionPreference = "Stop"

function Assert-Command {
    param([string]$Name)

    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Command '$Name' was not found. Please install or enable it first."
    }
}

function Invoke-NativeCommand {
    param(
        [string]$FilePath,
        [string[]]$Arguments
    )

    & $FilePath @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Command failed with exit code ${LASTEXITCODE}: $FilePath $($Arguments -join ' ')"
    }
}

Assert-Command "ssh"
Assert-Command "scp"
Assert-Command "tar"

$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$ArchiveName = "online-shopping-deploy.tar.gz"
$ArchivePath = Join-Path $env:TEMP $ArchiveName
$RemoteArchive = "/tmp/$ArchiveName"
$SshTarget = "$User@$HostName"

$SshArgs = @("-p", $Port.ToString())
$ScpArgs = @("-P", $Port.ToString())

if ($KeyFile -ne "") {
    $ResolvedKey = Resolve-Path $KeyFile
    $SshArgs += @("-i", $ResolvedKey.Path)
    $ScpArgs += @("-i", $ResolvedKey.Path)
}

$TarArgs = @(
    "-czf", $ArchivePath,
    "--exclude=.git",
    "--exclude=node_modules",
    "--exclude=npm-debug.log",
    "--exclude=*.log",
    "--exclude=.DS_Store"
)

if (-not $IncludeEnv) {
    $TarArgs += "--exclude=.env"
}

$TarArgs += "."

if (Test-Path $ArchivePath) {
    Remove-Item -LiteralPath $ArchivePath -Force
}

Write-Host "Packing project from $ProjectRoot ..."
Push-Location $ProjectRoot
try {
    Invoke-NativeCommand "tar" $TarArgs
}
finally {
    Pop-Location
}

Write-Host "Uploading archive to $SshTarget ..."
Invoke-NativeCommand "scp" ($ScpArgs + @($ArchivePath, "${SshTarget}:$RemoteArchive"))

$RemoteScript = @"
set -e
mkdir -p '$RemoteDir'
tar -xzf '$RemoteArchive' -C '$RemoteDir'
cd '$RemoteDir'
if [ ! -f package.json ]; then
  echo 'package.json not found after upload' >&2
  exit 1
fi
if command -v npm >/dev/null 2>&1; then
  npm ci --omit=dev
else
  echo 'npm is not installed on the server' >&2
  exit 1
fi
if command -v pm2 >/dev/null 2>&1; then
  if pm2 describe online-shopping >/dev/null 2>&1; then
    pm2 restart online-shopping
  else
    pm2 start npm --name online-shopping -- start
  fi
  pm2 save || true
else
  echo 'pm2 is not installed. Uploaded files and installed dependencies, but did not start the app.' >&2
fi
rm -f '$RemoteArchive'
"@

Write-Host "Installing dependencies and restarting app on server ..."
$RemoteScript | & ssh @SshArgs $SshTarget "bash -s"
if ($LASTEXITCODE -ne 0) {
    throw "Remote deploy command failed with exit code $LASTEXITCODE."
}

Remove-Item -LiteralPath $ArchivePath -Force

Write-Host "Deploy completed: ${SshTarget}:$RemoteDir"
