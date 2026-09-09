// Phase C — 5인: 방 생성·입장·시작 → 역할 공개 → 1일차 낮에 시민들이 광대를 지목·유죄 → 처형 → 결과(MVP) 화면
import { accounts, ensureAccounts, launch, loginContext, shot, sleep, WEB } from "./lib.mjs"
import { writeFileSync } from "node:fs"

const N = 5
const list = accounts(N)
await ensureAccounts(list)
const browser = await launch()
const log = []
const note = (m) => { const line = `[${new Date().toISOString().slice(11, 19)}] ${m}`; console.log(line); log.push(line) }
const results = []
const seen = new Set()
async function shotOnce(page, name) { if (seen.has(name)) return; seen.add(name); try { await shot(page, name); note(`shot ${name}`) } catch (e) { note(`shot fail ${name}: ${e.message}`) } }
async function clickIfEnabled(page, name, exact = true) {
  try {
    const b = page.getByRole("button", { name, exact }).first()
    if (await b.count() === 0) return false
    if (!(await b.isVisible().catch(() => false))) return false
    if (!(await b.isEnabled().catch(() => false))) return false
    await b.click({ timeout: 2000 }).catch(() => {})
    return true
  } catch { return false }
}
const attr = (p, a) => p.locator(`[${a}]`).first().getAttribute(a).catch(() => null)

