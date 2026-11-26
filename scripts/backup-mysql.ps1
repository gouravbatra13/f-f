[CmdletBinding()]
param(
  [string]$EnvironmentFile,
  [string]$BackupDirectory = (Join-Path $PSScriptRoot '..\backups\mysql'),
  [ValidateRange(1, 365)][int]$RetentionDays = 14,
  [switch]$Docker
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'mysql-client-helpers.ps1')

$repositoryRoot = Split-Path $PSScriptRoot -Parent
if (-not $EnvironmentFile) {
  $EnvironmentFile = if ($Docker) {
    Join-Path $repositoryRoot '.env.production'
  } else {
    Join-Path $repositoryRoot 'fixflow-api\.env'
  }
}
$EnvironmentFile = [System.IO.Path]::GetFullPath($EnvironmentFile)
$database = Get-FixFlowSetting 'MYSQL_DATABASE' $EnvironmentFile
if ($database -notmatch '^[A-Za-z0-9_]+$') {
  throw 'MYSQL_DATABASE must contain only letters, numbers, and underscores.'
}

$backupRoot = [System.IO.Path]::GetFullPath($BackupDirectory)
New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null
$timestamp = [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssZ')
$backupName = "fixflow-$database-$timestamp.sql"
$finalPath = Join-Path $backupRoot $backupName
$partialPath = "$finalPath.partial"
$credentialsPath = $null

try {
  if ($Docker) {
    $composeArguments = @(
      'compose',
      '--project-name', 'fixflow-ai-prod',
      '--env-file', $EnvironmentFile,
      '--file', (Join-Path $repositoryRoot 'docker-compose.prod.yml'),
      'exec', '--no-TTY', 'mysql', 'sh', '-c',
      'export MYSQL_PWD="$(cat /run/secrets/mysql_root_password)"; exec mysqldump --user=root --single-transaction --routines --events --triggers --hex-blob --default-character-set=utf8mb4 "$1"',
      'fixflow-backup',
      $database
    )
    $docker = Get-Command docker.exe -ErrorAction Stop
    $null = New-FixFlowMysqlProcess `
      -Executable $docker.Source `
      -Arguments $composeArguments `
      -OutputFile $partialPath
  } else {
    $hostName = Get-FixFlowSetting 'MYSQL_HOST' $EnvironmentFile
    $port = Get-FixFlowSetting 'MYSQL_PORT' $EnvironmentFile
    $userName = Get-FixFlowSetting 'MYSQL_USER' $EnvironmentFile
    $password = Get-FixFlowSetting 'MYSQL_PASSWORD' $EnvironmentFile
    $credentialsPath = New-FixFlowMysqlDefaultsFile $hostName $port $userName $password
    $client = Get-Command mysqldump.exe -ErrorAction Stop
    $arguments = @(
      "--defaults-extra-file=$credentialsPath",
      '--single-transaction',
      '--routines',
      '--events',
      '--triggers',
      '--hex-blob',
      '--default-character-set=utf8mb4',
      $database
    )
    $null = New-FixFlowMysqlProcess `
      -Executable $client.Source `
      -Arguments $arguments `
      -OutputFile $partialPath
  }

  $backup = Get-Item -LiteralPath $partialPath
  if ($backup.Length -lt 100) {
    throw 'The dump is unexpectedly small; refusing to publish an invalid backup.'
  }
  $header = Get-FixFlowDumpHeader $partialPath
  if ($header -notmatch 'MySQL dump|MariaDB dump') {
    throw 'The dump header could not be verified.'
  }
  Move-Item -LiteralPath $partialPath -Destination $finalPath

  $cutoff = [DateTime]::UtcNow.AddDays(-$RetentionDays)
  Get-ChildItem -LiteralPath $backupRoot -Filter "fixflow-$database-*.sql" -File |
    Where-Object { $_.LastWriteTimeUtc -lt $cutoff } |
    ForEach-Object { Remove-Item -LiteralPath $_.FullName -Force }

  $hash = Get-FileHash -LiteralPath $finalPath -Algorithm SHA256
  [PSCustomObject]@{
    Backup = $finalPath
    Bytes = (Get-Item -LiteralPath $finalPath).Length
    SHA256 = $hash.Hash
    RetentionDays = $RetentionDays
  }
} finally {
  if (Test-Path -LiteralPath $partialPath) {
    Remove-Item -LiteralPath $partialPath -Force
  }
  if ($credentialsPath -and (Test-Path -LiteralPath $credentialsPath)) {
    Remove-Item -LiteralPath $credentialsPath -Force
  }
}
