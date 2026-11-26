[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$BackupFile,
  [Parameter(Mandatory)][string]$Database,
  [string]$EnvironmentFile,
  [switch]$Docker,
  [switch]$ConfirmRestore
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'mysql-client-helpers.ps1')

if (-not $ConfirmRestore) {
  throw 'Restore is destructive to tables in the target database. Re-run with -ConfirmRestore after verifying the target and backup.'
}
$repositoryRoot = Split-Path $PSScriptRoot -Parent
if (-not $EnvironmentFile) {
  $EnvironmentFile = if ($Docker) {
    Join-Path $repositoryRoot '.env.production'
  } else {
    Join-Path $repositoryRoot 'fixflow-api\.env'
  }
}
$EnvironmentFile = [System.IO.Path]::GetFullPath($EnvironmentFile)
$BackupFile = [System.IO.Path]::GetFullPath($BackupFile)
if ($Database -notmatch '^[A-Za-z0-9_]+$') {
  throw 'Database must contain only letters, numbers, and underscores.'
}
if (-not (Test-Path -LiteralPath $BackupFile -PathType Leaf)) {
  throw 'Backup file does not exist.'
}
$header = Get-FixFlowDumpHeader $BackupFile
if ($header -notmatch 'MySQL dump|MariaDB dump') {
  throw 'Backup header verification failed.'
}

$confirmed = Read-Host "Type RESTORE to import '$BackupFile' into database '$Database'"
if ($confirmed -cne 'RESTORE') {
  throw 'Restore cancelled.'
}

$credentialsPath = $null
try {
  if ($Docker) {
    $docker = Get-Command docker.exe -ErrorAction Stop
    $composeArguments = @(
      'compose',
      '--project-name', 'fixflow-ai-prod',
      '--env-file', $EnvironmentFile,
      '--file', (Join-Path $repositoryRoot 'docker-compose.prod.yml'),
      'exec', '--no-TTY', 'mysql', 'sh', '-c',
      'export MYSQL_PWD="$(cat /run/secrets/mysql_root_password)"; exec mysql --user=root --database="$1"',
      'fixflow-restore',
      $Database
    )
    New-FixFlowMysqlProcess `
      -Executable $docker.Source `
      -Arguments $composeArguments `
      -InputFile $BackupFile
  } else {
    $hostName = Get-FixFlowSetting 'MYSQL_HOST' $EnvironmentFile
    $port = Get-FixFlowSetting 'MYSQL_PORT' $EnvironmentFile
    $userName = Get-FixFlowSetting 'MYSQL_USER' $EnvironmentFile
    $password = Get-FixFlowSetting 'MYSQL_PASSWORD' $EnvironmentFile
    $credentialsPath = New-FixFlowMysqlDefaultsFile $hostName $port $userName $password
    $client = Get-Command mysql.exe -ErrorAction Stop
    New-FixFlowMysqlProcess `
      -Executable $client.Source `
      -Arguments @("--defaults-extra-file=$credentialsPath", "--database=$Database") `
      -InputFile $BackupFile
  }
  Write-Output "Restore completed for database '$Database'. Verify migrations and application health before routing traffic."
} finally {
  if ($credentialsPath -and (Test-Path -LiteralPath $credentialsPath)) {
    Remove-Item -LiteralPath $credentialsPath -Force
  }
}