try {
  const S = []
  for (const a of list) {
    const s = await loginContext(browser, a)
    s.page.on("pageerror", (e) => note(`PAGEERROR ${a.nickname}: ${e.message.slice(0, 200)}`))
    S.push({ a, ...s })
  }
  note(`logged in ${S.length}`)
  const host = S[0].page

  await host.goto(`${WEB}/multiplay`); await sleep(800)
  await host.getByRole("button", { name: "방 만들기" }).click()
  await host.waitForURL(/game-setup/); await sleep(800)
  await host.getByRole("button", { name: /게임 만들기/ }).click()
  await host.waitForURL(/game-matching/, { timeout: 15000 }); await sleep(800)
  for (const s of S.slice(1)) {
    const p = s.page
    await p.goto(`${WEB}/multiplay`); await sleep(1000)
    await p.locator("button").filter({ hasText: S[0].a.nickname }).first().click()
    await p.getByRole("button", { name: /입장/ }).first().evaluate((el) => el.click())
    try { await p.waitForURL(/game-matching/, { timeout: 15000 }) } catch (e) { note(`join fail ${s.a.nickname}`); await shotOnce(p, `12-join-fail-${s.a.nickname}`) }
  }
  for (let k = 0; k < 15; k++) { const t = await host.locator("text=/파티 인원/").first().innerText().catch(() => ""); if (/5/.test(t)) break; await sleep(700) }
  note(`party text: ${await host.locator("text=/파티 인원/").first().innerText().catch(() => "?")}`)
  await sleep(500)
  for (const s of S) { await clickIfEnabled(s.page, "준비완료"); await sleep(120) }
  await sleep(1000)
  await shotOnce(host, "13-matching-5-ready")
  let started = false
  for (let k = 0; k < 10 && !started; k++) { started = await clickIfEnabled(host, "게임시작"); if (!started) await sleep(700) }
  results.push({ step: "start-game", ok: started })
  for (const s of S) { try { await s.page.waitForURL(/\/ingame/, { timeout: 20000 }) } catch { note(`no ingame ${s.a.nickname}`); await shotOnce(s.page, `14-no-ingame-${s.a.nickname}`) } }
  await sleep(1200)
  await shotOnce(host, "20-role-reveal-p01")

  // 역할 파악 (각 창은 자기 역할만 안다)
  await sleep(1500)
  const roles = {}
  for (const s of S) { await clickIfEnabled(s.page, "확인"); roles[s.a.nickname] = await attr(s.page, "data-ingame-self-role") }
  note(`roles ${JSON.stringify(roles)}`)
  const jokers = Object.entries(roles).filter(([, r]) => r === "JOKER").map(([n]) => n)
  const joker = jokers[0]
  results.push({ step: "roles-known", ok: jokers.length > 0, roles })
  const jokerIdx = S.findIndex((s) => s.a.nickname === joker)
  await shotOnce(S[jokerIdx >= 0 ? jokerIdx : 1].page, "21-role-reveal-joker")

  let last = ""
  const deadline = Date.now() + 6 * 60 * 1000
  while (Date.now() < deadline) {
    const phase = await attr(host, "data-ingame-phase"); const day = await attr(host, "data-ingame-day-index")
    const key = `${phase}-${day}`; if (phase && key !== last) { note(`host phase ${key}`); last = key }
    if (host.url().includes("/gameresult") || phase === "ENDED") break
    for (const [i, s] of S.entries()) {
      const p = s.page
      if (p.url().includes("/gameresult")) continue
      await clickIfEnabled(p, "확인")
      const ph = await attr(p, "data-ingame-phase")
      const isJoker = jokers.includes(s.a.nickname)
      if (ph === "DAY") {
        if (await clickIfEnabled(p, "투표 시작 준비")) note(`${s.a.nickname} ready`)
        // 시민은 광대를 지목해 투표, 광대는 기권
        if (!isJoker && jokers.length) {
          for (const j of jokers) {
            const t = p.locator("[data-ingame-target-id]").filter({ hasText: j }).first()
            if (await t.count() && await t.isEnabled().catch(() => false)) {
              await t.click().catch(() => {})
              if (await clickIfEnabled(p, "투표")) { note(`${s.a.nickname} votes ${j}`); if (i === 2) await shotOnce(p, "30-day-vote-target-selected") }
              break
            }
          }
        } else if (await clickIfEnabled(p, "기권")) note(`${s.a.nickname} abstain`)
        if (await clickIfEnabled(p, "낮 집계")) { note(`${s.a.nickname} day resolve`); await sleep(1200); await shotOnce(host, "31-after-day-resolve-p01") }
      } else if (ph === "TRIBUNAL") {
        await clickIfEnabled(p, isJoker ? "무죄" : "유죄"); if (await clickIfEnabled(p, "투표 제출")) note(`${s.a.nickname} ${isJoker ? "not-guilty" : "guilty"}`)
        if (i === 0) await shotOnce(host, "32-tribunal-p01")
        if (await clickIfEnabled(p, "재판 판정")) { note(`${s.a.nickname} tribunal resolve`); await sleep(1500); await shotOnce(host, "33-after-tribunal-p01") }
      } else if (ph === "NIGHT") {
        if (i === 0) await shotOnce(host, `40-night-d${day}-p01`)
        const t = p.locator("[data-ingame-target-id]").first()
        if (await t.count() && await t.isEnabled().catch(() => false)) { await t.click().catch(() => {}); if (await clickIfEnabled(p, "행동 확정")) note(`${s.a.nickname} night action`) }
        if (await clickIfEnabled(p, "밤 종료")) note(`${s.a.nickname} night resolve`)
      }
    }
    await sleep(1000)
  }
  await sleep(3000)
  await shotOnce(host, "60-result-intro-p01")
  // 인트로(승리/패배 영상)를 건너뛰고 MVP·로스터 화면을 기다린다
  for (const s of S) {
    const p = s.page
    if (!p.url().includes("/gameresult")) continue
    for (let k = 0; k < 30; k++) {
      await clickIfEnabled(p, /건너뛰기|skip|넘기기/i, false)
      const video = await p.locator("video").count()
      const roster = await p.locator("text=/MVP|승리 팀|패배 팀|로스터/").count()
      if (video === 0 || roster > 0) break
      await sleep(1000)
    }
  }
  await sleep(1500)
  await shotOnce(host, "60-result-mvp-p01")
  const loser = S.find((s) => jokers.includes(s.a.nickname))
  if (loser) await shotOnce(loser.page, `60-result-mvp-${loser.a.nickname}`)
  results.push({ step: "result-page", ok: host.url().includes("/gameresult"), url: host.url() })
  const back = host.getByRole("button", { name: /로비|나가기|돌아가기/ }).first()
  if (await back.count()) { await back.click().catch(() => {}); await sleep(2500); await shotOnce(host, "61-back-to-lobby") }
  results.push({ step: "back-to-lobby", ok: /\/(lobby|multiplay)/.test(host.url()), url: host.url() })
  for (const s of S) await s.ctx.close().catch(() => {})
} catch (e) {
  note(`FATAL ${e.stack ?? e.message}`)
  results.push({ step: "fatal", ok: false, why: e.message })
} finally {
  await browser.close().catch(() => {})
}
writeFileSync("C:/Users/minsa/jokertest/docs/qa/ui-16-browser-regression/phaseC-log.txt", log.join("\n") + "\n\n" + JSON.stringify(results, null, 1))
console.log(JSON.stringify(results, null, 1))
