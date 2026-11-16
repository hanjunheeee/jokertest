// 방 만들기 화면 일반 탭 시험: 코드로만 참가 칸, 처음 값, 경계 단추 꺼짐, 구성 고르기, 직접 지정 칸·시민 수 글·합 넘음 오류·안내 글
// 목록 A01a "화면 PC" A01-F-101~128, 설정 패널(만들기 모드)을 그려서 봄
import test from "node:test"
import assert from "node:assert/strict"
import "../helpers/domSetup.mjs"

const React = await import("react")
const { render, screen, cleanup } = await import("@testing-library/react")
const { default: GameSetupPanel } = await import("../../src/domains/game/setup/components/GameSetupPanel.jsx")
const H = await import("./a01a-helpers.mjs")

test.afterEach(() => cleanup())

const MAX = "최대 플레이어 수"
const JOKER = "광대(마피아) 플레이어 수"
const ROLE_LABELS = { JOKER: "광대 인원", DOCTOR: "의사 인원", GUARD: "경비원 인원", WITCH_HUNTER: "마녀사냥꾼 인원" }

const renderPanel = () =>
  render(React.createElement(GameSetupPanel, { visible: true, isCreating: false, onCreateGame: () => {} }))
const bodyText = () => document.body.textContent
const createButton = () => H.buttonNamed("게임 만들기")

// 직접 지정으로 바꾸고 직업 수 맞춤 (예: { JOKER: 1, DOCTOR: 2 })
function goCustom(counts = {}) {
  H.press("역할 구성 증가")
  for (const [role, label] of Object.entries(ROLE_LABELS)) {
    if (counts[role] !== undefined) H.stepTo(label, counts[role])
  }
}

test("A01-F-101 일반 탭 → '코드로만 참가' 체크칸 + '방 목록에 코드 필요로 표시되며…' 글", () => {
  renderPanel()
  const box = screen.getByRole("checkbox", { name: "코드로만 참가" })
  assert.equal(box.getAttribute("aria-checked"), "false")
  assert.match(bodyText(), /방 목록에 코드 필요로 표시되며/)
})

test("A01-F-102 처음 값: 정원 칸 10", () => {
  renderPanel()
  assert.equal(H.stepperValue(MAX), 10)
})

test("A01-F-103 처음 값: 광대 칸 2", () => {
  renderPanel()
  assert.equal(H.stepperValue(JOKER), 2)
})

const EDGE_CASES = [
  ["A01-F-104", "정원 5까지 내림 → − 꺼짐", MAX, 5, "감소"],
  ["A01-F-105", "정원 10 → + 꺼짐", MAX, 10, "증가"],
  ["A01-F-106", "광대 1 → − 꺼짐", JOKER, 1, "감소"],
  ["A01-F-107", "광대 2 → + 꺼짐", JOKER, 2, "증가"],
]

for (const [no, name, label, value, side] of EDGE_CASES) {
  test(`${no} ${name}`, () => {
    renderPanel()
    H.stepTo(label, value)
    assert.equal(H.buttonNamed(`${label} ${side}`).disabled, true)
    // 반대쪽은 켜져 있음 (늘 꺼진 단추가 아님)
    assert.equal(H.buttonNamed(`${label} ${side === "감소" ? "증가" : "감소"}`).disabled, false)
  })
}

test("A01-F-108 '역할 구성' 칸에 '자동'·'직접 지정', 처음 자동, 직업 인원 칸 안 보임", () => {
  renderPanel()
  assert.equal(H.stepperText("역할 구성"), "자동")
  H.press("역할 구성 증가")
  assert.equal(H.stepperText("역할 구성"), "직접 지정")
  H.press("역할 구성 감소")
  assert.equal(H.stepperText("역할 구성"), "자동")
  for (const label of Object.values(ROLE_LABELS)) assert.ok(H.buttonNamed(`${label} 증가`) === null, `${label} 없음`)
})

