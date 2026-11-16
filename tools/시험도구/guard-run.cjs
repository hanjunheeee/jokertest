// 명령 하나를 시간·메모리 한도 안에서 돌리고 넘으면 프로세스 나무째 끄는 실행기
// 시험 쓰는 에이전트가 오래 걸릴 수 있는 실행을 감쌀 때 씀 (이 PC에선 timeout이 node를 못 끔)
// 쓰기: node guard-run.cjs [--ms=120000] [--mb=2000] [--cwd=<폴더>] -- <명령> <인자…>
const { spawn, execFile, execFileSync } = require("child_process")

const argv = process.argv.slice(2)
const sep = argv.indexOf("--")
const opts = sep < 0 ? argv : argv.slice(0, sep)
const cmd = sep < 0 ? [] : argv.slice(sep + 1)
if (cmd.length === 0) {
  console.error("쓰기: node guard-run.cjs [--ms=120000] [--mb=2000] [--cwd=<폴더>] -- <명령> <인자…>")
  process.exit(2)
}
const opt = (name, def) => {
  const hit = opts.find((o) => o.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : def
}
const LIMIT_MS = Number(opt("ms", 120000))
const LIMIT_MB = Number(opt("mb", 2000))
const IS_WIN = process.platform === "win32"

// 윈도우는 셸 없이, 그 밖엔 프로세스 묶음으로 띄워 한 번에 끌 수 있게 함
const child = spawn(cmd[0], cmd.slice(1), { cwd: opt("cwd", process.cwd()), stdio: "inherit", detached: !IS_WIN })
child.on("error", (e) => {
  console.error(`[guard] 못 띄움: ${e.message}`)
  finish(127)
})

let killed = false
let done = false

const kill = (why) => {
  if (killed || done) return
  killed = true
  console.error(`[guard] 끊음: ${why}`)
  try {
    if (IS_WIN) execFileSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" })
    else process.kill(-child.pid, "SIGKILL")
  } catch { /* 이미 끝남 */ }
}

// 프로세스 표 [{pid, ppid, bytes}]를 한 번에 받음 (윈도우는 PowerShell 한 번 호출)
const snapshot = (cb) => {
  if (IS_WIN) {
    const ps = "Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,WorkingSetSize | ConvertTo-Json -Compress"
    execFile("powershell", ["-NoProfile", "-NonInteractive", "-Command", ps], { maxBuffer: 64 * 1024 * 1024 }, (err, out) => {
      if (err) return cb(null)
      try {
        const rows = [].concat(JSON.parse(out))
        cb(rows.map((r) => ({ pid: r.ProcessId, ppid: r.ParentProcessId, bytes: Number(r.WorkingSetSize) || 0 })))
      } catch { cb(null) }
    })
  } else {
    execFile("ps", ["-A", "-o", "pid=,ppid=,rss="], { maxBuffer: 64 * 1024 * 1024 }, (err, out) => {
      if (err) return cb(null)
      cb(out.trim().split("\n").map((l) => {
        const [pid, ppid, kb] = l.trim().split(/\s+/).map(Number)
        return { pid, ppid, bytes: kb * 1024 }
      }))
    })
  }
}

// 자식 나무(손자 포함) 메모리 합 → MB
const treeMb = (rows) => {
  const byParent = new Map()
  for (const r of rows) {
    if (!byParent.has(r.ppid)) byParent.set(r.ppid, [])
    byParent.get(r.ppid).push(r)
  }
  const byPid = new Map(rows.map((r) => [r.pid, r]))
  let sum = 0
  const seen = new Set()
  const stack = [child.pid]
  while (stack.length) {
    const pid = stack.pop()
    if (seen.has(pid)) continue
    seen.add(pid)
    if (byPid.has(pid)) sum += byPid.get(pid).bytes
    for (const k of byParent.get(pid) || []) stack.push(k.pid)
  }
  return sum / 1024 / 1024
}

const timer = setTimeout(() => kill(`시간 넘음 ${LIMIT_MS}ms`), LIMIT_MS)
let busy = false
const poll = setInterval(() => {
  if (busy || killed || done) return // 표 받는 중이면 건너뜀
  busy = true
  snapshot((rows) => {
    busy = false
    if (!rows || done) return
    const mb = treeMb(rows)
    if (mb > LIMIT_MB) kill(`메모리 넘음 ${Math.round(mb)}MB`)
  })
}, 1000)

function finish(code) {
  if (done) return
  done = true
  clearTimeout(timer)
  clearInterval(poll)
  process.exit(code)
}
child.on("exit", (code) => finish(killed ? 124 : code == null ? 1 : code))
