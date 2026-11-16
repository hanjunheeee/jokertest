// 역할 확인 창 시험(jsdom): 시작 알림 값으로 창을 그려 닉네임·직업 이름·설명·동료 줄·그림·닫기를 화면 글로 봄 (화면 부품)
// 목록 A02-F-121~186 (docs/게임_의도_2026-11-15/시험목록/A02-판시작-역할.md)
import test from "node:test"
import assert from "node:assert/strict"
import {
  React, RTL, installSocket, loginAs, renderInGamePage, resetAll, useInGameStore, waitUntil,
} from "./a02Render.mjs"
import {
  ALLY_ROLES, ROLE_NAME, autoCounts, buildGameStarted, buildSelf, firstOf, nextGameId, ofRole, seatCode, seatPlayers,
} from "./a02Fixtures.mjs"

const { default: InGameRoleRevealOverlay } = await import(
  "../../src/domains/game/ingame/components/roleReveal/InGameRoleRevealOverlay.jsx"
)
const { getInGameRoleRevealInfo } = await import("../../src/domains/game/ingame/utils/roleReveal.js")
const h = React.createElement

test.afterEach(() => resetAll())

// 보는 사람으로 시작 알림을 넣고, 판 화면이 넘기는 값 그대로 창을 그림 → 창(dialog) 또는 null
function renderReveal(seats, viewer, { self, onClose = () => {} } = {}) {
  installSocket()
  loginAs(viewer)
  RTL.act(() => {
    useInGameStore.getState().setGamePayload(buildGameStarted(seats, viewer, { gameId: nextGameId("ov"), self }))
  })
  const { state } = useInGameStore.getState()
  const roleInfo = getInGameRoleRevealInfo(state.self, { authUuid: viewer.uuid })
  const view = RTL.render(h(InGameRoleRevealOverlay, { open: true, onClose, roleInfo, players: state.players }))
  return { view, dialog: RTL.screen.queryByRole("dialog", { name: "내 역할 보기" }) }
}

// 창 안 동료 줄 글 (없으면 null) → "동료 의사"
const allyHeading = (dialog) => [...dialog.querySelectorAll("p")].map((p) => p.textContent).find((t) => t.startsWith("동료")) ?? null
// 창 안 동료 이름 목록 → ["민수"]
const allyNames = (dialog) => [...dialog.querySelectorAll("li")].map((li) => li.textContent)

// 같은 직업 상대가 있으면 동료 줄·상대 이름, 없으면 "동료" 글 없음
function assertAllyLine(dialog, seats, me) {
  const partners = ofRole(seats, me.role).filter((p) => p.uuid !== me.uuid)
  if (me.role !== "CITIZEN" && partners.length > 0) {
    assert.equal(allyHeading(dialog), `동료 ${ROLE_NAME[me.role]}`)
    assert.deepEqual(allyNames(dialog), partners.map((p) => p.nickname))
  } else {
    assert.doesNotMatch(dialog.textContent, /동료/)
  }
}

// A02-F-121~125 창에 닉네임·직업 이름·설명 글
const ALL_FIVE = seatCode("J1D1G1W1C1", { gameTag: "ov5" })
const NAME_CASES = [
  ["A02-F-121", "JOKER"], ["A02-F-122", "CITIZEN"], ["A02-F-123", "DOCTOR"], ["A02-F-124", "GUARD"], ["A02-F-125", "WITCH_HUNTER"],
]
for (const [no, role] of NAME_CASES) {
  test(`${no} ${ROLE_NAME[role]} 창 → 닉네임·직업 이름·설명 글 있음, "귀족"은 시민 직업 창에만`, () => {
    const me = firstOf(ALL_FIVE, role)
    const { dialog } = renderReveal(ALL_FIVE, me)
    assert.ok(dialog !== null, "창이 뜸")
    const lines = [...dialog.querySelectorAll("p")].map((p) => p.textContent)
    assert.ok(lines.includes(me.nickname), "닉네임")
    assert.ok(lines.includes(ROLE_NAME[role]), "직업 이름")
    // 이름·닉네임·동료 줄 말고 설명 문장이 한 줄 이상
    const description = lines.filter((t) => t !== me.nickname && t !== ROLE_NAME[role] && !t.startsWith("동료"))
    assert.ok(description.some((t) => t.length >= 10), `설명 글: ${JSON.stringify(lines)}`)
    // "귀족"은 시민 직업만의 이름 (다른 직업 창엔 없음)
    assert.equal(/귀족/.test(dialog.textContent), role === "CITIZEN")
  })
}

