// 결과판 화면 시험: 줄 수·이름·직업 글("마녀사냥꾼", "귀족"), MVP 없음, 내 줄에만 "+N골드", 내 정보 배지, 승패·진영 띠, 신고 단추, 결과 없음 안내, 옛 결과·줄 순서·닉네임 글자 그대로
// 목록 docs/게임_의도_2026-11-15/시험목록/A07-승패-결과-골드.md A07-F-045~070·074·075·096~099·104 (화면 부품, 결과 화면 전체를 그려 봄)
import test from "node:test"
import assert from "node:assert/strict"
import * as K from "./resultKit.mjs"

const { default: GameResultPage } = await import("../../src/domains/game/result/page/GameResultPage.jsx")

test.afterEach(K.resetAll)

// 끝난 판 결과 화면을 그리고 결과 영상을 넘김 → 결과판
async function renderBoard(options) {
  const sock = K.installFakeSocket()
  const g = K.endedGame(options)
  sock.answer("get_session_snapshot", () => g.snapshot)
  const view = await K.renderAt("/gameresult", K.h(GameResultPage))
  await K.finishIntro()
  await K.flush()
  return { ...g, sock, view }
}

// 결과판 줄들과 줄 안 칸 읽기 (줄 = 프로필·이름 칸·직업·골드·신고)
const board = () => document.querySelector('section[aria-label="가면무도회 참가자 정체"]')
const rows = () => [...(board()?.querySelectorAll("ul > li") ?? [])]
const nameOf = (li) => li.querySelector("p")?.textContent ?? ""
const jobOf = (li) => li.firstElementChild?.children[2]?.textContent ?? ""
const goldTags = () => [...document.querySelectorAll('[data-testid="game-result-gold-reward"]')]
const rowOfName = (name) => rows().find((li) => nameOf(li) === name) ?? null
const reportButtons = () => [...document.querySelectorAll('[data-testid="report-row-button"]')]

// 결과판 줄이 사람 수만큼 (5~10명)
for (const [i, n] of [5, 6, 7, 8, 9, 10].entries()) {
  const no = `A07-F-${String(45 + i).padStart(3, "0")}`
  test(`${no} ${n}명 판: 결과판 줄 ${n}개, 줄마다 이름·직업 글`, async () => {
    const g = await renderBoard({ n, me: 1 })
    assert.equal(rows().length, n)
    assert.deepEqual(rows().map(nameOf), g.seats.map((s) => s.nickname))
    for (const li of rows()) assert.ok(jobOf(li).length > 0, `${nameOf(li)} 줄 직업 글 없음`)
  })
}

test("A07-F-051 10명 판: MVP 자리 없음 (\"MVP\" 글·MVP 칸 없음)", async () => {
  await renderBoard({ n: 10, me: 4, roles: ["JOKER", "JOKER", "DOCTOR", "GUARD", "WITCH_HUNTER", "CITIZEN", "CITIZEN", "CITIZEN", "CITIZEN", "CITIZEN"] })
  assert.equal(rows().length, 10)
  assert.doesNotMatch(document.body.textContent, /MVP/i)
  assert.equal(document.querySelectorAll('[data-testid*="mvp" i], [class*="mvp" i], [aria-label*="MVP" i]').length, 0)
})

test("A07-F-052 7명 판: 빈 칸 없이 그려짐 (이름 빈 줄 0, 줄 사이 빈 자리 없음)", async () => {
  await renderBoard({ n: 7, me: 2 })
  const list = board().querySelector("ul")
  assert.equal(list.children.length, 7)
  assert.equal(rows().filter((li) => nameOf(li).trim() === "").length, 0)
  // 줄 말고 다른 빈 요소가 목록 안에 끼어 있지 않음
  assert.equal([...list.children].every((el) => el.tagName === "LI" && el.textContent.trim().length > 0), true)
})

