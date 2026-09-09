// Phase B — 10인 실제 게임: 방 생성·입장·시작 → 역할 공개 → 밤/낮/재판 반복 → 결과 → 로비 복귀
// 봇 규칙: 오버레이 확인 → 낮 토론 준비 → 투표 기권 → 재판 무죄 → 밤 행동은 첫 대상 확정.
// 방장(p01)은 집계·판정·밤 종료 버튼도 누른다. p01 화면을 단계별로 캡처한다.
import { accounts, ensureAccounts, launch, loginContext, shot, sleep, WEB } from "./lib.mjs"
import { writeFileSync } from "node:fs"

const N = Number(process.env.QA_PLAYERS ?? 10)
const list = accounts(N)
await ensureAccounts(list)
const browser = await launch()
const log = []
const note = (m) => { const line = `[${new Date().toISOString().slice(11, 19)}] ${m}`; console.log(line); log.push(line) }
const results = []
const seen = new Set()
async function shotOnce(page, name) { if (seen.has(name)) return; seen.add(name); await shot(page, name); note(`shot ${name}`) }

async function clickIfEnabled(page, name, exact = true) {
  const b = page.getByRole("button", { name, exact }).first()
  if (await b.count() === 0) return false
  if (!(await b.isVisible().catch(() => false))) return false
  if (!(await b.isEnabled().catch(() => false))) return false
  await b.click({ timeout: 2000 }).catch(() => {})
  return true
}

