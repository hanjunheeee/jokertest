// F-23 BR · AC-01 화면 확인 — 사람이 실행한다 (Claude는 계정 생성·비밀번호 입력을 하지 않는다).
//
// 확인하는 것: "인게임 방관리 설정, 대기방/방 생성, 다음 게임 설정 복원 UI에서 관전자 허용 체크박스 및 관련 항목이 모두 제거되어 있다"
//   1) 방 생성 화면(/game-setup)의 모든 탭
//   2) 대기방(/game-matching)의 설정 편집 패널
//   3) 인게임 설정 → 방관리 탭 (방장)
//   각 화면의 보이는 글자에 "관전자"·"spectator"가 없고, 체크박스 이름에도 없어야 한다.
//   사망 참가자의 "관전 계속하기"는 이 화면들이 아니므로 여기서 나오면 안 된다.
//
// 전제: BR 후보 서버가 떠 있다 (백엔드 4000 · 프런트 5173, Claude가 띄워 둠). 로컬 QA 더미 계정 qa01·qa02를 쓴다.
// 실행:  node docs/qa/f23-br/check-ac01.mjs
import { accounts, API, launch, loginContext, sleep, WEB } from "../ui-16-browser-regression/harness/lib.mjs"
import { mkdirSync, writeFileSync } from "node:fs"

/**
 * 더미 계정 준비. 옛 하네스의 ensureAccounts는 email·password·nickname만 보내는데, 지금 가입 API는
 * passwordConfirm과 birthDate(ISO 날짜)도 필수다(backend/validation/signupValidation.js). 이미 있으면(409) 그대로 둔다.
 */
async function ensureAccounts(list) {
  for (const a of list) {
    const r = await fetch(`${API}/auth/signup`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...a, passwordConfirm: a.password, birthDate: "2000-01-01" }),
    })
    if (r.status !== 201 && r.status !== 200 && r.status !== 409) {
      const body = await r.text()
      throw new Error(`signup ${a.email} -> ${r.status} ${body.slice(0, 200)}`)
    }
  }
}

const OUT = "C:/Users/minsa/jokertest/docs/qa/f23-br/evidence"
mkdirSync(OUT, { recursive: true })
const FORBIDDEN = /관전자|spectat/i
const results = []
const log = []
const note = (m) => { const line = `[${new Date().toISOString().slice(11, 19)}] ${m}`; console.log(line); log.push(line) }

/** 화면의 보이는 글자와 체크박스·버튼의 접근성 이름을 모아 금지 어휘를 찾는다. */
async function audit(page, name) {
  const file = `${OUT}/${name}.png`
  await page.screenshot({ path: file, fullPage: false })
  const found = await page.evaluate(() => {
    const visible = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none" }
    const text = document.body.innerText
    const controls = [...document.querySelectorAll('input[type="checkbox"], [role="checkbox"], [role="switch"], button, label')]
      .filter(visible)
      .map((el) => (el.getAttribute("aria-label") || el.innerText || el.getAttribute("name") || el.id || "").trim())
      .filter(Boolean)
    return { text, controls }
  })
  const textHits = found.text.split("\n").map((l) => l.trim()).filter((l) => /관전자|spectat/i.test(l))
  const controlHits = found.controls.filter((c) => /관전자|spectat/i.test(c))
  const ok = textHits.length === 0 && controlHits.length === 0
  results.push({ screen: name, ok, textHits, controlHits, controls: found.controls.length, shot: file })
  note(`${ok ? "PASS" : "FAIL"} ${name} — 금지 어휘 ${textHits.length + controlHits.length}건 · 컨트롤 ${found.controls.length}개`)
  return ok
}

async function clickIfEnabled(page, name, exact = true) {
  const b = page.getByRole("button", { name, exact }).first()
  if (await b.count() === 0) return false
  if (!(await b.isVisible().catch(() => false)) || !(await b.isEnabled().catch(() => false))) return false
  await b.click({ timeout: 2000 }).catch(() => {})
  return true
}

/**
 * 인게임 설정을 연다. 역할 공개·단계 전환 안내(전체 화면 덮개, "단계 전환 안내 닫기")는 입장 뒤 제각각 늦게 뜨므로
 * 한 번 닫고 끝내면 안 된다 — 덮개가 보이면 닫고, 설정 버튼을 짧게 눌러 보고, 열릴 때까지 되풀이한다.
 */
