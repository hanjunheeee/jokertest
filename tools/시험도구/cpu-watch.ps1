# 되살린 도구(2026-11-10 맥북 이어받기 묶음), 경로만 tools/시험도구 기준으로 바꿈 — 쓰는 법은 docs/게임_의도_2026-11-15/준비_시험환경.md
# PC load watch (CPU / free memory)
$last = [datetime]::MinValue; $tick = 0
while ($true) {
  $s = @(); for ($i=0; $i -lt 6; $i++) { $s += (Get-CimInstance Win32_Processor | Measure-Object LoadPercentage -Average).Average; Start-Sleep 5 }
  $cpu = [math]::Round(($s | Measure-Object -Average).Average)
  $free = [math]::Round((Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory/1MB,1)
  $tick++
  if (($cpu -ge 90 -or $free -lt 3) -and ((Get-Date) - $last).TotalMinutes -ge 5) {
    $top = Get-Process | Sort-Object CPU -Descending | Select-Object -First 3 | ForEach-Object { "$($_.ProcessName)" }
    Write-Output ("[PC 부담 높음] CPU {0}% 남은 메모리 {1}GB 많이 쓰는 것: {2}" -f $cpu, $free, ($top -join ','))
    $last = Get-Date
  } elseif ($tick % 20 -eq 0) {
    Write-Output ("[PC 요약] CPU {0}% 남은 메모리 {1}GB" -f $cpu, $free)
  }
}

