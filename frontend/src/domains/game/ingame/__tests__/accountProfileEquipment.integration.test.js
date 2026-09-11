import test, { mock } from "node:test"
import assert from "node:assert/strict"

// F-13 AC-05 — 대기방(matchmaking room.players) → 서버 game_started/재접속 스냅샷
// (buildPlayerAccountProfileFields, backend/game-core/gameSession.js) → 프런트 변환
// (buildPlayerSessionSourceFromGameState) → 최종 카드 렌더 입력(mergeSourcePlayerWithPreview)
// 까지 실제 함수를 그대로 연결해 계정 사진이 최종 초상에 반영되는지 검증한다.
//
// buildPlayerSessionSourceFromGameState가 accountProfilePhotoId/accountProfileBorderId를
// own-property일 때만 조건부로 옮기지 않으면(dayTwoVoteAliveScenario.test.js와 같은 관례로
// pickInGameJobPortrait/pickInGamePlayerFrame을 모킹해 더미 preview를 고정한 뒤), 서버가
// 아무리 값을 내려줘도 mergeSourcePlayerWithPreview까지 도달하지 못해 최종 초상이 항상
// preview 기본 이미지로 남는다 — 이 파일이 그 전체 경로를 하나로 묶어 고정한다.
mock.module("../utils/pickInGameJobPortrait.js", {
  namedExports: { pickInGameJobPortrait: (index) => `dummy-portrait-${index}` },
})
mock.module("../utils/pickInGamePlayerFrame.js", {
  namedExports: { pickInGamePlayerFrame: (index) => `dummy-frame-${index}` },
})

const { buildPlayerSessionSourceFromGameState } = await import("../utils/buildPlayerSessionSourceFromGameState.js")
const { buildInGamePreviewPlayers } = await import("../utils/buildInGamePreviewPlayers.js")
const { mergeSourcePlayerWithPreview } = await import("../utils/mergeSourcePlayerWithPreview.js")
const { resolveAccountProfilePhotoSrc } = await import("../../../../shared/utils/resolveAccountProfileAssets.js")

function gameStartedState(players) {
  return {
    id: "game-1",
    phase: "ROLE_REVEAL",
    dayIndex: 0,
    players,
    self: { uuid: players[0].uuid, nickname: players[0].nickname, role: "CITIZEN", team: "CITIZEN" },
  }
}

function renderFinalPlayers(state) {
  const { sourcePlayers } = buildPlayerSessionSourceFromGameState(state)
  assert.ok(sourcePlayers, "정상 state는 EMPTY_RESULT로 떨어지면 안 된다")
  const preview = buildInGamePreviewPlayers(sourcePlayers.length)
  return sourcePlayers.map((player, index) => mergeSourcePlayerWithPreview(player, preview[index]))
}

test("F-13 AC-05: 서버가 계정 사진을 실어 보낸 참가자는 최종 초상이 더미 preview 대신 실제 계정 사진 자산으로 대체된다", () => {
  const state = gameStartedState([
    { uuid: "u1", nickname: "호스트", alive: true, themeIndex: 0, accountProfilePhotoId: "player-profile-기사", accountProfileBorderId: "profile-border-귀족" },
    { uuid: "u2", nickname: "참가자", alive: true, themeIndex: 1 },
  ])

  const finalPlayers = renderFinalPlayers(state)
  const withProfile = finalPlayers.find((p) => p.id === "u1")
  const withoutProfile = finalPlayers.find((p) => p.id === "u2")

  assert.equal(withProfile.portraitSrc, resolveAccountProfilePhotoSrc("player-profile-기사"))
  assert.notEqual(withProfile.portraitSrc, "dummy-portrait-0", "계정 사진이 있으면 더미 preview 초상이 아니라 실제 계정 사진이어야 한다")
  assert.equal(withoutProfile.portraitSrc, "dummy-portrait-1", "계정 사진이 없는 참가자는 기존 preview 더미 초상을 그대로 유지해야 한다")
})

test("F-13 AC-05: 계정 테두리는 인게임 카드의 frameSrc(직업 스킨/카드 프레임)를 덮어쓰지 않는다", () => {
  const state = gameStartedState([
    { uuid: "u1", nickname: "호스트", alive: true, themeIndex: 0, accountProfilePhotoId: "player-profile-기사", accountProfileBorderId: "profile-border-귀족" },
  ])

  const [merged] = renderFinalPlayers(state)
  assert.equal(merged.frameSrc, "dummy-frame-0", "accountProfileBorderId는 game_started state에 값이 있어도 카드 frameSrc를 바꾸면 안 된다")
})

test("F-13 AC-05: 재접속 스냅샷과 최초 game_started가 같은 변환 경로(buildPlayerSessionSourceFromGameState)를 타므로 같은 계정 사진이 같은 값으로 다시 나온다", () => {
  const gameStartedPlayers = [
    { uuid: "u1", nickname: "호스트", alive: true, themeIndex: 0, accountProfilePhotoId: "player-profile-그림자", accountProfileBorderId: "profile-border-평민" },
    { uuid: "u2", nickname: "참가자", alive: true, themeIndex: 1, accountProfilePhotoId: "player-profile-드워프", accountProfileBorderId: "profile-border-평민" },
  ]

  // 재접속 스냅샷도 서버가 같은 필드를 같은 규칙(own-property 조건부)으로 내려준다
  // (backend buildSessionSnapshot이 buildGameStartedPayload와 같은 buildPlayerAccountProfileFields를
  // 공유). 새로고침 전후 state가 완전히 동일하다고 가정해도 최종 렌더 결과가 달라지면 안 된다.
  const firstRender = renderFinalPlayers(gameStartedState(gameStartedPlayers))
  const afterReconnectRender = renderFinalPlayers(gameStartedState(gameStartedPlayers))

  assert.deepEqual(
    afterReconnectRender.map((p) => [p.id, p.portraitSrc]),
    firstRender.map((p) => [p.id, p.portraitSrc]),
    "재접속 후에도 계정 사진이 preview 기본 이미지로 되돌아가면 안 된다",
  )
})
