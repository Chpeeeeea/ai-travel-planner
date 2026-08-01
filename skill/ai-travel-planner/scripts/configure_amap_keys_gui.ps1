[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()

function Add-Field {
    param(
        [Parameter(Mandatory)][System.Windows.Forms.Form]$Form,
        [Parameter(Mandatory)][string]$Title,
        [Parameter(Mandatory)][string]$Hint,
        [Parameter(Mandatory)][int]$Top
    )

    $label = New-Object System.Windows.Forms.Label
    $label.Location = New-Object System.Drawing.Point(28, $Top)
    $label.Size = New-Object System.Drawing.Size(525, 22)
    $label.Text = $Title
    $label.Font = New-Object System.Drawing.Font('Microsoft YaHei UI', 9, [System.Drawing.FontStyle]::Bold)
    $Form.Controls.Add($label)

    $box = New-Object System.Windows.Forms.TextBox
    $box.Location = New-Object System.Drawing.Point(28, ($Top + 25))
    $box.Size = New-Object System.Drawing.Size(525, 27)
    $box.UseSystemPasswordChar = $true
    $box.Font = New-Object System.Drawing.Font('Consolas', 10)
    $Form.Controls.Add($box)

    $hintLabel = New-Object System.Windows.Forms.Label
    $hintLabel.Location = New-Object System.Drawing.Point(28, ($Top + 55))
    $hintLabel.Size = New-Object System.Drawing.Size(525, 20)
    $hintLabel.Text = $Hint
    $hintLabel.ForeColor = [System.Drawing.Color]::DimGray
    $hintLabel.Font = New-Object System.Drawing.Font('Microsoft YaHei UI', 8)
    $Form.Controls.Add($hintLabel)

    return $box
}

$form = New-Object System.Windows.Forms.Form
$form.Text = 'AI Travel Planner - 配置高德密钥'
$form.ClientSize = New-Object System.Drawing.Size(585, 490)
$form.StartPosition = 'CenterScreen'
$form.FormBorderStyle = 'FixedDialog'
$form.MaximizeBox = $false
$form.MinimizeBox = $false
$form.Font = New-Object System.Drawing.Font('Microsoft YaHei UI', 9)

$title = New-Object System.Windows.Forms.Label
$title.Location = New-Object System.Drawing.Point(28, 20)
$title.Size = New-Object System.Drawing.Size(525, 30)
$title.Text = '填写两个 Key 和一个配套安全密钥'
$title.Font = New-Object System.Drawing.Font('Microsoft YaHei UI', 14, [System.Drawing.FontStyle]::Bold)
$form.Controls.Add($title)

$intro = New-Object System.Windows.Forms.Label
$intro.Location = New-Object System.Drawing.Point(28, 55)
$intro.Size = New-Object System.Drawing.Size(525, 38)
$intro.Text = '请从高德控制台复制后粘贴。不要把密钥发送到聊天或写入项目文件。'
$intro.ForeColor = [System.Drawing.Color]::DimGray
$form.Controls.Add($intro)

$webServiceBox = Add-Field -Form $form -Title '1. Web 服务 Key' -Hint '高德控制台平台：Web服务；用于真实 POI、路线规划和 MCP。' -Top 100
$jsApiBox = Add-Field -Form $form -Title '2. Web端（JS API）Key' -Hint '高德控制台平台：Web端（JS API）；用于浏览器地图。' -Top 190
$securityBox = Add-Field -Form $form -Title '3. securityJsCode 安全密钥' -Hint '创建第 2 个 Key 后显示的配套安全密钥，不是 Web 服务 Key。' -Top 280

$showSecrets = New-Object System.Windows.Forms.CheckBox
$showSecrets.Location = New-Object System.Drawing.Point(28, 370)
$showSecrets.Size = New-Object System.Drawing.Size(160, 25)
$showSecrets.Text = '显示输入内容'
$showSecrets.Add_CheckedChanged({
    $masked = -not $showSecrets.Checked
    $webServiceBox.UseSystemPasswordChar = $masked
    $jsApiBox.UseSystemPasswordChar = $masked
    $securityBox.UseSystemPasswordChar = $masked
})
$form.Controls.Add($showSecrets)

$notice = New-Object System.Windows.Forms.Label
$notice.Location = New-Object System.Drawing.Point(28, 400)
$notice.Size = New-Object System.Drawing.Size(525, 35)
$notice.Text = '保存位置：当前 Windows 用户环境变量。保存后需要完全退出并重新打开 Codex。'
$notice.ForeColor = [System.Drawing.Color]::DarkOrange
$form.Controls.Add($notice)

$saveButton = New-Object System.Windows.Forms.Button
$saveButton.Location = New-Object System.Drawing.Point(385, 440)
$saveButton.Size = New-Object System.Drawing.Size(168, 34)
$saveButton.Text = '保存配置'
$saveButton.BackColor = [System.Drawing.Color]::FromArgb(25, 118, 210)
$saveButton.ForeColor = [System.Drawing.Color]::White
$saveButton.FlatStyle = 'Flat'
$form.AcceptButton = $saveButton
$form.Controls.Add($saveButton)

$cancelButton = New-Object System.Windows.Forms.Button
$cancelButton.Location = New-Object System.Drawing.Point(275, 440)
$cancelButton.Size = New-Object System.Drawing.Size(95, 34)
$cancelButton.Text = '取消'
$cancelButton.Add_Click({ $form.Close() })
$form.CancelButton = $cancelButton
$form.Controls.Add($cancelButton)

$saveButton.Add_Click({
    $webServiceKey = $webServiceBox.Text.Trim()
    $jsApiKey = $jsApiBox.Text.Trim()
    $securityJsCode = $securityBox.Text.Trim()

    if ([string]::IsNullOrWhiteSpace($webServiceKey) -or
        [string]::IsNullOrWhiteSpace($jsApiKey) -or
        [string]::IsNullOrWhiteSpace($securityJsCode)) {
        [System.Windows.Forms.MessageBox]::Show(
            '三项都需要填写。这里是两个 Key，加上 JS API Key 配套的 securityJsCode。',
            '信息不完整',
            [System.Windows.Forms.MessageBoxButtons]::OK,
            [System.Windows.Forms.MessageBoxIcon]::Warning
        ) | Out-Null
        return
    }

    try {
        [Environment]::SetEnvironmentVariable('AMAP_MAPS_API_KEY', $webServiceKey, [EnvironmentVariableTarget]::User)
        [Environment]::SetEnvironmentVariable('AMAP_WEBSERVICE_KEY', $webServiceKey, [EnvironmentVariableTarget]::User)
        [Environment]::SetEnvironmentVariable('AMAP_JSAPI_KEY', $jsApiKey, [EnvironmentVariableTarget]::User)
        [Environment]::SetEnvironmentVariable('AMAP_SECURITY_JS_CODE', $securityJsCode, [EnvironmentVariableTarget]::User)

        $webServiceBox.Clear()
        $jsApiBox.Clear()
        $securityBox.Clear()
        $webServiceKey = $null
        $jsApiKey = $null
        $securityJsCode = $null

        [System.Windows.Forms.MessageBox]::Show(
            "配置已保存。`r`n`r`n请完全退出并重新打开 Codex，然后告诉我：已配置。",
            '配置成功',
            [System.Windows.Forms.MessageBoxButtons]::OK,
            [System.Windows.Forms.MessageBoxIcon]::Information
        ) | Out-Null
        $form.Close()
    }
    catch {
        [System.Windows.Forms.MessageBox]::Show(
            "保存失败：$($_.Exception.Message)",
            '配置失败',
            [System.Windows.Forms.MessageBoxButtons]::OK,
            [System.Windows.Forms.MessageBoxIcon]::Error
        ) | Out-Null
    }
})

[void]$form.ShowDialog()
