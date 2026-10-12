param(
    [string]$ReportPath,
    [string]$OutputPath
)

$clipboardEmoji = [char]0xD83D + [char]0xDCCB  # 📋 (surrogate pair)
$arrowEmoji = [char]0x279C                   # ➜

$html = Get-Content $ReportPath -Raw
$content = $html | Select-String -Pattern '(?s)<div class="task-category">.*?</ul>' -AllMatches | ForEach-Object { $_.Matches.Value }
$content = $content -replace '<div class="task-category">', "$clipboardEmoji "
$content = $content -replace '<li>', "`n  $arrowEmoji "
$content = $content -replace '<[^>]*>', ''
$content = $content -replace '&nbsp;', ' '
$content = $content -replace '&', '&'
$content = $content -replace '<', '<'
$content = $content -replace '>', '>'
$content = $content -replace '"', '"'
$content = $content -replace "'", "'"
$content = $content -replace '&apos;', "'"
$lines = $content -split "`n"
$result = @()
foreach ($line in $lines) {
    if ($line.Trim() -match "^$arrowEmoji") { $result += $line.Trim() }
    else { $result += $line.TrimStart() }
}
$result = $result -join "`n"
[System.IO.File]::WriteAllText($OutputPath, $result, [System.Text.Encoding]::UTF8)