async function openSettings(page, opened) {
  for (let k = 0; k < 40; k++) {
    for (const name of ["단계 전환 안내 닫기", "확인", "닫기"]) {
      const b = page.getByRole("button", { name, exact: true }).first()
      if (await b.isVisible().catch(() => false)) { await b.evaluate((el) => el.click()).catch(() => {}); await sleep(400) }
    }
    await page.getByRole("button", { name: "인게임 설정" }).click({ timeout: 1200 }).catch(() => {})
    await sleep(500)
    if (await opened(page)) return
  }
  throw new Error("인게임 설정을 열지 못했다 (덮개가 계속 가린다)")
}

// 기본 방은 광대 2명이고 서버는 '참가자 수 > 광대 수'일 때만 시작을 허용한다(computeCanStart). 그래서 3명이 필요하다.
const list = accounts(3)
await ensureAccounts(list)
const browser = await launch()
try {
  const S = []
  for (const a of list) S.push({ a, ...(await loginContext(browser, a)) })
  const host = S[0].page, guest = S[1].page, guests = S.slice(1).map((s) => s.page)
  note(`logged in ${S.length}`)

  // 1) 방 생성 화면 — 모든 탭
  await host.goto(`${WEB}/multiplay`); await sleep(800)
  await host.getByRole("button", { name: "방 만들기" }).click()
  await host.waitForURL(/game-setup/); await sleep(800)
  await audit(host, "1-game-setup-default-tab")
  const setupTabs = await host.locator('[role="tab"], nav button, [aria-pressed]').all()
  let t = 0
  for (const tab of setupTabs) {
    if (!(await tab.isVisible().catch(() => false))) continue
    await tab.click({ timeout: 1500 }).catch(() => {}); await sleep(400)
    await audit(host, `1-game-setup-tab-${++t}`)
  }
  await host.getByRole("button", { name: /게임 만들기/ }).click()
  await host.waitForURL(/game-matching/, { timeout: 15000 }); await sleep(1000)

  // 2) 대기방 — 기본 화면과 설정 편집 패널
  await audit(host, "2-matching-host")
  for (const name of [/설정/, /편집/, /방 설정/]) {
    const b = host.getByRole("button", { name }).first()
    if (await b.count() && await b.isVisible().catch(() => false)) {
      await b.click({ timeout: 1500 }).catch(() => {}); await sleep(700)
      await audit(host, "2-matching-settings-panel")
      // 편집 패널의 다른 탭도 본다 (일반 · 회의&투표)
      const voteTab = host.getByRole("button", { name: /회의\s*&\s*투표/ }).first()
      if (await voteTab.count() && await voteTab.isVisible().catch(() => false)) { await voteTab.click({ timeout: 1500 }).catch(() => {}); await sleep(500); await audit(host, "2-matching-settings-panel-vote-tab") }
      break
    }
  }
  // 이 패널은 ESC가 아니라 "취소"로 닫힌다 — 열린 채 두면 준비·시작 버튼을 가린다.
  // 접근성 이름은 "설정 변경 취소"다 (GameMatchingPage.jsx). 보이는 글자 "취소"로 찾으면 안 잡힌다.
  const cancel = host.getByRole("button", { name: "설정 변경 취소", exact: true }).first()
  if (await cancel.count() && await cancel.isVisible().catch(() => false)) { await cancel.click({ timeout: 1500 }).catch(() => {}); await sleep(600) }
  if (await host.getByRole("button", { name: "설정 저장" }).first().isVisible().catch(() => false)) throw new Error("대기방 설정 편집 패널이 닫히지 않았다")

  // 손님 입장 — 남은 계정 전부
  for (const p of guests) {
    await p.goto(`${WEB}/multiplay`); await sleep(1200)
    // 방 행은 aria-pressed 버튼이고 접근성 이름이 "<제목>, 1/10명…" 꼴이다. 방장 닉네임으로 먼저 찾고, 없으면 입장 가능한 첫 행을 고른다
    // (백엔드를 막 재시작해 방은 이것 하나뿐이다).
    let row = p.locator("li button[aria-pressed]").filter({ hasText: list[0].nickname }).first()
    if (await row.count() === 0) row = p.locator("li button[aria-pressed]:not([disabled])").first()
    if (await row.count() === 0) throw new Error("공개 방 목록에서 입장 가능한 방을 찾지 못했다")
    await row.click()
    await p.getByRole("button", { name: /입장/ }).first().evaluate((el) => el.click())
    await p.waitForURL(/game-matching/, { timeout: 15000 })
    await sleep(800)
  }

  // 준비 → 시작
  for (const s of S) { await clickIfEnabled(s.page, "준비완료"); await sleep(200) }
  await sleep(1200)
  let started = false
  for (let k = 0; k < 12 && !started; k++) { started = await clickIfEnabled(host, "게임시작"); if (!started) await sleep(700) }
  if (!started) {
    await host.screenshot({ path: `${OUT}/ERROR-cannot-start-host.png` })
    const names = await host.getByRole("button").evaluateAll((els) => els.map((el) => `${el.getAttribute("aria-label") || el.innerText}${el.disabled ? "(비활성)" : ""}`.trim()).filter(Boolean))
    throw new Error(`게임시작 버튼을 누르지 못했다 — 방장 화면 버튼: ${names.join(" | ").slice(0, 400)}`)
  }
  await host.waitForURL(/\/ingame/, { timeout: 20000 }); await sleep(2500)
  // 역할 공개 오버레이가 덮고 있으면 확인을 누른다
  for (const s of S) for (const name of ["확인", "닫기"]) await clickIfEnabled(s.page, name)
  await sleep(800)
  // 3) 인게임 설정 → 방관리 (방장)
  await openSettings(host, (p) => p.getByRole("button", { name: "방관리" }).first().isVisible().catch(() => false))
  await audit(host, "3-ingame-settings-default-tab")
  const roomTab = host.getByRole("button", { name: "방관리" }).first()
  if (await roomTab.count() === 0) throw new Error("방관리 탭이 없다 — 방장 계정이 맞는지 확인")
  await roomTab.click(); await sleep(600)
  const ok3 = await audit(host, "3-ingame-settings-room-tab")
  // 방관리 탭의 정상 항목이 그대로 있는지도 본다 (제거가 다른 항목을 같이 지우지 않았다)
  const body = await host.locator("body").innerText()
  const kept = ["플레이어 추방", "다음 게임 동일 설정 유지", "방 코드 복사"].map((label) => ({ label, present: body.includes(label) }))
  results.push({ screen: "3-room-tab-kept-items", ok: kept.every((k) => k.present), kept })
  note(`${kept.every((k) => k.present) ? "PASS" : "FAIL"} 방관리 정상 항목 — ${kept.map((k) => `${k.label}:${k.present ? "있음" : "없음"}`).join(" · ")}`)
  // 손님 화면에는 방관리 탭 자체가 없어야 한다 (hostOnly)
  await openSettings(guest, async (p) => !(await p.getByRole("button", { name: "단계 전환 안내 닫기" }).first().isVisible().catch(() => false)) && await p.getByRole("dialog").first().isVisible().catch(() => false)).catch((e) => note(`손님 설정 열기 생략: ${e.message}`))
  await audit(guest, "3-ingame-settings-guest")
  void ok3
} catch (e) {
  try { for (const [i, c] of browser.contexts().entries()) for (const pg of c.pages()) await pg.screenshot({ path: `${OUT}/ERROR-context-${i + 1}.png` }) } catch {}
  results.push({ screen: "harness", ok: false, error: String(e && e.message || e) })
  note(`ERROR ${e && e.message || e}`)
} finally {
  await browser.close()
}

const verdict = results.length > 0 && results.every((r) => r.ok) ? "PASS" : "FAIL"
writeFileSync(`${OUT}/result.json`, JSON.stringify({ at: new Date().toISOString(), candidate: "BR worktree (pluto/BR)", verdict, results, log }, null, 2))
console.log(`\n=== AC-01 화면 확인: ${verdict} — 상세: docs/qa/f23-br/evidence/result.json`)
process.exitCode = verdict === "PASS" ? 0 : 1
