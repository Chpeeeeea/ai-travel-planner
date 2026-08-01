[CmdletBinding()]
param(
    [ValidateSet('User', 'Process')]
    [string]$Scope = 'User',

    [switch]$SkipDoctor,

    [Security.SecureString]$WebServiceKeySecure,

    [Security.SecureString]$JsApiKeySecure,

    [Security.SecureString]$SecurityJsCodeSecure
)

$ErrorActionPreference = 'Stop'

function Read-PlainSecret {
    param(
        [Parameter(Mandatory)][string]$Prompt,
        [Security.SecureString]$SecureValue
    )

    if ($null -eq $SecureValue) {
        $SecureValue = Read-Host -Prompt $Prompt -AsSecureString
    }
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureValue)
    try {
        $plainValue = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
        if ([string]::IsNullOrWhiteSpace($plainValue)) {
            throw "输入不能为空：$Prompt"
        }
        return $plainValue.Trim()
    }
    finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    }
}

function Set-AmapEnvironmentValue {
    param(
        [Parameter(Mandatory)][string]$Name,
        [Parameter(Mandatory)][string]$Value,
        [Parameter(Mandatory)][string]$TargetScope
    )

    if ($TargetScope -eq 'User') {
        [Environment]::SetEnvironmentVariable($Name, $Value, [EnvironmentVariableTarget]::User)
    }

    [Environment]::SetEnvironmentVariable($Name, $Value, [EnvironmentVariableTarget]::Process)
}

Write-Host ''
Write-Host 'AI Travel Planner - 高德密钥配置向导' -ForegroundColor Cyan
Write-Host '========================================' -ForegroundColor DarkGray
Write-Host '需要输入 3 项，输入时不会显示字符：'
Write-Host '1. Web 服务 Key：用于 MCP、POI 和路径规划'
Write-Host '2. Web端（JS API）Key：用于网页交互地图'
Write-Host '3. securityJsCode：与第 2 项 JS API Key 配套的安全密钥'
Write-Host ''

if ($Scope -eq 'User') {
    Write-Warning '密钥将保存为当前 Windows 用户的环境变量，以便重启 Codex 后读取。用户环境变量不是加密保险库，同一用户下的进程可以读取。'
}
else {
    Write-Host 'Process 模式只对本次 PowerShell 进程及其子进程有效，关闭窗口后失效。' -ForegroundColor Yellow
}

$webServiceKey = Read-PlainSecret -Prompt '请输入 Web 服务 Key（travel_mcp）' -SecureValue $WebServiceKeySecure
$jsApiKey = Read-PlainSecret -Prompt '请输入 Web端（JS API）Key（travel_web）' -SecureValue $JsApiKeySecure
$securityJsCode = Read-PlainSecret -Prompt '请输入 travel_web 配套的 securityJsCode 安全密钥' -SecureValue $SecurityJsCodeSecure

Set-AmapEnvironmentValue -Name 'AMAP_MAPS_API_KEY' -Value $webServiceKey -TargetScope $Scope
Set-AmapEnvironmentValue -Name 'AMAP_WEBSERVICE_KEY' -Value $webServiceKey -TargetScope $Scope
Set-AmapEnvironmentValue -Name 'AMAP_JSAPI_KEY' -Value $jsApiKey -TargetScope $Scope
Set-AmapEnvironmentValue -Name 'AMAP_SECURITY_JS_CODE' -Value $securityJsCode -TargetScope $Scope

$webServiceKey = $null
$jsApiKey = $null
$securityJsCode = $null
[GC]::Collect()

Write-Host ''
Write-Host '配置完成：' -ForegroundColor Green
Write-Host '  AMAP_MAPS_API_KEY       = SET'
Write-Host '  AMAP_WEBSERVICE_KEY     = SET（与 MCP Key 相同）'
Write-Host '  AMAP_JSAPI_KEY          = SET'
Write-Host '  AMAP_SECURITY_JS_CODE   = SET'

if (-not $SkipDoctor) {
    $doctorScript = Join-Path $PSScriptRoot 'amap_mcp_bridge.py'
    $python = Get-Command python -ErrorAction SilentlyContinue
    if ($python -and (Test-Path -LiteralPath $doctorScript)) {
        Write-Host ''
        Write-Host '正在运行高德 MCP 诊断……' -ForegroundColor Cyan
        & $python.Source $doctorScript doctor
        $doctorExit = $LASTEXITCODE
        if ($doctorExit -ne 0) {
            Write-Warning "密钥已保存，但 MCP 诊断未通过（退出码 $doctorExit）。请保留窗口中的诊断信息。"
        }
    }
    else {
        Write-Warning '未找到 Python 或 MCP 诊断脚本，已跳过自动诊断。'
    }
}

if ($Scope -eq 'User') {
    Write-Host ''
    Write-Host '下一步：完全退出并重新打开 Codex，使新环境变量生效。' -ForegroundColor Yellow
}