// 직업 칸 글
const JOB_ROWS = [
  ["A07-F-053", "JOKER", "광대"],
  ["A07-F-054", "CITIZEN", "귀족"],
  ["A07-F-055", "DOCTOR", "의사"],
  ["A07-F-056", "GUARD", "경비원"],
  ["A07-F-057", "WITCH_HUNTER", "마녀사냥꾼"],
]
for (const [no, role, label] of JOB_ROWS) {
  test(`${no} 8명 판: ${role} 줄 직업 칸 글 "${label}"`, async () => {
    const roles = ["JOKER", "JOKER", "CITIZEN", "CITIZEN", "CITIZEN", "CITIZEN", "CITIZEN", "CITIZEN"]
    roles[3] = role
    const g = await renderBoard({ n: 8, me: 5, roles })
    assert.equal(jobOf(rowOfName(g.seats[3].nickname)), label)
  })
}

test("A07-F-058 5명 판: 마녀사냥꾼 1명 + 시민 3명 → 마녀사냥꾼 줄 \"마녀사냥꾼\", \"귀족\"은 시민 줄 3개뿐, 직업 칸에 \"시민\" 글은 없음", async () => {
  const g = await renderBoard({ n: 5, me: 2, roles: ["JOKER", "WITCH_HUNTER", "CITIZEN", "CITIZEN", "CITIZEN"] })
  assert.equal(jobOf(rowOfName(g.seats[1].nickname)), "마녀사냥꾼")
  const citizenRows = rows().filter((li) => jobOf(li) === "귀족").map(nameOf)
  assert.deepEqual(citizenRows, [g.seats[2].nickname, g.seats[3].nickname, g.seats[4].nickname])
  assert.equal(rows().filter((li) => jobOf(li) === "시민").length, 0)
})

// 내 줄 받은 골드 (0이면 골드 칸 없음)
const MY_GOLD = [
  ["A07-F-059", 1, "+1골드"],
  ["A07-F-060", 2, "+2골드"],
  ["A07-F-061", 100, "+100골드"],
  ["A07-F-062", 0, null],
]
for (const [no, gold, label] of MY_GOLD) {
  test(`${no} 6명 판: 내 골드 ${gold} → ${label === null ? "골드 칸 없음" : `내 줄 "${label}"`}`, async () => {
    const g = await renderBoard({ n: 6, me: 3, gold })
    if (label === null) {
      assert.equal(goldTags().length, 0)
      return
    }
    assert.equal(goldTags().length, 1)
    assert.equal(goldTags()[0].textContent, label)
    assert.ok(rowOfName(g.seats[3].nickname).contains(goldTags()[0]), "골드 칸이 내 줄 밖에 있음")
  })
}

test("A07-F-063 7명 판: 전원 골드 1 → 골드 칸은 내 줄 1개뿐", async () => {
  const g = await renderBoard({ n: 7, me: 5, gold: 1 })
  assert.equal(goldTags().length, 1)
  assert.ok(rowOfName(g.seats[5].nickname).contains(goldTags()[0]), "골드 칸이 내 줄에 없음")
})

test("A07-F-064 5명 판: 다른 4명 1·나 0 → 골드 칸 0개", async () => {
  await renderBoard({ n: 5, me: 2, gold: [1, 1, 0, 1, 1] })
  assert.equal(goldTags().length, 0)
  assert.doesNotMatch(board().textContent, /골드/)
})

test("A07-F-065 6명 판: \"내 정보\" 배지 1개, 내 이름 줄 안", async () => {
  const g = await renderBoard({ n: 6, me: 4 })
  const badges = rows().filter((li) => li.textContent.includes("내 정보"))
  assert.equal(badges.length, 1)
  assert.equal(nameOf(badges[0]), g.seats[4].nickname)
})

test("A07-F-066 8명 판: 내 편 이김 → 띠 \"승리\"", async () => {
  await renderBoard({ n: 8, me: 3, winner: "CITIZEN" })
  assert.ok(K.RTL.screen.queryByText("승리") !== null, "승리 띠 없음")
  assert.ok(K.RTL.screen.queryByText("패배") === null, "없어야 할 것이 있음: K.RTL.screen.queryByText('패배')")
})

