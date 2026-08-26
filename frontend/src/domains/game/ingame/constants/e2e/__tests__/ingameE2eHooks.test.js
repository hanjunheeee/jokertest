import assert from "node:assert/strict"
import test from "node:test"
import { readFile } from "node:fs/promises"
import {
  INGAME_E2E_ATTRS,
  buildInGameControlPanelE2eAttrs,
  buildInGamePlayerCardE2eAttrs,
  buildInGameTargetE2eAttrs,
} from "../ingameE2eHooks.js"

/**
 * 아래 세 컴포넌트는 실제 JSX 문법을 쓰는 .jsx 파일이라 이 저장소의 node:test 실행에는 JSX
 * 로더가 없어 직접 import/렌더링할 수 없다(InGameActionPanel.productionSource.test.js의
 * 주석 참고). 그래서 빌더의 순수 계약은 직접 호출로, 실제 배선은 raw source 대조로 증명한다.
 */
const ACTION_PANEL_URL = new URL(
  "../../../components/actions/InGameActionPanel.jsx",
  import.meta.url,
)
const TARGET_PICKER_URL = new URL(
  "../../../components/actions/InGameTargetPicker.jsx",
  import.meta.url,
)
const PLAYER_CARD_URL = new URL(
  "../../../components/board/InGamePlayerCard.jsx",
  import.meta.url,
)

test("INGAME_E2E_ATTRS는 얼어 있고 모든 이름이 data-ingame- 접두를 쓴다", () => {
  assert.equal(Object.isFrozen(INGAME_E2E_ATTRS), true)
  for (const [key, name] of Object.entries(INGAME_E2E_ATTRS)) {
    assert.match(name, /^data-ingame-[a-z-]+$/, `${key}의 속성 이름이 관례를 벗어난다`)
  }
  // 이름이 겹치면 두 빌더가 서로의 값을 덮어쓴다.
  const names = Object.values(INGAME_E2E_ATTRS)
  assert.equal(new Set(names).size, names.length)
})

test("컨트롤 패널 빌더는 phase·dayIndex·본인 역할을 문자열 속성으로 만든다", () => {
  assert.deepEqual(
    buildInGameControlPanelE2eAttrs({ phase: "NIGHT", dayIndex: 3, self: { role: "GUARD" } }),
    {
      [INGAME_E2E_ATTRS.phase]: "NIGHT",
      [INGAME_E2E_ATTRS.dayIndex]: "3",
      [INGAME_E2E_ATTRS.selfRole]: "GUARD",
    },
  )
})

test("컨트롤 패널 빌더는 dayIndex 0도 그대로 싣는다(falsy 값이 조용히 빠지지 않는다)", () => {
  const attrs = buildInGameControlPanelE2eAttrs({ phase: "ROLE_REVEAL", dayIndex: 0 })
  assert.equal(attrs[INGAME_E2E_ATTRS.dayIndex], "0")
  assert.equal(INGAME_E2E_ATTRS.selfRole in attrs, false)
})

test("컨트롤 패널 빌더는 결측·형태 불일치 입력에서 그 키 자체를 만들지 않는다", () => {
  assert.deepEqual(buildInGameControlPanelE2eAttrs(null), {})
  assert.deepEqual(buildInGameControlPanelE2eAttrs(undefined), {})
  assert.deepEqual(buildInGameControlPanelE2eAttrs([]), {})
  assert.deepEqual(buildInGameControlPanelE2eAttrs({ phase: "", dayIndex: 1.5, self: null }), {})
  // 값이 undefined인 키가 남으면 DOM에 빈 문자열로 새어 e2e가 오독한다.
  const attrs = buildInGameControlPanelE2eAttrs({ phase: "DAY" })
  assert.deepEqual(Object.keys(attrs), [INGAME_E2E_ATTRS.phase])
})

test("플레이어 카드 빌더는 닉네임·상태·본인 여부만 싣는다", () => {
  assert.deepEqual(
    buildInGamePlayerCardE2eAttrs({ nickname: "테스터1", status: "dead", isSelf: true }),
    {
      [INGAME_E2E_ATTRS.playerNickname]: "테스터1",
      [INGAME_E2E_ATTRS.playerStatus]: "dead",
      [INGAME_E2E_ATTRS.playerSelf]: "true",
    },
  )
  assert.equal(
    buildInGamePlayerCardE2eAttrs({ nickname: "테스터2", status: "alive", isSelf: false })[
      INGAME_E2E_ATTRS.playerSelf
    ],
    "false",
  )
})

