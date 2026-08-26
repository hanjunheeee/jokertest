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
  killReveal,
  nightPrivateResult,
  nightTarget,
  phaseEntrance,
  playerCard,
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
