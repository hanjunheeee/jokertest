// Phase A — 계정 10개 생성·로그인, 로비 스크린샷, p01로 비게임 화면 순회
import { accounts, ensureAccounts, launch, loginContext, shot, sleep, WEB } from "./lib.mjs"

const list = accounts(10)
await ensureAccounts(list)
console.log("accounts ready")

const browser = await launch()
const results = []
try {
  // 10명 로그인
  const sessions = []
  for (const a of list) {
    try {
      const s = await loginContext(browser, a)
      sessions.push({ a, ...s })
      console.log("login ok", a.nickname, s.page.url())
    } catch (e) {
      console.log("login FAIL", a.nickname, e.message)
      results.push({ step: `login-${a.nickname}`, ok: false, why: e.message })
    }
  }
  results.push({ step: "login-10", ok: sessions.length === 10, why: `${sessions.length}/10` })
  if (sessions.length) await shot(sessions[0].page, "01-lobby-p01")
  if (sessions.length > 1) await shot(sessions[1].page, "01-lobby-p02")

  // p01 비게임 화면 순회
  const p = sessions[0]?.page
  if (p) {
    for (const [name, path] of [["02-store", "/store"], ["03-library", "/library"], ["04-podium", "/podium"], ["05-mypage", "/mypage"], ["06-setting", "/setting"], ["07-gamemode", "/gameMode"], ["08-multiplay", "/multiplay"]]) {
      try {
        await p.goto(`${WEB}${path}`)
        await sleep(1500)
        const errs = []
        p.on("pageerror", (e) => errs.push(e.message))
        await shot(p, name)
        results.push({ step: name, ok: true, url: p.url() })
      } catch (e) {
        results.push({ step: name, ok: false, why: e.message })
      }
    }
    await p.goto(`${WEB}/lobby`)
  }
  for (const s of sessions) await s.ctx.close()
} finally {
  await browser.close()
}
console.log(JSON.stringify(results, null, 1))