// 직업마다 2명 판 (5명)
const PAIR_CODES = { JOKER: "J2C3", DOCTOR: "J1D2C2", GUARD: "J1G2C2", WITCH_HUNTER: "J1W2C2" }

// A02-F-126~129 동료 줄 + 상대 닉네임
ALLY_ROLES.forEach((role, i) => {
  const no = `A02-F-${String(126 + i).padStart(3, "0")}`
  test(`${no} ${ROLE_NAME[role]} 2명 → "동료 ${ROLE_NAME[role]}" 줄 + 상대 닉네임`, () => {
    const seats = seatCode(PAIR_CODES[role], { gameTag: no })
    const [me, partner] = ofRole(seats, role)
    const { dialog } = renderReveal(seats, me)
    assert.equal(allyHeading(dialog), `동료 ${ROLE_NAME[role]}`)
    assert.deepEqual(allyNames(dialog), [partner.nickname])
  })
})

// A02-F-130~133 혼자면 동료 줄 없음
ALLY_ROLES.forEach((role, i) => {
  const no = `A02-F-${String(130 + i).padStart(3, "0")}`
  test(`${no} ${ROLE_NAME[role]} 1명 → "동료" 글 없음`, () => {
    const me = firstOf(ALL_FIVE, role)
    const { dialog } = renderReveal(ALL_FIVE, me)
    assert.ok(dialog !== null, "창이 뜸")
    assert.doesNotMatch(dialog.textContent, /동료/)
  })
})

test("A02-F-134 시민 6명 판(10명 자동)의 시민 창 → \"동료\" 글 없음", () => {
  const seats = seatPlayers(autoCounts(10), { gameTag: "f134" })
  const { dialog } = renderReveal(seats, firstOf(seats, "CITIZEN"))
  assert.ok(dialog !== null, "창이 뜸")
  assert.doesNotMatch(dialog.textContent, /동료/)
})

test("A02-F-135 판 화면에 뜬 역할 창에서 \"확인\" 누름 → 창이 사라짐", async () => {
  const seats = seatPlayers(autoCounts(6), { gameTag: "f135" })
  const me = firstOf(seats, "DOCTOR")
  installSocket()
  loginAs(me)
  RTL.act(() => { useInGameStore.getState().setGamePayload(buildGameStarted(seats, me, { gameId: nextGameId("ov-page") })) })
  renderInGamePage()
  const dialog = await RTL.screen.findByRole("dialog", { name: "내 역할 보기" })
  RTL.fireEvent.click(RTL.within(dialog).getByRole("button", { name: "확인" }))
  await waitUntil(() => RTL.screen.queryByRole("dialog", { name: "내 역할 보기" }) === null, { what: "역할 창 사라짐" })
})

test("A02-F-136 역할 정보 없음 → 아무것도 안 그림", () => {
  const view = RTL.render(h(InGameRoleRevealOverlay, { open: true, onClose: () => {}, roleInfo: null, players: [] }))
  assert.equal(view.container.innerHTML, "")
  assert.equal(RTL.screen.queryByRole("dialog") === null, true, "창 없음")
})

test("A02-F-137 [지금 동작] 동료 목록에 판 밖 uuid → 그 이름 안 보임", () => {
  const seats = seatCode("J1D2C2", { gameTag: "f137" })
  const [me, partner] = ofRole(seats, "DOCTOR")
  const { dialog } = renderReveal(seats, me, { self: buildSelf(seats, me, { allies: ["outside-uuid", partner.uuid] }) })
  assert.deepEqual(allyNames(dialog), [partner.nickname])
  assert.doesNotMatch(dialog.textContent, /outside-uuid/)
})

test("A02-F-138 10명 J2D2G2W2C2 의사 창 → 의사 상대 닉네임만, 다른 8명 닉네임 없음", () => {
  const seats = seatCode("J2D2G2W2C2", { gameTag: "f138" })
  const [me, partner] = ofRole(seats, "DOCTOR")
  const { dialog } = renderReveal(seats, me)
  assert.match(dialog.textContent, new RegExp(partner.nickname))
  for (const other of seats.filter((p) => p.uuid !== me.uuid && p.uuid !== partner.uuid)) {
    assert.doesNotMatch(dialog.textContent, new RegExp(other.nickname), other.nickname)
  }
})

