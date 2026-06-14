$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

$Model = if ($env:OLLAMA_MODEL) { $env:OLLAMA_MODEL } else { "llama3.2:3b" }
$FrontendUrl = "http://127.0.0.1:5173"
$BackendUrl = "http://127.0.0.1:8787/api/health"
$LogDir = Join-Path $Root "logs"
$ModelDir = Join-Path $Root "ollama-models"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
New-Item -ItemType Directory -Force -Path $ModelDir | Out-Null
$env:OLLAMA_MODELS = $ModelDir
[Environment]::SetEnvironmentVariable("OLLAMA_MODELS", $ModelDir, "User")

function Get-OllamaCommand {
  $cmd = Get-Command ollama -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }

  $candidates = @(
    (Join-Path $env:LOCALAPPDATA "Programs\Ollama\ollama.exe"),
    (Join-Path $env:ProgramFiles "Ollama\ollama.exe"),
    (Join-Path ${env:ProgramFiles(x86)} "Ollama\ollama.exe")
  )
  foreach ($candidate in $candidates) {
    if ($candidate -and (Test-Path $candidate)) { return $candidate }
  }
  return $null
}

function Test-HttpOk($Url) {
  try {
    $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2
    return $response.StatusCode -ge 200 -and $response.StatusCode -lt 500
  } catch {
    return $false
  }
}

function Wait-Http($Url, $Name, $Seconds) {
  $deadline = (Get-Date).AddSeconds($Seconds)
  while ((Get-Date) -lt $deadline) {
    if (Test-HttpOk $Url) { return $true }
    Start-Sleep -Milliseconds 500
  }
  Write-Host "$Name did not answer yet. Check logs if the app does not open."
  return $false
}

Write-Host "Starting Emberglass Local Solo DM..."

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "Node.js is required and was not found on PATH."
  Write-Host "Install Node.js 20+ once, then run this launcher again."
  pause
  exit 1
}

if (-not (Test-Path (Join-Path $Root "node_modules"))) {
  Write-Host "Installing local project dependencies..."
  & npm.cmd install
}

$ollama = Get-OllamaCommand
if (-not $ollama) {
  try {
    Write-Host "Ollama was not found. Installing Ollama locally from the official installer..."
    Invoke-RestMethod https://ollama.com/install.ps1 | Invoke-Expression
    $ollama = Get-OllamaCommand
  } catch {
    Write-Host "Could not install Ollama automatically. The app will use mock narration."
  }
}

if ($ollama) {
  if (-not (Test-HttpOk "http://127.0.0.1:11434/api/tags")) {
    Write-Host "Starting Ollama..."
    Start-Process -FilePath $ollama -ArgumentList "serve" -WindowStyle Hidden -RedirectStandardOutput (Join-Path $LogDir "ollama.out.log") -RedirectStandardError (Join-Path $LogDir "ollama.err.log")
    Start-Sleep -Seconds 3
  }

  try {
    $tags = Invoke-RestMethod -Uri "http://127.0.0.1:11434/api/tags" -TimeoutSec 5
    $hasModel = $false
    foreach ($entry in $tags.models) {
      if ($entry.name -eq $Model -or $entry.name.StartsWith("$Model`:", [System.StringComparison]::OrdinalIgnoreCase)) {
        $hasModel = $true
      }
    }
    if (-not $hasModel) {
      Write-Host "Downloading local narrator model $Model. This can take a while the first time..."
      & $ollama pull $Model
    }
    $env:OLLAMA_MODEL = $Model
  } catch {
    Write-Host "Ollama is installed but not answering cleanly. The app will use mock narration until Ollama works."
  }
} else {
  Write-Host "Ollama was not found. The app will use mock narration. You can install Ollama later and this launcher will use it."
}

$ForgeScript = Join-Path $Root "scripts\Start-ImageForge.ps1"
if (Test-Path $ForgeScript) {
  try {
    if (-not (Test-HttpOk "http://127.0.0.1:7860/sdapi/v1/options")) {
      Write-Host "Starting local image forge if installed..."
      Start-Process -FilePath "powershell.exe" -ArgumentList "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $ForgeScript -WorkingDirectory $Root -WindowStyle Hidden
    }
  } catch {
    Write-Host "Image forge did not start. The app will use candle-card art until it is ready."
  }
}

if (-not (Test-HttpOk $BackendUrl)) {
  Write-Host "Starting backend..."
  Start-Process -FilePath "npm.cmd" -ArgumentList "run", "dev:backend" -WorkingDirectory $Root -WindowStyle Hidden -RedirectStandardOutput (Join-Path $LogDir "backend.out.log") -RedirectStandardError (Join-Path $LogDir "backend.err.log")
}

if (-not (Test-HttpOk $FrontendUrl)) {
  Write-Host "Starting frontend..."
  Start-Process -FilePath "npm.cmd" -ArgumentList "run", "dev:frontend" -WorkingDirectory $Root -WindowStyle Hidden -RedirectStandardOutput (Join-Path $LogDir "frontend.out.log") -RedirectStandardError (Join-Path $LogDir "frontend.err.log")
}

Wait-Http $BackendUrl "Backend" 20 | Out-Null
Wait-Http $FrontendUrl "Frontend" 30 | Out-Null

Write-Host "Opening $FrontendUrl"
Start-Process $FrontendUrl
Write-Host "Game is running. You can close this window; servers keep running in the background."
Start-Sleep -Seconds 3
