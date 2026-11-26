function Get-FixFlowSetting {
  param(
    [Parameter(Mandatory)][string]$Name,
    [Parameter(Mandatory)][string]$EnvironmentFile
  )

  $environmentValue = [Environment]::GetEnvironmentVariable($Name)
  if ($environmentValue) {
    return $environmentValue
  }
  if (-not (Test-Path -LiteralPath $EnvironmentFile)) {
    throw "Required environment setting '$Name' is missing."
  }

  $match = Get-Content -LiteralPath $EnvironmentFile |
    Where-Object { $_ -match "^$([regex]::Escape($Name))=" } |
    Select-Object -First 1
  if (-not $match) {
    throw "Required environment setting '$Name' is missing."
  }
  $value = $match.Substring($Name.Length + 1)
  if ($value.Length -ge 2 -and
      (($value.StartsWith('"') -and $value.EndsWith('"')) -or
       ($value.StartsWith("'") -and $value.EndsWith("'")))) {
    $value = $value.Substring(1, $value.Length - 2)
  }
  return $value
}

function ConvertTo-FixFlowArgument {
  param([Parameter(Mandatory)][AllowEmptyString()][string]$Value)

  $builder = [System.Text.StringBuilder]::new()
  [void]$builder.Append('"')
  $backslashes = 0
  foreach ($character in $Value.ToCharArray()) {
    if ($character -eq '\') {
      $backslashes += 1
    } elseif ($character -eq '"') {
      [void]$builder.Append([string]::new('\', (2 * $backslashes) + 1))
      [void]$builder.Append('"')
      $backslashes = 0
    } else {
      if ($backslashes -gt 0) {
        [void]$builder.Append([string]::new('\', $backslashes))
        $backslashes = 0
      }
      [void]$builder.Append($character)
    }
  }
  if ($backslashes -gt 0) {
    [void]$builder.Append([string]::new('\', 2 * $backslashes))
  }
  [void]$builder.Append('"')
  return $builder.ToString()
}

function New-FixFlowMysqlProcess {
  param(
    [Parameter(Mandatory)][string]$Executable,
    [Parameter(Mandatory)][string[]]$Arguments,
    [string]$InputFile,
    [string]$OutputFile,
    [int]$TimeoutSeconds = 14400
  )

  $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
  $startInfo.FileName = $Executable
  $startInfo.Arguments = (
    $Arguments | ForEach-Object { ConvertTo-FixFlowArgument -Value $_ }
  ) -join ' '
  $startInfo.UseShellExecute = $false
  $startInfo.CreateNoWindow = $true
  $startInfo.RedirectStandardInput = [bool]$InputFile
  $startInfo.RedirectStandardOutput = [bool]$OutputFile
  $startInfo.RedirectStandardError = $true

  $process = [System.Diagnostics.Process]::new()
  $process.StartInfo = $startInfo
  if (-not $process.Start()) {
    throw "Could not start '$Executable'."
  }

  $stderrTask = $process.StandardError.ReadToEndAsync()
  $outputStream = $null
  $inputStream = $null
  try {
    if ($OutputFile) {
      $outputStream = [System.IO.File]::Create($OutputFile)
      $process.StandardOutput.BaseStream.CopyTo($outputStream)
      $outputStream.Flush()
    }
    if ($InputFile) {
      $inputStream = [System.IO.File]::OpenRead($InputFile)
      $inputStream.CopyTo($process.StandardInput.BaseStream)
      $process.StandardInput.Close()
    }
    if (-not $process.WaitForExit($TimeoutSeconds * 1000)) {
      $process.Kill()
      $process.WaitForExit()
      throw "The MySQL client exceeded the $TimeoutSeconds second timeout."
    }
    $stderr = $stderrTask.GetAwaiter().GetResult()
    if ($process.ExitCode -ne 0) {
      throw "The MySQL client failed with exit code $($process.ExitCode): $stderr"
    }
    return $stderr
  } finally {
    if ($outputStream) { $outputStream.Dispose() }
    if ($inputStream) { $inputStream.Dispose() }
    $process.Dispose()
  }
}

function Get-FixFlowDumpHeader {
  param([Parameter(Mandatory)][string]$Path)

  $stream = [System.IO.File]::OpenRead($Path)
  try {
    $buffer = New-Object byte[] 4096
    $count = $stream.Read($buffer, 0, $buffer.Length)
    return [System.Text.Encoding]::UTF8.GetString($buffer, 0, $count)
  } finally {
    $stream.Dispose()
  }
}

function New-FixFlowMysqlDefaultsFile {
  param(
    [Parameter(Mandatory)][string]$HostName,
    [Parameter(Mandatory)][string]$Port,
    [Parameter(Mandatory)][string]$UserName,
    [Parameter(Mandatory)][string]$Password
  )

  foreach ($value in @($HostName, $Port, $UserName, $Password)) {
    if ($value.Contains("`r") -or $value.Contains("`n")) {
      throw 'MySQL connection values must not contain line breaks.'
    }
  }
  $path = [System.IO.Path]::GetTempFileName()
  $escape = {
    param([string]$Value)
    '"' + $Value.Replace('\', '\\').Replace('"', '\"') + '"'
  }
  $contents = @(
    '[client]'
    "host=$(& $escape $HostName)"
    "port=$Port"
    "user=$(& $escape $UserName)"
    "password=$(& $escape $Password)"
  ) -join "`n"
  [System.IO.File]::WriteAllText(
    $path,
    $contents,
    [System.Text.UTF8Encoding]::new($false)
  )

  if ($env:OS -eq 'Windows_NT') {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
    & icacls.exe $path /inheritance:r /grant:r "$identity`:(F)" | Out-Null
    if ($LASTEXITCODE -ne 0) {
      Remove-Item -LiteralPath $path -Force
      throw 'Could not restrict access to the temporary MySQL credential file.'
    }
  }
  return $path
}