test("A01-F-109 '직접 지정' 누름 → 광대·의사·경비원·마녀사냥꾼 인원 칸 + '귀족: …명 (자동 계산)'", () => {
  renderPanel()
  goCustom()
  for (const label of Object.values(ROLE_LABELS)) assert.ok(H.buttonNamed(`${label} 증가`), `${label} 있음`)
  assert.match(bodyText(), /귀족: \d+명 \(자동 계산\)/)
})

// 정원 5~10 × 직접 J1 → 시민 정원-1명
const CITIZEN_NOS = ["A01-F-110", "A01-F-111", "A01-F-112", "A01-F-113", "A01-F-114", "A01-F-115"]
for (const [i, maxPlayers] of [5, 6, 7, 8, 9, 10].entries()) {
  test(`${CITIZEN_NOS[i]} 정원 ${maxPlayers} 직접 J1 → '귀족: ${maxPlayers - 1}명 (자동 계산)', '지정한 인원 합계: 1 / ${maxPlayers}명'`, () => {
    renderPanel()
    goCustom({ JOKER: 1 })
    H.stepTo(MAX, maxPlayers)
    assert.ok(bodyText().includes(`귀족: ${maxPlayers - 1}명 (자동 계산)`))
    assert.ok(bodyText().includes(`지정한 인원 합계: 1 / ${maxPlayers}명`))
  })
}

const PLUS_NOS = [["A01-F-116", "JOKER"], ["A01-F-117", "DOCTOR"], ["A01-F-118", "GUARD"], ["A01-F-119", "WITCH_HUNTER"]]
for (const [no, role] of PLUS_NOS) {
  test(`${no} 정원 10 ${ROLE_LABELS[role]} 2까지 올림 → + 꺼짐`, () => {
    renderPanel()
    goCustom({ JOKER: 1 })
    H.stepTo(ROLE_LABELS[role], 2)
    assert.equal(H.buttonNamed(`${ROLE_LABELS[role]} 증가`).disabled, true)
  })
}

test("A01-F-120 직접 지정 광대 1 → − 꺼짐", () => {
  renderPanel()
  goCustom({ JOKER: 1 })
  assert.equal(H.buttonNamed("광대 인원 감소").disabled, true)
})

// 정원 5~10 × J2D2G2W2(8명분)
const OVER_NOS = ["A01-F-121", "A01-F-122", "A01-F-123", "A01-F-124", "A01-F-125", "A01-F-126"]
const OVER_MSG = "지정한 역할 인원의 합이 최대 플레이어 수를 넘습니다."
for (const [i, maxPlayers] of [5, 6, 7, 8, 9, 10].entries()) {
  const over = maxPlayers < 8
  test(`${OVER_NOS[i]} 정원 ${maxPlayers} J2D2G2W2 → ${over ? "오류 글 + '게임 만들기' 꺼짐" : "글 없음·켜짐"}`, () => {
    renderPanel()
    goCustom({ JOKER: 2, DOCTOR: 2, GUARD: 2, WITCH_HUNTER: 2 })
    H.stepTo(MAX, maxPlayers)
    assert.equal(bodyText().includes(OVER_MSG), over)
    assert.equal(createButton().disabled, over)
  })
}

test("A01-F-127 정원 5 J2D1G1W1 → '귀족: 0명', 만들기 켜짐", () => {
  renderPanel()
  goCustom({ JOKER: 2, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 1 })
  H.stepTo(MAX, 5)
  assert.ok(bodyText().includes("귀족: 0명"))
  assert.equal(createButton().disabled, false)
})

test("A01-F-128 직접 지정 → 귀족 수 안내 글", () => {
  renderPanel()
  goCustom()
  assert.ok(bodyText().includes("귀족 수는 게임 시작 시점의 실제 참가 인원에서 지정한 역할을 뺀 나머지로 정해집니다."))
})
