$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$tempRoot = Join-Path $env:TEMP ("waseet-clean-" + [guid]::NewGuid().Guid)
$stageRoot = Join-Path $tempRoot "waseet-final-clean"
$desktopZip = Join-Path ([Environment]::GetFolderPath("Desktop")) "waseet-final-clean.zip"

$excludedDirectoryNames = @(
    "node_modules",
    ".next",
    ".git",
    ".venv",
    "venv",
    "env",
    "__pycache__",
    ".pytest_cache",
    ".mypy_cache",
    "dist",
    "build",
    ".docker-local",
    ".pydeps",
    ".pydeps_local"
)

$excludedExtensions = @(".pyc", ".pyo", ".pyd", ".log", ".zip")
$allowedEnvFiles = @(".env.example", ".env.production.example")

function Test-ShouldSkipDirectory {
    param(
        [Parameter(Mandatory = $true)]
        [string] $Name
    )

    return $excludedDirectoryNames -contains $Name
}

function Test-ShouldSkipFile {
    param(
        [Parameter(Mandatory = $true)]
        [System.IO.FileInfo] $Item
    )

    if ($excludedExtensions -contains $Item.Extension.ToLowerInvariant()) {
        return $true
    }

    if ($Item.Name -eq "package-lock.json" -and $Item.DirectoryName -eq $repoRoot) {
        return $true
    }

    if ($Item.Name -eq ".env") {
        return $true
    }

    if ($Item.Name.StartsWith(".env", [System.StringComparison]::OrdinalIgnoreCase) -and -not ($allowedEnvFiles -contains $Item.Name)) {
        return $true
    }

    return $false
}

function Copy-CleanTree {
    param(
        [Parameter(Mandatory = $true)]
        [string] $SourceDir,
        [Parameter(Mandatory = $true)]
        [string] $DestinationDir
    )

    New-Item -ItemType Directory -Path $DestinationDir -Force | Out-Null

    foreach ($item in Get-ChildItem -LiteralPath $SourceDir -Force) {
        if ($item.PSIsContainer) {
            if (Test-ShouldSkipDirectory -Name $item.Name) {
                continue
            }

            Copy-CleanTree -SourceDir $item.FullName -DestinationDir (Join-Path $DestinationDir $item.Name)
            continue
        }

        if (Test-ShouldSkipFile -Item $item) {
            continue
        }

        Copy-Item -LiteralPath $item.FullName -Destination (Join-Path $DestinationDir $item.Name) -Force
    }
}

if (Test-Path $stageRoot) {
    Remove-Item -LiteralPath $stageRoot -Recurse -Force
}

New-Item -ItemType Directory -Path $stageRoot -Force | Out-Null

foreach ($item in Get-ChildItem -LiteralPath $repoRoot -Force) {
    if ($item.PSIsContainer) {
        if (Test-ShouldSkipDirectory -Name $item.Name) {
            continue
        }

        Copy-CleanTree -SourceDir $item.FullName -DestinationDir (Join-Path $stageRoot $item.Name)
        continue
    }

    if (Test-ShouldSkipFile -Item $item) {
        continue
    }

    Copy-Item -LiteralPath $item.FullName -Destination (Join-Path $stageRoot $item.Name) -Force
}

if (Test-Path $desktopZip) {
    Remove-Item -LiteralPath $desktopZip -Force
}

Compress-Archive -Path (Join-Path $stageRoot "*") -DestinationPath $desktopZip -Force

Write-Output "Created clean zip: $desktopZip"
