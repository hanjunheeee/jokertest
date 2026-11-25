# 시작 전 CPU 85% 아래·남은 메모리 4GB 위가 될 때까지 기다림 (최대 10분), 마지막 줄이 ok / timeout
$deadline = (Get-Date).AddMinutes(10)
while ((Get-Date) -lt $deadline) {
  $cpu = (Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average
  $free = [math]::Round((Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory / 1MB, 2)
  if ($cpu -lt 85 -and $free -ge 4) { "ok cpu=$cpu freeGB=$free"; exit 0 }
  "wait cpu=$cpu freeGB=$free"
  Start-Sleep -Seconds 10
}
"timeout"