test("플레이어 카드 빌더는 role·team 같은 비밀 필드를 어떤 입력으로도 내보내지 않는다", () => {
  const attrs = buildInGamePlayerCardE2eAttrs({
    nickname: "테스터3",
    status: "alive",
    isSelf: false,
    role: "JOKER",
    team: "JOKER",
    uuid: "u-1",
  })
  const serialized = JSON.stringify(attrs)
  assert.doesNotMatch(serialized, /JOKER/)
  assert.doesNotMatch(serialized, /role|team|uuid/i)
  assert.deepEqual(Object.keys(attrs).sort(), [
    INGAME_E2E_ATTRS.playerNickname,
    INGAME_E2E_ATTRS.playerSelf,
    INGAME_E2E_ATTRS.playerStatus,
  ].sort())
})

test("플레이어 카드 빌더는 결측 입력에서 그 키를 만들지 않는다", () => {
  assert.deepEqual(buildInGamePlayerCardE2eAttrs(), {})
  assert.deepEqual(buildInGamePlayerCardE2eAttrs({}), {})
  assert.deepEqual(buildInGamePlayerCardE2eAttrs({ nickname: "", status: "", isSelf: "true" }), {})
})

test("대상 버튼 빌더는 uuid가 있을 때만 target-id를 만든다", () => {
  assert.deepEqual(buildInGameTargetE2eAttrs({ id: "uuid-1", name: "테스터1" }), {
    [INGAME_E2E_ATTRS.targetId]: "uuid-1",
  })
  assert.deepEqual(buildInGameTargetE2eAttrs({ id: "" }), {})
  assert.deepEqual(buildInGameTargetE2eAttrs(null), {})
  assert.deepEqual(buildInGameTargetE2eAttrs(undefined), {})
  assert.deepEqual(buildInGameTargetE2eAttrs([]), {})
})

test("InGameActionPanel은 gameState가 있는 aside에만 컨트롤 패널 훅을 전개한다", async () => {
  const source = await readFile(ACTION_PANEL_URL, "utf8")
  assert.match(
    source,
    /import \{ buildInGameControlPanelE2eAttrs \} from "\.\.\/\.\.\/constants\/e2e\/ingameE2eHooks\.js"/,
  )
  const spreads = source.match(/\{\.\.\.buildInGameControlPanelE2eAttrs\(gameState\)\}/g) ?? []
  assert.equal(spreads.length, 1)
  // 속성 이름을 손으로 다시 적으면 단일 원천이 깨진다.
  assert.doesNotMatch(source, /"data-ingame-/)
})

test("InGameTargetPicker는 각 대상 버튼에 target-id 훅을 전개한다", async () => {
  const source = await readFile(TARGET_PICKER_URL, "utf8")
  assert.match(
    source,
    /import \{ buildInGameTargetE2eAttrs \} from "\.\.\/\.\.\/constants\/e2e\/ingameE2eHooks\.js"/,
  )
  assert.match(source, /\{\.\.\.buildInGameTargetE2eAttrs\(player\)\}/)
  assert.doesNotMatch(source, /"data-ingame-/)
})

test("InGamePlayerCard는 카드 최상위에 닉네임·상태·본인 훅을 전개한다", async () => {
  const source = await readFile(PLAYER_CARD_URL, "utf8")
  assert.match(
    source,
    /import \{ buildInGamePlayerCardE2eAttrs \} from "\.\.\/\.\.\/constants\/e2e\/ingameE2eHooks\.js"/,
  )
  assert.match(
    source,
    /\{\.\.\.buildInGamePlayerCardE2eAttrs\(\{\s*nickname,\s*status,\s*isSelf\s*\}\)\}/,
  )
  // role/team을 카드 훅에 넘기려는 시도는 여기서 막힌다.
  assert.doesNotMatch(source, /buildInGamePlayerCardE2eAttrs\([^)]*role/)
  assert.doesNotMatch(source, /"data-ingame-/)
})
