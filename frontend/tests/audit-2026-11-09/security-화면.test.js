// 보안 시험: 화면(데스크톱·모바일) 소스 훑기 — HTML 직접 넣기·eval 없음 · 토큰을 브라우저 저장소에 안 둠 · 새 창 링크 rel · 비밀 키 없음 · 소스맵 안 냄
// 코드를 돌리지 않고 src 글자만 읽음 (두 앱 같은 규칙)
import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const HERE = path.dirname(fileURLToPath(import.meta.url))
const FRONTEND = path.join(HERE, "../..")
const MOBILE = path.join(FRONTEND, "../frontend-mobile")
const APPS = [["desktop", FRONTEND], ["mobile", MOBILE]]

// 앱 src 아래 js·jsx 파일 [상대 경로, 글자] 목록
const sourcesOf = (root) => {
  const out = []
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name)
      if (statSync(full).isDirectory()) walk(full)
      else if (/\.(jsx?|mjs)$/.test(name)) out.push([path.relative(root, full), readFileSync(full, "utf8")])
    }
  }
  walk(path.join(root, "src"))
  return out
}
const SOURCES = Object.fromEntries(APPS.map(([name, root]) => [name, sourcesOf(root)]))
// 주석 줄은 빼고 봄 (설명 글에 단어만 나온 것 거르기)
const codeOnly = (text) => text.split("\n").filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line)).join("\n")
const offenders = (app, pattern) => SOURCES[app].filter(([, text]) => pattern.test(codeOnly(text))).map(([file]) => file)

for (const [app] of APPS) {
  test(`${app}: dangerouslySetInnerHTML 없음 (닉네임·채팅·공지·신고 메모는 글자로만 그림)`, () => {
    assert.deepEqual(offenders(app, /dangerouslySetInnerHTML/), [])
  })

  test(`${app}: innerHTML·outerHTML 대입·insertAdjacentHTML·document.write 없음`, () => {
    assert.deepEqual(offenders(app, /\.(innerHTML|outerHTML)\s*=|insertAdjacentHTML|document\.write\(/), [])
  })

  test(`${app}: eval·new Function·글자로 넘긴 setTimeout 없음`, () => {
    assert.deepEqual(offenders(app, /\beval\(|new Function\(|setTimeout\(\s*["'`]|setInterval\(\s*["'`]/), [])
  })

  test(`${app}: 로그인 토큰을 localStorage·sessionStorage에 안 넣음 (토큰은 httpOnly 쿠키)`, () => {
    assert.deepEqual(offenders(app, /(local|session)Storage\.setItem\([^)]*(token|jwt|refresh)/i), [])
  })

  test(`${app}: 새 창 링크(target=_blank)는 전부 rel="noopener noreferrer"`, () => {
    const bad = []
    for (const [file, text] of SOURCES[app]) {
      for (const match of text.matchAll(/<a\b[^>]*target="_blank"[^>]*>/gs)) {
        if (!/rel="noopener noreferrer"/.test(match[0])) bad.push(file)
      }
    }
    assert.deepEqual(bad, [])
  })

  test(`${app}: 결제 비밀 키(sk_)·DB 주소·서버 서명 키 이름이 화면 소스에 없음`, () => {
    assert.deepEqual(offenders(app, /\b(test|live)_g?sk_[A-Za-z0-9]{6,}|mysql:\/\/|JWT_SECRET|INTERNAL_API_KEY|SMTP_PASS/), [])
  })

  test(`${app}: 빌드에 소스맵 안 냄 (소스 코드 노출 막기)`, () => {
    const root = APPS.find(([name]) => name === app)[1]
    const configFile = ["vite.config.js", "vite.config.mjs", "vite.config.ts"].map((name) => path.join(root, name)).find(existsSync)
    const config = readFileSync(configFile, "utf8")
    assert.doesNotMatch(config, /sourcemap:\s*(true|["']inline["']|["']hidden["'])/)
  })
}

test("desktop: 로그인 상태 저장은 로그인 여부·user만 (토큰 칸 없음)", () => {
  const store = readFileSync(path.join(FRONTEND, "src/domains/auth/store/auth.store.js"), "utf8")
  const persisted = store.match(/const persistAuthState = \(state\) => \(\{([\s\S]*?)\}\)/)[1]
  assert.deepEqual(persisted.match(/\w+(?=:)/g), ["isLoggedIn", "user"])
})

test("desktop: API 요청은 쿠키 인증(credentials include)이고 Authorization 머리말을 안 만듦", () => {
  const client = readFileSync(path.join(FRONTEND, "src/shared/api/client.js"), "utf8")
  assert.match(client, /credentials: "include"/)
  assert.doesNotMatch(client, /Authorization/)
})

test("desktop: 고객센터 링크는 디스코드 주소만 통과 (javascript: 등 거절)", async () => {
  const { resolveDiscordSupportUrl: check } = await import("../../src/shared/discordSupport.js")
  assert.ok(check("https://discord.gg/abc123"))
  for (const bad of ["javascript:alert(1)", "https://evil.example/invite/abc", "data:text/html,x", "http://discord.gg/abc"]) {
    assert.ok(!check(bad), bad)
  }
})