try {
  const S = []
  for (const a of list) {
    const s = await loginContext(browser, a)
    s.page.on("pageerror", (e) => note(`PAGEERROR ${a.nickname}: ${e.message}`))
    s.page.on("console", (m) => { if (m.type() === "error") note(`CONSOLE ${a.nickname}: ${m.text().slice(0, 160)}`) })
    S.push({ a, ...s })
  }
  note(`logged in ${S.length}`)
  const host = S[0].page

  // 1) 방 생성
  await host.goto(`${WEB}/multiplay`); await sleep(800)
  await host.getByRole("button", { name: "방 만들기" }).click()
  await host.waitForURL(/game-setup/); await sleep(800)
  await shotOnce(host, "10-game-setup")
  await host.getByRole("button", { name: /게임 만들기/ }).click()
  await host.waitForURL(/game-matching/, { timeout: 15000 }); await sleep(1000)
  await shotOnce(host, "11-matching-host")
  results.push({ step: "create-room", ok: true })

  // 2) 나머지 입장 (공개 방 목록 첫 행 선택 → 입장하기)
  for (const s of S.slice(1)) {
    const p = s.page
    await p.goto(`${WEB}/multiplay`); await sleep(1200)
    const row = p.locator("button").filter({ hasText: S[0].a.nickname }).first()
    if (await row.count() === 0) { note(`no room row for ${s.a.nickname}`); results.push({ step: `join-${s.a.nickname}`, ok: false, why: "room row not found" }); continue }
    await row.click()
    // BUG-UI16-01: 우하단 사운드 컨트롤 위젯이 입장하기 버튼을 덮어 일반 클릭이 막힌다(실사용자도 동일) — 기록 후 force로 진행
    if (!seen.has("bug-enter-covered")) { seen.add("bug-enter-covered"); await shot(p, "12-BUG-enter-button-covered"); results.push({ step: "BUG-UI16-01", ok: false, why: "/multiplay 입장하기 버튼이 사운드 컨트롤 위젯(bottom-right)에 가려져 클릭 불가" }) }
    await p.getByRole("button", { name: /입장/ }).first().evaluate((el) => el.click())
    try { await p.waitForURL(/game-matching/, { timeout: 15000 }); results.push({ step: `join-${s.a.nickname}`, ok: true }) }
    catch (e) { note(`join fail ${s.a.nickname}: ${e.message}`); results.push({ step: `join-${s.a.nickname}`, ok: false, why: e.message }) }
    await sleep(300)
  }
  await sleep(1500)
  await shotOnce(host, "12-matching-10players")
  await shotOnce(S[1].page, "12-matching-p02")

  // 3) 준비완료 → 게임시작
  for (const s of S) { await clickIfEnabled(s.page, "준비완료"); await sleep(150) }
  await sleep(1500)
  await shotOnce(host, "13-matching-all-ready")
  let started = false
  for (let k = 0; k < 10 && !started; k++) { started = await clickIfEnabled(host, "게임시작"); if (!started) await sleep(700) }
  results.push({ step: "start-game", ok: started })
  for (const s of S) { try { await s.page.waitForURL(/\/ingame/, { timeout: 20000 }) } catch { note(`no ingame for ${s.a.nickname}`) } }
  await sleep(1500)
  await shotOnce(host, "20-role-reveal-p01")
  await shotOnce(S[1].page, "20-role-reveal-p02")

  // 4) 게임 루프
  const phaseOf = async (p) => ({
    phase: await p.locator("[data-ingame-phase]").first().getAttribute("data-ingame-phase").catch(() => null),
    day: await p.locator("[data-ingame-day-index]").first().getAttribute("data-ingame-day-index").catch(() => null),
  })
  let reloaded = false
  let lastPhaseKey = ""
  const deadline = Date.now() + 14 * 60 * 1000
  while (Date.now() < deadline) {
    const { phase, day } = await phaseOf(host)
    const key = `${phase}-${day}`
    if (phase && key !== lastPhaseKey) { note(`host phase ${key}`); lastPhaseKey = key }
    if (host.url().includes("/gameresult") || phase === "ENDED") break
    for (const [i, s] of S.entries()) {
      const p = s.page
      if (p.url().includes("/gameresult")) continue
      await clickIfEnabled(p, "확인")
      const { phase: ph } = await phaseOf(p)
      if (ph === "DAY") {
        if (await clickIfEnabled(p, "투표 시작 준비")) note(`${s.a.nickname} ready`)
        if (await clickIfEnabled(p, "기권")) note(`${s.a.nickname} abstain`)
        if (i === 0) { if (await clickIfEnabled(p, "낮 집계")) { note("host day resolve"); await sleep(800); await shotOnce(host, "30-day-vote-p01") } }
      } else if (ph === "TRIBUNAL") {
        await clickIfEnabled(p, "무죄")
        if (await clickIfEnabled(p, "투표 제출")) note(`${s.a.nickname} tribunal vote`)
        if (i === 0) { await shotOnce(host, "31-tribunal-p01"); if (await clickIfEnabled(p, "재판 판정")) note("host tribunal resolve") }
      } else if (ph === "NIGHT") {
        if (i === 0) await shotOnce(host, `40-night-d${day}-p01`)
        const target = p.locator("[data-ingame-target-id]").first()
        if (await target.count() > 0 && await target.isEnabled().catch(() => false)) {
          await target.click().catch(() => {})
          if (await clickIfEnabled(p, "행동 확정")) note(`${s.a.nickname} night action`)
        }
        if (i === 0) { if (await clickIfEnabled(p, "밤 종료")) note("host night resolve") }
      }
    }
    // QA3: 2일차 낮에 p03을 새로고침해 세션 복구 확인
    if (!reloaded && phase === "DAY" && Number(day) >= 2) {
      reloaded = true
      const p3 = S[2].page
      await p3.reload(); await sleep(2500)
      const st = await phaseOf(p3)
      note(`QA3 reload p03 -> url=${p3.url()} phase=${st.phase} day=${st.day}`)
      await shotOnce(p3, "50-reload-p03")
      results.push({ step: "QA3-reload", ok: p3.url().includes("/ingame") && !!st.phase, detail: st })
      await shotOnce(host, "51-day2-p01")
    }
    await sleep(1200)
  }
  // 5) 결과 화면
  await sleep(2500)
  for (const s of S) { if (s.page.url().includes("/gameresult")) { await shotOnce(s.page, `60-result-${s.a.nickname}`); break } }
  await shotOnce(host, "60-result-p01")
  results.push({ step: "result-page", ok: host.url().includes("/gameresult"), url: host.url() })
  // 6) 로비 복귀
  const back = host.getByRole("button", { name: /로비/ }).first()
  if (await back.count()) { await back.click().catch(() => {}); await sleep(2000); await shotOnce(host, "61-back-to-lobby") }
  results.push({ step: "back-to-lobby", ok: /\/(lobby|multiplay)/.test(host.url()), url: host.url() })
  for (const s of S) await s.ctx.close()
} catch (e) {
  note(`FATAL ${e.stack ?? e.message}`)
  results.push({ step: "fatal", ok: false, why: e.message })
} finally {
  await browser.close()
}
writeFileSync("C:/Users/minsa/jokertest/docs/qa/ui-16-browser-regression/phaseB-log.txt", log.join("\n") + "\n\n" + JSON.stringify(results, null, 1))
console.log(JSON.stringify(results, null, 1))
