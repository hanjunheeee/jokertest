// AD-045 플레이어·관리자 묶음 분리 시험: 빌드 결과 검사 함수 + eslint 막기 규칙
import assert from "node:assert/strict"
import test from "node:test"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { ESLint } from "eslint"
import { checkPlayerBuild, checkAdminBuild } from "../../scripts/verify-admin-split.mjs"

const FRONTEND = fileURLToPath(new URL("../../", import.meta.url))

// 가짜 빌드 폴더 만들기: { "경로": "내용" }
const fakeBuild = (files) => {
  const dir = mkdtempSync(path.join(tmpdir(), "mmc-split-"))
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, name)), { recursive: true })
    writeFileSync(path.join(dir, name), text)
  }
  return dir
}

test("AD-045 플레이어 빌드: 깨끗하면 문제 없음", (t) => {
  const dir = fakeBuild({ "index.html": "<div id=root>", "assets/index-a1.js": "fetch('/auth/me')" })
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  assert.deepEqual(checkPlayerBuild(dir), [])
})

test("AD-045 플레이어 빌드에 admin.html·/admin-api 글자·관리자 뿌리 있으면 걸림", (t) => {
  const dir = fakeBuild({
    "index.html": "<div id=root>",
    "admin.html": "<div id=admin-root>",
    "assets/index-a1.js": "fetch('/admin-api/auth/me')",
    "assets/chunk-b2.js": "getElementById('admin-root')",
  })
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const problems = checkPlayerBuild(dir).join("\n")
  assert.match(problems, /admin\.html 있음/)
  assert.match(problems, /assets\/index-a1\.js 안에 "\/admin-api"/)
  assert.match(problems, /assets\/chunk-b2\.js 안에 "admin-root"/)
})

test("AD-045 관리자 빌드에 플레이어 화면(index.html·게임 표시)이 있으면 걸림", (t) => {
  const clean = fakeBuild({ "admin.html": "<div id=admin-root>", "assets/admin-a1.js": "'/admin-api'" })
  const dirty = fakeBuild({
    "admin.html": "<div id=admin-root>",
    "index.html": "<div id=root>",
    "assets/admin-a1.js": "io('/socket.io')",
    "assets/admin-a1.css": "font-family: Shilla",
  })
  t.after(() => { rmSync(clean, { recursive: true, force: true }); rmSync(dirty, { recursive: true, force: true }) })
  assert.deepEqual(checkAdminBuild(clean), [])
  assert.equal(checkAdminBuild(dirty).length, 3)
})

test("AD-045 관리자 빌드 폴더가 없으면 걸림", () => {
  assert.equal(checkAdminBuild(path.join(tmpdir(), "mmc-split-없음")).length, 1)
})

const lint = async (filePath, code) => {
  const eslint = new ESLint({ cwd: FRONTEND })
  const [result] = await eslint.lintText(code, { filePath: path.join(FRONTEND, filePath) })
  return result.messages.filter((m) => m.ruleId === "no-restricted-imports")
}

test("AD-045 eslint: 플레이어 코드가 관리자 코드를 부르면 막힘", async () => {
  assert.equal((await lint("src/domains/lobby/x.js", "import { adminApi } from '@/admin/shared/api/adminClient'\nexport default adminApi\n")).length, 1)
  assert.equal((await lint("src/main.jsx", "import AdminApp from './admin/app/AdminApp'\nexport default AdminApp\n")).length, 1)
  assert.equal((await lint("src/shared/api/x.js", "import { adminApi } from '../../admin/shared/api/adminClient'\nexport default adminApi\n")).length, 1)
  assert.equal((await lint("src/domains/lobby/x.js", "import { api } from '@/shared/api/client'\nexport default api\n")).length, 0)
})

test("AD-045 eslint: 관리자 코드가 플레이어 코드를 부르면 막힘", async () => {
  assert.equal((await lint("src/admin/app/x.js", "import { api } from '@/shared/api/client'\nexport default api\n")).length, 1)
  assert.equal((await lint("src/admin/app/x.js", "import { useAuth } from '@/domains/auth/store/auth.store'\nexport default useAuth\n")).length, 1)
  assert.equal((await lint("src/admin/app/x.js", "import { adminApi } from '@/admin/shared/api/adminClient'\nexport default adminApi\n")).length, 0)
})

test("AD-045 eslint: 관리자 api 폴더는 fetch 됨, 관리자 화면 파일은 fetch 막힘", async () => {
  const eslint = new ESLint({ cwd: FRONTEND })
  const code = "export const go = () => fetch('/admin-api/x')\n"
  const [inApi] = await eslint.lintText(code, { filePath: path.join(FRONTEND, "src/admin/shared/api/x.js") })
  const [inPage] = await eslint.lintText(code, { filePath: path.join(FRONTEND, "src/admin/domains/members/pages/x.js") })
  assert.equal(inApi.messages.filter((m) => m.ruleId === "no-restricted-syntax").length, 0)
  assert.equal(inPage.messages.filter((m) => m.ruleId === "no-restricted-syntax").length, 1)
})
