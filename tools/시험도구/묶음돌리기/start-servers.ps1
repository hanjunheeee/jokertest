param([string[]]$Apps = @('backend', 'desktop', 'mobile', 'mon'))
# 시험 서버 켜기 (내 PID만 .run/묶음돌리기/pids.txt 에 적음), 하나씩 켜고 포트가 열릴 때까지 기다림
# 쓰는 법: powershell -File start-servers.ps1 [-Apps backend,desktop,mobile,admin,mon]  (mon = CPU 기록)
# -File 로 부르면 "backend,mobile" 이 한 글자로 옴 → 쉼표로 나눔
$Apps = @($Apps | ForEach-Object { $_ -split ',' } | ForEach-Object { $_.Trim() } | Where-Object { $_ })
$S = Join-Path (Split-Path $PSScriptRoot -Parent) ('.run\' + (Split-Path $PSScriptRoot -Leaf))
New-Item -ItemType Directory -Force $S | Out-Null
$E2E = Resolve-Path (Join-Path $PSScriptRoot '..\..\..\e2e')
$ports = @{ backend = 4100; desktop = 5273; mobile = 5274; admin = 5275 }
Set-Location $E2E
$env:E2E_FRONT = 'build'
$env:E2E_FRONT_REBUILD = '0'
$env:VITE_API_BASE_URL = 'http://localhost:4100'
foreach ($a in $Apps) {
    if ($a -eq 'mon') {
        $m = Start-Process powershell -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', (Join-Path $PSScriptRoot 'mon.ps1')) -PassThru -WindowStyle Hidden
        Add-Content (Join-Path $S 'pids.txt') $m.Id
        "mon pid $($m.Id)"
        continue
    }
    if (-not $ports.ContainsKey($a)) { "unknown app $a"; continue }
    $busy = Get-NetTCPConnection -State Listen -LocalPort $ports[$a] -ErrorAction SilentlyContinue
    if ($busy) { "$a port $($ports[$a]) already busy (pid $($busy.OwningProcess -join ','))"; continue }
    if ($a -eq 'backend') { $args2 = @('scripts/start-backend.js') } else { $args2 = @('scripts/serve-front.js', $a) }
    $p = Start-Process node -ArgumentList $args2 -RedirectStandardOutput (Join-Path $S "$a.out") -RedirectStandardError (Join-Path $S "$a.err") -PassThru -WindowStyle Hidden
    Add-Content (Join-Path $S 'pids.txt') $p.Id
    "$a pid $($p.Id)"
    $deadline = (Get-Date).AddMinutes(8)
    while ((Get-Date) -lt $deadline) {
        if (Get-NetTCPConnection -State Listen -LocalPort $ports[$a] -ErrorAction SilentlyContinue) { "$a up $(Get-Date -Format HH:mm:ss)"; break }
        if ($p.HasExited) { "$a exited code $($p.ExitCode) (see $a.err)"; break }
        Start-Sleep -Seconds 3
    }
}