test("A07-F-067 8명 판: 내 편 짐 → 띠 \"패배\"", async () => {
  await renderBoard({ n: 8, me: 3, winner: "JOKER" })
  assert.ok(K.RTL.screen.queryByText("패배") !== null, "패배 띠 없음")
  assert.ok(K.RTL.screen.queryByText("승리") === null, "없어야 할 것이 있음: K.RTL.screen.queryByText('승리')")
})

test("A07-F-068 9명 판: 시민 승 → 이긴 진영 띠 \"시민 진영 승리\"", async () => {
  await renderBoard({ n: 9, me: 0, winner: "CITIZEN" })
  assert.ok(K.RTL.screen.queryByText("시민 진영 승리") !== null, "시민 진영 띠 없음")
  assert.ok(K.RTL.screen.queryByText("광대 진영 승리") === null, "없어야 할 것이 있음: K.RTL.screen.queryByText('광대 진영 승리')")
})

test("A07-F-069 9명 판: 광대 승 → 이긴 진영 띠 \"광대 진영 승리\"", async () => {
  await renderBoard({ n: 9, me: 0, winner: "JOKER" })
  assert.ok(K.RTL.screen.queryByText("광대 진영 승리") !== null, "광대 진영 띠 없음")
  assert.ok(K.RTL.screen.queryByText("시민 진영 승리") === null, "없어야 할 것이 있음: K.RTL.screen.queryByText('시민 진영 승리')")
})

test("A07-F-070 5명 판: 신고 단추 4개, 내 줄 0", async () => {
  const g = await renderBoard({ n: 5, me: 2 })
  assert.equal(reportButtons().length, 4)
  const mine = rowOfName(g.seats[2].nickname)
  assert.equal(mine.querySelectorAll('[data-testid="report-row-button"]').length, 0)
  // 남의 줄마다 하나씩
  for (const i of [0, 1, 3, 4]) {
    assert.equal(rowOfName(g.seats[i].nickname).querySelectorAll('[data-testid="report-row-button"]').length, 1)
  }
})

test("A07-F-074 판 결과를 못 받으면 안내: 결과 없음 → \"게임 결과를 확인할 수 없습니다\" + \"로비로 돌아가기\"", async () => {
  const sock = K.installFakeSocket()
  K.signIn("a07a0000-0000-4000-8000-000000999999", "나")
  // 새로고침 뒤 서버도 판이 없다고 답함
  sock.answer("get_session_snapshot", { ok: false, code: "SESSION_NOT_FOUND" })
  await K.renderAt("/gameresult", K.h(GameResultPage))
  await K.waitUntil(() => document.body.textContent.includes("게임 결과를 확인할 수 없습니다"), { label: "결과 없음 안내" })
  assert.ok(K.button("로비로 돌아가기") !== null, "로비로 돌아가기 단추 없음")
  assert.ok(board() === null, "없어야 할 것이 있음: board()")
})

test("A07-F-075 6명 판: 산 3·죽은 3 → 줄 모양 같음, \"사망\" 글 없음", async () => {
  // 나는 0번(산 사람), 1·2번 산 사람, 3·4·5번 죽은 사람
  const g = await renderBoard({ n: 6, me: 0, roles: ["CITIZEN", "CITIZEN", "JOKER", "CITIZEN", "CITIZEN", "CITIZEN"], dead: [3, 4, 5], winner: "CITIZEN" })
  const shape = (li) => `${li.className}|${li.firstElementChild.className}|${li.firstElementChild.children.length}`
  const alive = [1, 2].map((i) => shape(rowOfName(g.seats[i].nickname)))
  const dead = [3, 4, 5].map((i) => shape(rowOfName(g.seats[i].nickname)))
  for (const s of [...alive, ...dead]) assert.equal(s, alive[0])
  assert.doesNotMatch(board().textContent, /사망/)
})

