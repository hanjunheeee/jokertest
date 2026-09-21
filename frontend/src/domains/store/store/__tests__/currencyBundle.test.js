import assert from "node:assert/strict"
import test from "node:test"
import { spawnSync } from "node:child_process"
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

// F-32c AC-06: production build를 이 시험 안에서 실제로 실행하고, 그 실행이 새로 만든 산출물만 검사한다
// (기존 dist를 검사해 통과할 수 없다). 서버 전용 secret이 번들에 새지 않는지를 합성 표식으로 확인한다 —
// 실제 secret은 읽지도 복사하지도 않는다. 검출 시에는 값 대신 파일명만 보고한다.
const frontendDir = fileURLToPath(new URL("../../../../../", import.meta.url))
const SYNTHETIC_SECRET = "test_sk_f32c_synthetic_marker_0123456789"
const SECRET_KEY_SHAPE = /(?:test|live)_sk_[A-Za-z0-9_=+/-]{8,}/

const walk = (dir) => readdirSync(dir).flatMap((name) => {
  const full = join(dir, name)
  return statSync(full).isDirectory() ? walk(full) : [full]
})

// 산출물 전체에서 표식 원문·Base64(표식 단독, 토스 Basic 인증 형식 "표식:")와 secret 키 형식을 찾아 파일명만 돌려준다.
function findSecretLeaks(dir) {
  const needles = [
    SYNTHETIC_SECRET,
    Buffer.from(SYNTHETIC_SECRET, "utf8").toString("base64"),
    Buffer.from(`${SYNTHETIC_SECRET}:`, "utf8").toString("base64"),
  ]
  return walk(dir)
    .filter((file) => {
      const content = readFileSync(file).toString("latin1")
      return needles.some((needle) => content.includes(needle)) || SECRET_KEY_SHAPE.test(content)
    })
    .map((file) => file.slice(dir.length + 1))
}

test("AC-06: 검사기가 표식 원문·Base64·secret 키 형식을 실제로 검출한다(파일명만 보고)", () => {
  const dir = mkdtempSync(join(tmpdir(), "f32c-scan-"))
  try {
    writeFileSync(join(dir, "clean.js"), "console.log('ok')")
    writeFileSync(join(dir, "raw.js"), `const k = "${SYNTHETIC_SECRET}"`)
    writeFileSync(join(dir, "b64.js"), `const k = "${Buffer.from(SYNTHETIC_SECRET).toString("base64")}"`)
    writeFileSync(join(dir, "shape.js"), 'const k = "live_sk_abcdefgh12345678"')
    assert.deepEqual(findSecretLeaks(dir).sort(), ["b64.js", "raw.js", "shape.js"])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("AC-06: production build가 통과하고 이번 실행의 산출물에 secret 표식·키 형식이 없다", { timeout: 280_000 }, () => {
  const outDir = mkdtempSync(join(tmpdir(), "f32c-bundle-"))
  try {
    const vite = join(frontendDir, "node_modules", "vite", "bin", "vite.js")
    assert.ok(existsSync(vite), "vite가 설치되어 있어야 한다")
    const run = spawnSync(process.execPath, [vite, "build", "--outDir", outDir, "--emptyOutDir"], {
      cwd: frontendDir,
      env: { ...process.env, TOSS_TEST_SECRET_KEY: SYNTHETIC_SECRET },
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    })
    assert.equal(run.status, 0, `vite build 종료 코드: ${run.status}\n${String(run.stderr).slice(-2000)}`)

    const files = walk(outDir)
    assert.ok(files.some((file) => file.endsWith("index.html")), "새 산출물에 index.html이 있어야 한다")
    assert.ok(files.some((file) => file.endsWith(".js")), "새 산출물에 번들 스크립트가 있어야 한다")
    assert.deepEqual(findSecretLeaks(outDir), [], "secret이 검출된 산출물 파일")
  } finally {
    rmSync(outDir, { recursive: true, force: true })
  }
})
