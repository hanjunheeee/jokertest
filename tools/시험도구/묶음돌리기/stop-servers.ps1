# start-servers.ps1 가 켠 것만 끔 (.run/묶음돌리기/pids.txt 의 PID 와 그 자식), 끈 뒤 포트가 비었는지 보여 줌
$S = Join-Path (Split-Path $PSScriptRoot -Parent) ('.run\' + (Split-Path $PSScriptRoot -Leaf))
$pidFile = Join-Path $S 'pids.txt'
if (Test-Path $pidFile) {
    foreach ($id in (Get-Content $pidFile | Where-Object { $_ -match '^\d+$' })) {
        if (Get-Process -Id $id -ErrorAction SilentlyContinue) { taskkill /PID $id /T /F | Out-Null; "stopped $id" } else { "gone $id" }
    }
    Remove-Item $pidFile -Force
} else { 'no pids.txt' }
foreach ($port in 4100, 5273, 5274, 5275) {
    $busy = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue
    if ($busy) { "port $port still busy (pid $($busy.OwningProcess -join ','))" } else { "port $port free" }
}
