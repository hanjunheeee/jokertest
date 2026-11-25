# CPU·남은 메모리를 30초마다 기록 (tools/시험도구/.run/묶음돌리기/mon.csv), run-mobile.sh 가 일꾼 수 고를 때 읽음
$dir = Join-Path (Split-Path $PSScriptRoot -Parent) ('.run\' + (Split-Path $PSScriptRoot -Leaf))
New-Item -ItemType Directory -Force $dir | Out-Null
$log = Join-Path $dir 'mon.csv'
"time,cpu,freeGB" | Out-File -FilePath $log -Encoding ascii
while ($true) {
  $cpu = (Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average
  $os = Get-CimInstance Win32_OperatingSystem
  $free = [math]::Round($os.FreePhysicalMemory / 1MB, 2)
  "$(Get-Date -Format HH:mm:ss),$cpu,$free" | Out-File -FilePath $log -Append -Encoding ascii
  Start-Sleep -Seconds 30
}
