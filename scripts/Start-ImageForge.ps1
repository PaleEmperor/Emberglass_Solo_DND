$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$ForgeDir = Join-Path $Root "image-forge"
$RepoDir = Join-Path $ForgeDir "stable-diffusion-webui-forge"
$ModelDir = Join-Path $RepoDir "models\Stable-diffusion"
$LogDir = Join-Path $Root "logs"
$ModelFile = Join-Path $ModelDir "sd_xl_base_1.0.safetensors"
$ModelUrl = "https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0/resolve/main/sd_xl_base_1.0.safetensors?download=true"

New-Item -ItemType Directory -Force -Path $ForgeDir, $LogDir | Out-Null

function Test-HttpOk($Url) {
  try {
    $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 3
    return $response.StatusCode -ge 200 -and $response.StatusCode -lt 500
  } catch {
    return $false
  }
}

if (Test-HttpOk "http://127.0.0.1:7860/sdapi/v1/options") {
  Write-Host "Image forge already answers at http://127.0.0.1:7860"
  exit 0
}

if (-not (Test-Path (Join-Path $RepoDir ".git"))) {
  $existingModels = Join-Path $RepoDir "models"
  $savedModels = Join-Path $ForgeDir "_saved_models"
  if (Test-Path $existingModels) {
    New-Item -ItemType Directory -Force -Path $savedModels | Out-Null
    Move-Item -Force -Path $existingModels -Destination $savedModels
  }
  if (Test-Path $RepoDir) {
    Remove-Item -Recurse -Force -Path $RepoDir
  }
  Write-Host "Installing Stable Diffusion WebUI Forge..."
  git clone https://github.com/lllyasviel/stable-diffusion-webui-forge.git $RepoDir
  if (Test-Path (Join-Path $savedModels "models")) {
    Move-Item -Force -Path (Join-Path $savedModels "models") -Destination (Join-Path $RepoDir "models")
  }
}

New-Item -ItemType Directory -Force -Path $ModelDir | Out-Null

if (-not (Test-Path $ModelFile)) {
  Write-Host "Downloading SDXL base checkpoint. This is about 6.9 GB and only happens once..."
  curl.exe -L --fail --continue-at - --output $ModelFile $ModelUrl
}

Write-Host "Checking image forge Python packages..."
python -m pip install --user --upgrade setuptools wheel | Out-Host
$numpyOk = $false
try {
  $numpyVersion = python -c "import numpy; print(numpy.__version__)"
  $numpyOk = $numpyVersion -like "1.26.*"
} catch {}
if (-not $numpyOk) {
  python -m pip install --user --force-reinstall "numpy==1.26.4" | Out-Host
}
$clipOk = $false
try {
  python -c "import clip" | Out-Null
  $clipOk = $true
} catch {}
if (-not $clipOk) {
  python -m pip install --user --no-build-isolation https://github.com/openai/CLIP/archive/d50d76daa670286dd6cacf3bcd80b5e4823fc8e1.zip | Out-Host
}

Write-Host "Starting image forge API at http://127.0.0.1:7860 ..."
$Args = @(
  "-u", "launch.py",
  "--api",
  "--port", "7860",
  "--xformers",
  "--cuda-malloc",
  "--skip-torch-cuda-test",
  "--theme", "dark"
)
Start-Process -FilePath "python" -ArgumentList $Args -WorkingDirectory $RepoDir -WindowStyle Hidden -RedirectStandardOutput (Join-Path $LogDir "image-forge.out.log") -RedirectStandardError (Join-Path $LogDir "image-forge.err.log")

Write-Host "The first start can take several minutes while Python packages are installed."