test("A07-F-096 7명 판: 공개 줄에 goldReward 없음(옛 결과) → 결과판 그려짐, 골드 칸 0", async () => {
  const sock = K.installFakeSocket()
  const g = K.endedGame({ n: 7, me: 1, gold: undefined })
  // 공개 줄에서 골드 칸을 아예 뺀 옛 서버 모양
  K.useInGameStore.getState().clearGame()
  const old = { ...g.snapshot, winResult: { ...g.snapshot.winResult, reveals: g.snapshot.winResult.reveals.map((r) => { const copy = { ...r }; delete copy.goldReward; return copy }) } }
  K.useInGameStore.getState().bootstrapSessionSnapshot(old, null)
  sock.answer("get_session_snapshot", () => old)
  await K.renderAt("/gameresult", K.h(GameResultPage))
  await K.finishIntro()
  await K.flush()
  assert.equal(rows().length, 7)
  assert.equal(goldTags().length, 0)
})

test("A07-F-097 5명 판: 공개 순서 c·a·b… → 결과판 줄 순서도 c·a·b…", async () => {
  const sock = K.installFakeSocket()
  const g = K.endedGame({ n: 5, me: 1, names: { 0: "a", 1: "b", 2: "c", 3: "d", 4: "e" } })
  const r = g.snapshot.winResult.reveals
  const reordered = { ...g.snapshot, winResult: { ...g.snapshot.winResult, reveals: [r[2], r[0], r[1], r[4], r[3]] } }
  K.useInGameStore.getState().clearGame()
  K.useInGameStore.getState().bootstrapSessionSnapshot(reordered, null)
  sock.answer("get_session_snapshot", () => reordered)
  await K.renderAt("/gameresult", K.h(GameResultPage))
  await K.finishIntro()
  await K.flush()
  assert.deepEqual(rows().map(nameOf), ["c", "a", "b", "e", "d"])
})

test("A07-F-098 6명 판: 골드 글은 \"내 정보\" 배지와 같은 줄 요소 안", async () => {
  await renderBoard({ n: 6, me: 2, gold: 1 })
  const badgeRow = rows().find((li) => li.textContent.includes("내 정보"))
  assert.ok(badgeRow, "내 정보 줄 없음")
  assert.equal(goldTags().length, 1)
  assert.ok(badgeRow.contains(goldTags()[0]), "골드 글이 내 정보 줄 밖에 있음")
})

test("A07-F-099 5명 판: 닉네임 끼워 넣기 글은 글자로만 (img 요소 0)", async () => {
  const evil = "<img src=x onerror=alert(1)>"
  const g = await renderBoard({ n: 5, me: 1, names: { 3: evil } })
  assert.equal(nameOf(rowOfName(evil)), evil)
  assert.equal(board().querySelectorAll('img[src="x"]').length, 0)
  assert.equal(document.querySelectorAll("img[onerror]").length, 0)
  assert.ok(g.seats[3].nickname === evil)
})

// 내 줄 이름은 검정 하나만, 남의 줄은 흰색 하나만 (두 글자색이 같이 붙으면 스타일 순서상 흰색이 이겨 밝은 덧칠 위에서 대비 4.1)
// 계산: 흰 글 대비 3.99~4.1인 바탕 밝기면 검정 글 대비 약 5.1~5.3 (4.5 넘음)
const TEXT_COLOR = /^text-(white|black|\[#[0-9a-f]+\])$/i
const nameColors = (li) => [...(li.querySelector("p")?.classList ?? [])].filter((c) => TEXT_COLOR.test(c))
test("A07-F-104 7명 판: \"내 정보\" 줄 이름 글자색 = text-black 하나, 남의 줄 이름 = text-white 하나", async () => {
  const g = await renderBoard({ n: 7, me: 3 })
  for (const li of rows()) {
    const mine = nameOf(li) === g.seats[3].nickname
    assert.deepEqual(nameColors(li), [mine ? "text-black" : "text-white"], `${nameOf(li)} 줄 이름 글자색`)
  }
})