// 판 하나의 사람마다 창 시험 만들기 (첫 번호부터 차례로)
function eachViewer(code, firstNo, gameTag) {
  const seats = seatCode(code, { gameTag })
  seats.forEach((me, i) => {
    const no = `A02-F-${String(firstNo + i).padStart(3, "0")}`
    test(`${no} ${seats.length}명 ${code} ${i + 1}번 자리(${ROLE_NAME[me.role]}) 창 → 자기 직업 + 같은 직업 상대 이름`, () => {
      const { dialog } = renderReveal(seats, me)
      assert.ok([...dialog.querySelectorAll("p")].some((p) => p.textContent === ROLE_NAME[me.role]))
      assertAllyLine(dialog, seats, me)
    })
  })
}

// A02-F-139~148 10명 짝 판 / A02-F-149~156 8명 시민 0 판 / A02-F-157~162 6명 J2D2C2 판
eachViewer("J2D2G2W2C2", 139, "f139")
eachViewer("J2D2G2W2", 149, "f149")
eachViewer("J2D2C2", 157, "f157")

// A02-F-163~183 자동 구성 판(광대 1) × 판에 있는 직업마다 보는 사람 → 자기 직업 이름, 동료 줄 없음
const AUTO_CASES = []
for (let n = 5; n <= 10; n += 1) {
  for (const role of ["JOKER", "DOCTOR", "GUARD", "WITCH_HUNTER", "CITIZEN"]) {
    if (autoCounts(n)[role]) AUTO_CASES.push({ n, role })
  }
}
AUTO_CASES.forEach(({ n, role }, i) => {
  const no = `A02-F-${String(163 + i).padStart(3, "0")}`
  test(`${no} 자동 ${n}명 판 ${ROLE_NAME[role]} 창 → 자기 직업 이름, 동료 줄 없음`, () => {
    const seats = seatPlayers(autoCounts(n), { gameTag: no })
    const { dialog } = renderReveal(seats, firstOf(seats, role))
    assert.ok([...dialog.querySelectorAll("p")].some((p) => p.textContent === ROLE_NAME[role]))
    assert.doesNotMatch(dialog.textContent, /동료/)
  })
})

// 창 안 그림 중 이름이 맞는 것 (주소는 한글이 인코딩돼 있어 풀어서 봄)
const imageNamed = (dialog, fileName) => [...dialog.querySelectorAll("img")]
  .find((img) => decodeURIComponent(img.getAttribute("src") ?? "").normalize("NFC").includes(fileName)) ?? null

test("A02-F-184 계정 스킨(광대2) 장착 광대 창 → 그 스킨 그림", () => {
  const me = firstOf(ALL_FIVE, "JOKER")
  const { dialog } = renderReveal(ALL_FIVE, me, { self: buildSelf(ALL_FIVE, me, { accountSkinId: "basic-skin-광대2" }) })
  assert.ok(imageNamed(dialog, "jobs-standing/광대2.webp") !== null, "광대2 서 있는 그림이 창에 있음")
})

test("A02-F-185 스킨 안 낀 광대 창 → 광대 기본 그림", () => {
  const me = firstOf(ALL_FIVE, "JOKER")
  const { dialog } = renderReveal(ALL_FIVE, me, { self: buildSelf(ALL_FIVE, me, { accountSkinId: null }) })
  assert.ok(imageNamed(dialog, "jobs-standing/광대1.webp") !== null, "광대 기본 서 있는 그림이 창에 있음")
})

test("A02-F-186 [지금 동작] 확인 단추에 맞춰 Enter → 창 닫힘", () => {
  let closed = 0
  const me = firstOf(ALL_FIVE, "GUARD")
  const { dialog } = renderReveal(ALL_FIVE, me, { onClose: () => { closed += 1 } })
  const button = RTL.within(dialog).getByRole("button", { name: "확인" })
  button.focus()
  assert.equal(document.activeElement === button, true, "확인 단추에 초점이 감")
  // 진짜 <button>이라 브라우저는 Enter를 누름으로 바꿈 → jsdom엔 그 기본 동작이 없어 같은 순서로 흉내
  assert.equal(button.tagName, "BUTTON")
  assert.equal(button.disabled, false)
  RTL.fireEvent.keyDown(button, { key: "Enter", code: "Enter" })
  if (closed === 0) RTL.fireEvent.click(button)
  assert.equal(closed, 1)
})
