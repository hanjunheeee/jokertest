import assert from "node:assert/strict"
import test from "node:test"
import { INGAME_E2E_ATTRS } from "../../../frontend/src/domains/game/ingame/constants/e2e/ingameE2eHooks.js"
import {
  OVERLAY_ATTRS,
  anyTarget,
  controlPanel,
  controlPanelWithPhase,
  controlPanelWithSelfRole,
  deadPlayerCard,
  escapeAttrValue,
  escapeRegExp,
  killReveal,
  nightPrivateResult,
  nightTarget,
  phaseEntrance,
  playerCard,
  publicRoomRowName,
  publicRoomTitle,
  selfPlayerCard,
} from "../selectors.js"

test("셀렉터는 프런트가 소유한 속성 이름을 그대로 쓴다(이름을 다시 적지 않는다)", () => {
  assert.equal(controlPanel(), `[${INGAME_E2E_ATTRS.phase}]`)
  assert.equal(anyTarget(), `[${INGAME_E2E_ATTRS.targetId}]`)
  assert.equal(selfPlayerCard(), `[${INGAME_E2E_ATTRS.playerSelf}="true"]`)
})

test("phase 셀렉터는 dayIndex를 넘기면 두 속성을 함께 대조한다", () => {
  assert.equal(controlPanelWithPhase("NIGHT"), `[${INGAME_E2E_ATTRS.phase}="NIGHT"]`)
  assert.equal(
    controlPanelWithPhase("DAY", 11),
    `[${INGAME_E2E_ATTRS.phase}="DAY"][${INGAME_E2E_ATTRS.dayIndex}="11"]`,
  )
  // dayIndex 0도 조건으로 살아 있어야 한다(falsy라고 빠지면 ROLE_REVEAL 대기를 못 잡는다).
  assert.equal(
    controlPanelWithPhase("ROLE_REVEAL", 0),
    `[${INGAME_E2E_ATTRS.phase}="ROLE_REVEAL"][${INGAME_E2E_ATTRS.dayIndex}="0"]`,
  )
})

test("본인 역할 셀렉터는 역할 값을 그대로 싣는다", () => {
  assert.equal(controlPanelWithSelfRole("GUARD"), `[${INGAME_E2E_ATTRS.selfRole}="GUARD"]`)
})

test("플레이어 카드 셀렉터는 닉네임으로, 사망 카드는 상태까지 함께 지목한다", () => {
  assert.equal(playerCard("테스터1"), `[${INGAME_E2E_ATTRS.playerNickname}="테스터1"]`)
  assert.equal(
    deadPlayerCard("테스터5"),
    `[${INGAME_E2E_ATTRS.playerNickname}="테스터5"][${INGAME_E2E_ATTRS.playerStatus}="dead"]`,
  )
})

test("대상 버튼 셀렉터는 uuid를 그대로 쓴다", () => {
  assert.equal(nightTarget("a1b2-c3"), `[${INGAME_E2E_ATTRS.targetId}="a1b2-c3"]`)
})

test("오버레이 셀렉터는 값이 있으면 대조하고 없으면 존재 여부만 본다", () => {
  assert.equal(phaseEntrance("NIGHT"), `[${OVERLAY_ATTRS.phaseEntrance}="NIGHT"]`)
  assert.equal(phaseEntrance(), `[${OVERLAY_ATTRS.phaseEntrance}]`)
  assert.equal(killReveal(), `[${OVERLAY_ATTRS.killReveal}]`)
  assert.equal(
    nightPrivateResult("INVESTIGATE"),
    `[${OVERLAY_ATTRS.nightPrivateResult}="INVESTIGATE"]`,
  )
  assert.equal(nightPrivateResult(), `[${OVERLAY_ATTRS.nightPrivateResult}]`)
})

test("닉네임에 인용부호가 섞여도 셀렉터가 깨지지 않는다", () => {
  assert.equal(escapeAttrValue('a"b'), 'a\\"b')
  assert.equal(escapeAttrValue("a\\b"), "a\\\\b")
  // 역슬래시를 먼저 escape해야 이미 넣은 역슬래시를 다시 건드리지 않는다.
  assert.equal(escapeAttrValue('a\\"b'), 'a\\\\\\"b')
  assert.equal(playerCard('닉"네임'), `[${INGAME_E2E_ATTRS.playerNickname}="닉\\"네임"]`)
})

test("공개 방 제목은 backend의 `{닉네임}의 방` 형식 그대로다", () => {
  assert.equal(publicRoomTitle("테스터1"), "테스터1의 방")
})

test("공개 방 row 이름 패턴은 지금 입장할 수 있는 방장의 방만 잡는다", () => {
  const pattern = publicRoomRowName("테스터1")
  assert.ok(pattern.test("테스터1의 방, 1/5명"))
  assert.ok(pattern.test("테스터1의 방, 4/5명"))
  // 목록 DTO에 지금은 없는 stage 배지가 앞에 붙어도 계속 잡혀야 한다.
  assert.ok(pattern.test("2단계 테스터1의 방, 3/5명"))
  // 접미가 붙은 방은 입장할 수 없다 — 셀렉터 단계에서 걸러진다.
  assert.equal(pattern.test("테스터1의 방, 5/5명, 마감"), false)
  assert.equal(pattern.test("테스터1의 방, 2/5명, 진행중"), false)
  assert.equal(pattern.test("테스터1의 방, 2/5명, 코드 필요"), false)
  // 다른 사람의 방은 잡지 않는다.
  assert.equal(pattern.test("테스터2의 방, 1/5명"), false)
})

test("정규식 메타문자가 섞인 닉네임도 리터럴로 취급한다", () => {
  assert.equal(escapeRegExp("닉(네임"), "닉\\(네임")
  const pattern = publicRoomRowName("닉(네임")
  assert.ok(pattern.test("닉(네임의 방, 1/5명"))
  assert.equal(pattern.test("닉네임의 방, 1/5명"), false)
})
