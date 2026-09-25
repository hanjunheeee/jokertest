import test, { mock } from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { register } from "node:module"
import { JSDOM } from "jsdom"
import React from "react"

// F-13 AC-05(CODEX-4): 실제 소켓 핸들러(backend/socket/gameSession.js)를 이 파일에서 직접
// require하면, 그 모듈이 끌고 오는 gameResult/voteParticipation repositories·achievementService가
// require 시점에 backend/models(→Sequelize)를 초기화한다 — 이 저장소의 backend 테스트가
// 공유하는 관례(gameResultPersistence.test.js 등)와 동일하게, 실제로 연결을 시도하지는
// 않지만 파싱 가능한 문자열이 있어야 require 자체가 죽지 않는다.
process.env.DATABASE_URL = process.env.DATABASE_URL || "mysql://test:test@localhost:3306/test"

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
// resolveInGamePlayerFrameSrc도 같은 모듈에서 InGamePlayerCard.jsx가 실제로 import한다 —
// mock.module은 모듈 전체를 대체하므로, 이 프로세스에서 InGamePlayerCard.jsx를 실제로
// 마운트하는 아래 DOM 테스트를 위해 이 named export도 함께 채워야 한다(alive/dead 프레임
// 실자산까지 재현할 필요는 없으므로, DEAD만 구분 가능한 결정적 값으로 돌려준다).
// F-14(AC-01/AC-04): resolveAccountCardFrameSrc도 이 모듈에서 mergeSourcePlayerWithPreview.js가
// 실제로 import한다 — 실제 카탈로그 규칙(player-card-{variant})을 그대로 흉내내 계정 카드
// 프레임이 최종 카드까지 반영되는지도 같은 통합 경로로 검증할 수 있게 한다.
mock.module("../utils/pickInGamePlayerFrame.js", {
  namedExports: {
    pickInGamePlayerFrame: (index) => `dummy-frame-${index}`,
    resolveInGamePlayerFrameSrc: (frameSrc, status) => (status === "dead" ? `${frameSrc}-dead-variant` : frameSrc),
    resolveAccountCardFrameSrc: (itemId) =>
      (typeof itemId === "string" && itemId.startsWith("player-card-") ? `dummy-card-frame-${itemId}` : null),
  },
})

// E-3(F-33 AC-03): 보드가 인게임 이모티콘 팔레트 사본을 읽으려고 emojiPalette.store를 import
// 하면서 그 그래프가 HTTP 경계(shared/api/client.js → shared/env.js의 import.meta.env)에 닿는다.
// 이 파일의 관심사는 계정 장착 자산의 배선이므로, 그 바깥 경계 하나만 갈아끼워 조회가
// 결정적으로 실패하게 둔다(store가 거부를 스스로 잡아 gameStatus='error'로 끝낸다).
mock.module("../../../user/api/emojiPalette.api.js", {
  namedExports: {
    getEmojiPaletteApi: async () => { throw new Error("network disabled in test") },
    saveEmojiPaletteApi: async () => { throw new Error("network disabled in test") },
  },
})

// F-13 AC-05(CODEX-4): "대기방 훅(useMatchingPage) 연결"을 raw source 정규식이 아니라 실제
// renderHook으로 검증하기 위해, useMatchingPage.js가 끌고 오는 주변 협력자(react-router의
// useNavigate, useMatchingRoom)만 이 저장소의 기존 관례(useInGameKillReveal.test.js 등)와
// 같은 방식으로 갈아끼운다 — useMatchingStore는 실제 store 그대로 쓴다. useMatchingRoom
// 자체는 소켓·인증 store를 더 깊이 끌고 들어가 이 시험의 관심사(slots 데이터 배선)를 넘으므로
// 최소 shape만 흉내낸다(이 훅 내부 동작은 이 파일의 검증 대상이 아니다).
const navigateCalls = []
mock.module("react-router-dom", {
  namedExports: { useNavigate: () => (...args) => navigateCalls.push(args) },
})
mock.module("../../matching/hooks/useMatchingRoom.js", {
  namedExports: {
    useMatchingRoom: () => ({
      deleteRoom: () => {}, startGame: () => {}, setReady: () => {},
      isStarting: false, isSettingReady: false, isRoomVerified: true,
    }),
  },
})

// F-13 AC-05 재검토(CODEX-2) — InGamePlayerBoard/InGamePlayerCard/MatchingPartySlots는 .jsx라
// 이 저장소의 `node --test` 실행에서는 렌더는커녕 resolve조차 되지 않는다는 이유로(vite alias
// 미해석) 지금까지 raw source 정규식 검증으로 대체해 왔다 — "최종 렌더 검증도 소스 정규식"
// 이라는 지적의 근거다. testSupport/jsxNodeLoaderHooks.mjs가 module.register() ESM 훅으로
// 그 제약을 없애 실제 컴포넌트를 jsdom에 마운트할 수 있게 하므로, 아래 두 항목을 실제 DOM
// 렌더 검증으로 바꾼다: 이 register() 호출은 이후의 모든 .jsx import(이 파일 안이든
// import 그래프 아래쪽이든)에 적용된다.
const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true })
function installDomGlobal(name, value) {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true })
}
installDomGlobal("window", dom.window)
installDomGlobal("document", dom.window.document)
installDomGlobal("navigator", dom.window.navigator)
installDomGlobal("HTMLElement", dom.window.HTMLElement)
// F-14(AC-01/AC-04, R-IMPL P1 수정): 이 파일이 처음으로 framer-motion 기반 컴포넌트
// (InGameRoleRevealOverlay의 AnimatePresence/motion.div)를 렌더한다 — motion-dom의 WAAPI
// 지원 감지 코드가 전역 Element를 직접 참조하므로, 없으면 렌더 뒤 비동기 애니메이션
// 콜백에서 "Element is not defined"로 이 파일의 테스트 프로세스 전체가 죽는다.
installDomGlobal("Element", dom.window.Element)
installDomGlobal("Node", dom.window.Node)
installDomGlobal("Event", dom.window.Event)
installDomGlobal("MutationObserver", dom.window.MutationObserver)
installDomGlobal("requestAnimationFrame", dom.window.requestAnimationFrame.bind(dom.window))
installDomGlobal("cancelAnimationFrame", dom.window.cancelAnimationFrame.bind(dom.window))
globalThis.IS_REACT_ACT_ENVIRONMENT = true
register(new URL("./testSupport/jsxNodeLoaderHooks.mjs", import.meta.url))

const { render, renderHook, cleanup } = await import("@testing-library/react")
test.afterEach(() => cleanup())

const { useMatchingStore } = await import("../../matching/store/matchingStore.js")
const { useAuthStore } = await import("../../../auth/store/auth.store.js")
const { useMatchingPage } = await import("../../matching/hooks/useMatchingPage.js")

const { buildPlayerSessionSourceFromGameState } = await import("../utils/buildPlayerSessionSourceFromGameState.js")
const { buildInGamePreviewPlayers } = await import("../utils/buildInGamePreviewPlayers.js")
const { mergeSourcePlayerWithPreview } = await import("../utils/mergeSourcePlayerWithPreview.js")
const { resolveAccountProfileBorderSrc, resolveAccountProfilePhotoSrc } =
  await import("../../../../shared/utils/resolveAccountProfileAssets.js")
const { INGAME_PLAYER_STATUS, INGAME_PLAYER_STATUS_ASSETS } = await import("../constants/board/status/ingamePlayerStatus.js")
const { default: InGamePlayerBoard } = await import("../components/board/InGamePlayerBoard.jsx")
const { InGamePlayerSessionContext } = await import("../components/InGamePlayerSessionContext.js")
// CM V-1: 보드가 카드 좌클릭 메뉴를 마운트하면서 조작 컨텍스트를 소비한다 — 이 파일의 보드
// 마운트도 **실제** useInGameActionPanel이 만든 값을 흘려보내야 한다(최소·가짜 값을 꾸며 넣으면
// 이 시험이 보는 트리가 더 이상 production 트리가 아니다).
const { InGameActionContext } = await import("../context/InGameActionContext.jsx")
const { useInGameActionPanel } = await import("../hooks/useInGameActionPanel.js")
const { default: MatchingPartySlots } = await import("../../matching/components/MatchingPartySlots.jsx")
const { useInGameStore } = await import("../store/ingameStore.js")
// F-14(AC-01/AC-04, R-IMPL P1 수정): 본인 역할 공개 화면의 구매 스킨 standing 자산 소비 경로
// (self.accountSkinId → getInGameRoleRevealInfo → InGameRoleRevealOverlay 렌더)도 이 파일의
// 다른 소비 경로와 같은 실제 함수·실제 DOM 계약으로 검증한다.
const { getInGameRoleRevealInfo } = await import("../utils/getInGameRoleRevealInfo.js")
const { default: InGameRoleRevealOverlay } = await import("../components/roleReveal/InGameRoleRevealOverlay.jsx")
const { getSkinCardWearItemById, getDefaultSkinIdForJob } =
  await import("../../../user/constants/skinCardWear/skinCardWearCatalog.js")

// backend/game-core/gameSession.js를 실제 CJS 그대로 가져온다(default export = module.exports).
// __testables.buildSessionCandidate/commitGameSession/buildGameStartedPayload/buildSessionSnapshot는
// 전부 실제 production 함수다 — 리터럴을 두 번 복사해 흉내내지 않고, 진짜 커밋된 세션 하나에
// 대해 서버가 실제로 노출하는 두 개의 독립된 직렬화 진입점(최초 game_started, 재접속
// get_session_snapshot)을 각각 그대로 호출한다.
const { default: gameSessionCore } = await import("../../../../../../backend/game-core/gameSession.js")
// F-13 AC-05(CODEX-4) — 재접속 회귀는 이전까지 buildSessionSnapshot의 결과를 { ok: true, ... }
// 로 직접 감싸 "실제 소켓 핸들러(handleGetSessionSnapshot)와 동일한 ack 계약"이라고만
// 주석으로 적었을 뿐, 그 계약을 실제로 실행하지 않았다(isCurrentSocketForUuid 인증, roster의
// isConnected 실시간 계산, ENDED 이후 조회 등은 이 핸들러 안에서만 일어난다). 아래는 그
// 실제 CJS 핸들러와, 이 저장소의 socket 테스트가 공유하는 fake socket/io 하네스를 그대로
// 가져와 진짜 get_session_snapshot 이벤트 처리 경로를 구동한다.
const { default: gameSessionSocketLayer } = await import("../../../../../../backend/socket/gameSession.js")
const { default: matchmakingFixtures } = await import("../../../../../../backend/socket/__tests__/testHelpers/matchmakingFixtures.js")
const { createFakeSocket, createFakeIo, countingCallback } = matchmakingFixtures

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

/**
 * CM V-1: 조작 훅을 실제로 한 번 부르고 그 값을 실제 컨텍스트로 흘려보내는 하니스.
 * 세션 Provider 안쪽에 놓아야 한다 — useInGameActionPanel 자신이 세션 컨텍스트를 읽는다.
 */
function ActionHarness({ children }) {
  const actionPanelValue = useInGameActionPanel()
  return React.createElement(InGameActionContext.Provider, { value: actionPanelValue }, children)
}

/** finalPlayers를 실제 InGamePlayerSessionContext.Provider + InGamePlayerBoard로 마운트하고
 * 렌더된 <img> src 목록을 돌려준다(실제 DOM, source 정규식이 아니다). */
function renderBoard(finalPlayers, localPlayerId) {
  const { container } = render(
    React.createElement(
      InGamePlayerSessionContext.Provider,
      { value: { players: finalPlayers, localPlayerId } },
      React.createElement(ActionHarness, null, React.createElement(InGamePlayerBoard)),
    ),
  )
  // PublicAsset은 publicAsset()으로 src를 encodeURI한다 — resolveAccountProfilePhotoSrc/
  // resolveAccountProfileBorderSrc의 원본(비인코딩) 값과 그대로 비교할 수 있게 디코딩한다.
  const imgSrcs = [...container.querySelectorAll("img")].map((img) => decodeURIComponent(img.getAttribute("src")))
  cleanup()
  return imgSrcs
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

test("F-13 AC-05: 서버가 계정 테두리를 실어 보낸 참가자는 최종 렌더 입력에 accountBorderSrc가 실제 테두리 자산으로 채워진다", () => {
  const state = gameStartedState([
    { uuid: "u1", nickname: "호스트", alive: true, themeIndex: 0, accountProfilePhotoId: "player-profile-기사", accountProfileBorderId: "profile-border-귀족" },
    { uuid: "u2", nickname: "참가자", alive: true, themeIndex: 1 },
  ])

  const finalPlayers = renderFinalPlayers(state)
  const withBorder = finalPlayers.find((p) => p.id === "u1")
  const withoutBorder = finalPlayers.find((p) => p.id === "u2")

  assert.equal(withBorder.accountBorderSrc, resolveAccountProfileBorderSrc("profile-border-귀족"))
  assert.equal(Object.hasOwn(withoutBorder, "accountBorderSrc"), false, "계정 테두리가 없는 참가자는 accountBorderSrc 키 자체가 생기면 안 된다")
})

test("F-14 AC-01/AC-04: 서버가 계정 카드 프레임을 실어 보낸 참가자는 최종 카드의 frameSrc가 더미 preview 대신 실제 장착 카드 프레임으로 대체된다(프로필 사진·테두리와 독립적으로)", () => {
  const state = gameStartedState([
    {
      uuid: "u1", nickname: "호스트", alive: true, themeIndex: 0,
      accountProfilePhotoId: "player-profile-기사", accountProfileBorderId: "profile-border-귀족",
      accountCardFrameId: "player-card-왕관",
    },
    { uuid: "u2", nickname: "참가자", alive: true, themeIndex: 1 },
  ])

  const finalPlayers = renderFinalPlayers(state)
  const withCard = finalPlayers.find((p) => p.id === "u1")
  const withoutCard = finalPlayers.find((p) => p.id === "u2")

  assert.equal(withCard.frameSrc, "dummy-card-frame-player-card-왕관")
  assert.equal(withoutCard.frameSrc, "dummy-frame-1", "계정 카드 프레임이 없는 참가자는 기존 preview 더미 프레임을 그대로 유지해야 한다")
  // 같은 참가자의 portraitSrc/accountBorderSrc가 카드 프레임과 무관하게 독립적으로 해석된다.
  assert.equal(withCard.portraitSrc, resolveAccountProfilePhotoSrc("player-profile-기사"))
  assert.equal(withCard.accountBorderSrc, resolveAccountProfileBorderSrc("profile-border-귀족"))
})

// ---------------------------------------------------------------------------
// F-14(AC-01/AC-04, R-IMPL P1 수정) — 실제 backend 세션의 self.accountSkinId가 실제
// getInGameRoleRevealInfo(view-model)를 거쳐 실제 InGameRoleRevealOverlay DOM에
// 렌더되는지, 그리고 다른 참가자의 직업별 장착 맵이 함께 새어나가지 않는지 확인한다.
// ---------------------------------------------------------------------------

test("F-14 AC-01/AC-04: 실제 backend 세션의 self.accountSkinId가 실제 getInGameRoleRevealInfo와 InGameRoleRevealOverlay를 거쳐 정확히 그 구매 스킨의 standing 자산으로 렌더된다(합성 self 리터럴이 아니라 실제 buildGameStartedPayload 생산 경로)", () => {
  const { buildSessionCandidate } = gameSessionCore.__testables
  const { commitGameSession, buildGameStartedPayload } = gameSessionCore

  // 실제 구매 가능한 카탈로그 id(귀족/광대 각각 하나씩) — jokerCount:1인 2인 방은 두 참가자가
  // 각각 CITIZEN 아니면 JOKER 둘 중 하나로만 배정되므로(roleComposition 2~5명 구간은 특수
  // 시민 역할 예산이 0), 실제로 배정된 역할이 어느 쪽이든 정확히 그 역할의 구매 스킨을
  // 검증할 수 있게 둘 다 채운다.
  const NOBLE_SKIN_ID = "player-skin-귀족1-블러드"
  const CLOWN_SKIN_ID = "player-skin-광대1-불멸"
  const room = {
    id: "room-role-reveal-skin",
    players: new Map([
      ["rs1", {
        uuid: "rs1", nickname: "호스트", isReady: true,
        accountSkinsByJob: { noble: NOBLE_SKIN_ID, clown: CLOWN_SKIN_ID, guard: null, doctor: null, witchHunter: null },
      }],
      ["rs2", { uuid: "rs2", nickname: "참가자", isReady: true }],
    ]),
    settings: { jokerCount: 1 },
  }

  const candidate = buildSessionCandidate(room, { randomFn: () => 0 })
  assert.equal(candidate.ok, true, "실제 세션 생성이 성공해야 시나리오를 구성할 수 있다")
  commitGameSession(candidate.session)

  const startedPayload = buildGameStartedPayload(candidate.session, "rs1")
  const self = startedPayload.state.self
  assert.ok(["CITIZEN", "JOKER"].includes(self.role), "2인·jokerCount:1 방은 CITIZEN 또는 JOKER로만 배정되어야 한다")

  const expectedSkinId = self.role === "JOKER" ? CLOWN_SKIN_ID : NOBLE_SKIN_ID
  assert.equal(self.accountSkinId, expectedSkinId, "실제 배정된 역할에 대응하는 구매 스킨 id 하나만 self에 실려야 한다")
  assert.equal(Object.hasOwn(self, "accountSkinsByJob"), false, "직업별 전체 맵은 self에도 절대 실리면 안 된다(본인이라도 다른 직업 선택은 비공개)")

  // 공용 players[]에는(본인 포함) accountSkinId·accountSkinsByJob 어느 키도 존재하면 안 된다
  // (다른 참가자에게 전달되는 것과 동일한 payload이므로 역할 추론 정보가 섞이면 안 된다).
  for (const player of startedPayload.state.players) {
    assert.equal(Object.hasOwn(player, "accountSkinId"), false, `players[].${player.uuid}에 accountSkinId가 있으면 안 된다`)
    assert.equal(Object.hasOwn(player, "accountSkinsByJob"), false, `players[].${player.uuid}에 accountSkinsByJob이 있으면 안 된다`)
  }

  // 실제 view-model 변환.
  const roleInfo = getInGameRoleRevealInfo(self, { authUuid: "rs1" })
  assert.ok(roleInfo)
  assert.equal(roleInfo.standingSrc, getSkinCardWearItemById(expectedSkinId).standingSrc)
  assert.notEqual(
    roleInfo.standingSrc,
    getSkinCardWearItemById(getDefaultSkinIdForJob(self.role === "JOKER" ? "clown" : "noble")).standingSrc,
    "구매한 스킨이 있으므로 기본 스킨이 아니라 실제 구매한 스킨이 view-model에 실려야 한다",
  )

  // 실제 DOM 렌더 — <img>의 src가 view-model이 계산한 정확한 standing 자산과 같아야 한다.
  const { container } = render(
    React.createElement(InGameRoleRevealOverlay, { open: true, onClose: () => {}, roleInfo, players: [] }),
  )
  const imgSrcs = [...container.querySelectorAll("img")].map((img) => decodeURIComponent(img.getAttribute("src")))
  assert.ok(
    imgSrcs.includes(roleInfo.standingSrc.normalize("NFC")),
    "실제 구매 스킨의 standing 자산이 실제 DOM <img>로 렌더되어야 한다",
  )
  cleanup()
})

test("F-14 AC-01/AC-04: self.accountSkinId가 없는(미장착) 참가자는 그 직업의 기본 스킨이 실제 DOM에 렌더된다(빈 화면 금지)", () => {
  const { buildSessionCandidate } = gameSessionCore.__testables
  const { commitGameSession, buildGameStartedPayload } = gameSessionCore

  const room = {
    id: "room-role-reveal-default-skin",
    players: new Map([
      ["rd1", { uuid: "rd1", nickname: "호스트", isReady: true }], // accountSkinsByJob 자체가 없음
      ["rd2", { uuid: "rd2", nickname: "참가자", isReady: true }],
    ]),
    settings: { jokerCount: 1 },
  }
  const candidate = buildSessionCandidate(room, { randomFn: () => 0 })
  assert.equal(candidate.ok, true)
  commitGameSession(candidate.session)

  const startedPayload = buildGameStartedPayload(candidate.session, "rd1")
  const self = startedPayload.state.self
  assert.equal(Object.hasOwn(self, "accountSkinId"), false, "구매·장착 정보 자체가 없으면 accountSkinId 키가 생기면 안 된다")

  const roleInfo = getInGameRoleRevealInfo(self, { authUuid: "rd1" })
  assert.ok(roleInfo)
  const expectedDefaultJob = self.role === "JOKER" ? "clown" : "noble"
  assert.equal(roleInfo.standingSrc, getSkinCardWearItemById(getDefaultSkinIdForJob(expectedDefaultJob)).standingSrc)

  const { container } = render(
    React.createElement(InGameRoleRevealOverlay, { open: true, onClose: () => {}, roleInfo, players: [] }),
  )
  const imgSrcs = [...container.querySelectorAll("img")].map((img) => decodeURIComponent(img.getAttribute("src")))
  assert.ok(imgSrcs.includes(roleInfo.standingSrc.normalize("NFC")), "미장착이어도 기본 스킨 자산이 실제 DOM에 렌더되어야 한다")
  cleanup()
})

// ---------------------------------------------------------------------------
// F-13 AC-05 재검토(CODEX-2) — 실제 backend 세션 → 실제 ingameStore 액션 → 실제 DOM 렌더
// ---------------------------------------------------------------------------
//
// 이전 버전은 "재접속 스냅샷"을 같은 리터럴 배열을 JSON.parse(JSON.stringify(...))로 두 번
// 복제해 흉내냈다 — 순수 함수의 결정성(같은 입력→같은 출력)만 증명했을 뿐, 서버가 실제로
// 같은 값을 두 번 독립적으로 내려준다는 것도, 프런트가 그 값을 실제로 잃지 않고 store에
// 반영한다는 것도 증명하지 못했다. 아래는 진짜 backend/game-core/gameSession.js로 세션 하나를
// 커밋하고, 그 세션에 대해 buildGameStartedPayload(최초 진입)와 buildSessionSnapshot(재접속)를
// 각각 독립적으로 호출한 뒤, 그 결과를 실제 ingameStore 액션(setGamePayload/applySessionSnapshot
// — 화면이 실제로 부르는 진입점)에 그대로 흘려 최종 DOM까지 렌더한다.
//
// 이 테스트는 이전에 store/applySessionSnapshot.js가 재접속 응답의 accountProfilePhotoId/
// accountProfileBorderId를 nextPlayers 조립에서 빠뜨려(own-property 조건부 복사 누락),
// 재접속·새로고침마다 계정 사진·테두리가 조용히 사라지고 최종 카드가 preview 기본 이미지로
// 되돌아가던 실제 결함을 잡아낸다(고쳐진 코드는 store/applySessionSnapshot.js 참고).
test("F-13 AC-05: 실제 backend 세션에서 독립적으로 만든 game_started/재접속 스냅샷을 실제 ingameStore 액션으로 반영하면, 실제 렌더된 DOM의 계정 사진·테두리가 새로고침 전후로 동일하게 유지되고 preview 기본 이미지로 되돌아가지 않는다", () => {
  const { buildSessionCandidate } = gameSessionCore.__testables
  const { commitGameSession, buildGameStartedPayload } = gameSessionCore

  const room = {
    id: "room-account-profile-reconnect",
    players: new Map([
      ["ru1", { uuid: "ru1", nickname: "호스트", isReady: true, accountProfilePhotoId: "player-profile-그림자", accountProfileBorderId: "profile-border-귀족" }],
      ["ru2", { uuid: "ru2", nickname: "참가자", isReady: true, accountProfilePhotoId: "player-profile-드워프", accountProfileBorderId: "profile-border-평민" }],
    ]),
    settings: { jokerCount: 1 },
  }
  gameSessionSocketLayer.__resetStateForTests()

  const candidate = buildSessionCandidate(room, { randomFn: () => 0 })
  assert.equal(candidate.ok, true, "실제 세션 생성이 성공해야 재접속 시나리오를 구성할 수 있다")
  commitGameSession(candidate.session)
  const viewerUuid = "ru2"

  const startedPayload = buildGameStartedPayload(candidate.session, viewerUuid)
  // 서버가 room.players 쪽 값을 나중에 바꿔도(다른 화면에서 프로필을 다시 저장하는 등) 이미
  // 커밋된 이 판의 스냅샷은 영향받지 않아야 한다(A-04) — 커밋 이후 값을 바꿔 그 불변성을
  // 실제로 확인한다.
  room.players.get("ru1").accountProfilePhotoId = "player-profile-마인"

  // CODEX-4 반송 근거: 이전 버전은 buildSessionSnapshot의 결과를 { ok: true, ... }로 직접
  // 감싸 ack를 손으로 합성했다 — 실제 소켓 핸들러(handleGetSessionSnapshot)는 전혀 호출되지
  // 않아, isCurrentSocketForUuid 인증·roster의 isConnected 실시간 계산 같은 그 핸들러 자신의
  // 로직은 이 시험을 전혀 통과하지 않았다. 아래는 이 저장소의 socket 테스트(gameSession.test.js
  // F-13 AC-05 시험)와 동일한 fake socket/io 하네스로 진짜 이벤트 처리 경로를 구동한다.
  const sockets = ["ru1", "ru2"].map((uuid) => {
    const socket = createFakeSocket(uuid)
    socket.rooms.add(candidate.session.channelId)
    return socket
  })
  const io = createFakeIo(sockets)
  const socketByUuid = new Map(sockets.map((s) => [s.data.user.uuid, s]))
  gameSessionSocketLayer.setOnlineUsersRegistry(new Map(sockets.map((s) => [s.data.user.uuid, s.id])))

  const { callback, getResponse } = countingCallback()
  gameSessionSocketLayer.__testables.handleGetSessionSnapshot(
    io, socketByUuid.get(viewerUuid), viewerUuid, { gameId: candidate.session.id }, callback,
  )
  const reconnectAck = getResponse()
  assert.equal(reconnectAck.ok, true, "실제 핸들러가 인증(isCurrentSocketForUuid)을 통과하고 정상 ack를 돌려줘야 한다")

  useInGameStore.setState({ gameId: null, state: null, error: null, snapshotSeq: 0 })
  // 실제 화면이 game_started를 받을 때 부르는 바로 그 액션이다(useMatchingRoom.js).
  useInGameStore.getState().setGamePayload({ gameId: startedPayload.gameId, state: startedPayload.state })
  const startedState = useInGameStore.getState().state
  assert.equal(startedState.players.find((p) => p.uuid === "ru1").accountProfilePhotoId, "player-profile-그림자", "커밋 시점 값이 그대로 반영되어야 한다(재커밋 이후 room.players 변경과 무관)")

  const firstRender = (() => {
    const finalPlayers = renderFinalPlayers(startedState)
    return renderBoard(finalPlayers, startedState.self.uuid)
  })()

  // resolveAccountProfilePhotoSrc는 NFD로 정규화한 경로를 돌려주지만(맥OS 관례), 실제 렌더된
  // <img>는 PublicAsset이 publicAsset()으로 NFC 정규화한 뒤 encodeURI한 값이다(디코딩은 위
  // renderBoard가 이미 했다) — 같은 파일을 가리키는 두 유니코드 정규화 형태를 NFC로 맞춘 뒤
  // 비교한다.
  const expectedPhotoSrc = resolveAccountProfilePhotoSrc("player-profile-그림자").normalize("NFC")
  assert.ok(firstRender.includes(expectedPhotoSrc), "최초 game_started 렌더에 실제 계정 사진이 실제 DOM img로 나타나야 한다")

  // 실제 화면이 get_session_snapshot ack를 받을 때 부르는 바로 그 액션이다
  // (useInGameSessionSnapshotSync.js).
  useInGameStore.getState().applySessionSnapshot(reconnectAck)
  const afterReconnectState = useInGameStore.getState().state
  const afterReconnectRender = (() => {
    const finalPlayers = renderFinalPlayers(afterReconnectState)
    return renderBoard(finalPlayers, afterReconnectState.self.uuid)
  })()

  assert.deepEqual(
    afterReconnectRender,
    firstRender,
    "재접속 뒤에도 실제 렌더된 DOM(계정 사진·테두리 포함)이 그대로 유지되어야 한다 — preview 기본 이미지로 되돌아가면 안 된다",
  )
  assert.ok(afterReconnectRender.includes(expectedPhotoSrc), "재접속 뒤에도 실제 계정 사진이 DOM에 남아 있어야 한다(수정 전에는 store가 이 필드를 빠뜨려 사라졌다)")
})

// ---------------------------------------------------------------------------
// R-IMPL(2026-09-11) — 실제 Chrome AC-05 회귀: 5인 게임에서 실제 인증된 peer 4명이
// 연결이 끊겼을 때, 사진은 남아 있었지만 연결 끊김 오버레이가 새로고침 후에도 뜨지 않았다.
// 원인은 store/applySessionSnapshot.js가 아니라(그 파일은 이미 isConnected를 boolean
// 그대로 보존한다) InGamePlayerSessionProvider.jsx가 실제로 호출하는
// buildPlayerSessionSourceFromGameState.js가 connected를 항상 true로 하드코딩해
// isConnected 값을 최종 렌더 모델에 아예 옮기지 못했던 것이다. operator가 이미
// buildPlayerSessionSourceFromGameState.js를 고쳤다(uncommitted, 이 테스트가 그 패치를
// 전제로 한다). 아래는 실제 backend 세션 → 실제 buildSessionSnapshot → 실제 소켓 계층과
// 동일한 isConnected 오버레이 계약 → 실제 store.applySessionSnapshot/bootstrapSessionSnapshot
// (새로고침 진입점) → 실제 buildPlayerSessionSourceFromGameState → 실제 DOM 렌더까지 전부
// 실제 함수로 연결해, 연결 끊김·사망 배지가 실제로 나타나고 계정 사진·테두리는 그대로
// 유지되며 role은 노출되지 않는지, 새로고침 후에도 동일한지 확인한다.
test("F-13 AC-05 R-IMPL: 재접속 스냅샷의 isConnected:false/isAlive:false가 실제 DOM에 연결 끊김·사망 오버레이로 반영되고, 계정 사진·테두리는 유지되며, role은 노출되지 않고, 새로고침(bootstrap) 후에도 동일하게 유지된다", () => {
  const { buildSessionCandidate } = gameSessionCore.__testables
  const { commitGameSession, buildSessionSnapshot } = gameSessionCore

  const room = {
    id: "room-disconnect-dead-reload",
    players: new Map([
      ["v1", { uuid: "v1", nickname: "관전자", isReady: true, accountProfilePhotoId: "player-profile-기사", accountProfileBorderId: "profile-border-귀족" }],
      ["v2", { uuid: "v2", nickname: "끊김생존", isReady: true, accountProfilePhotoId: "player-profile-드워프", accountProfileBorderId: "profile-border-평민" }],
      ["v3", { uuid: "v3", nickname: "연결사망", isReady: true, accountProfilePhotoId: "player-profile-그림자", accountProfileBorderId: "profile-border-귀족" }],
      ["v4", { uuid: "v4", nickname: "끊김사망", isReady: true, accountProfilePhotoId: "player-profile-마인", accountProfileBorderId: "profile-border-평민" }],
    ]),
    settings: { jokerCount: 1 },
  }
  const candidate = buildSessionCandidate(room, { randomFn: () => 0 })
  assert.equal(candidate.ok, true, "실제 세션 생성이 성공해야 시나리오를 구성할 수 있다")
  commitGameSession(candidate.session)
  const viewerUuid = "v1"
  const { buildGameStartedPayload } = gameSessionCore

  const renderOnce = () => {
    const finalPlayers = renderFinalPlayers(useInGameStore.getState().state)
    return renderBoard(finalPlayers, viewerUuid)
  }

  // applySessionSnapshot(재접속 액션)은 "이미 진행 중인 게임"을 전제로 roster를 기존 store와
  // 대조한다 — 실제 화면도 game_started로 먼저 진입한 뒤에만 그 액션을 받으므로, 여기서도
  // 먼저 실제 game_started 경로(setGamePayload)로 store를 채운다.
  const startedPayload = buildGameStartedPayload(candidate.session, viewerUuid)
  useInGameStore.setState({ gameId: null, state: null, error: null, snapshotSeq: 0 })
  useInGameStore.getState().setGamePayload({ gameId: startedPayload.gameId, state: startedPayload.state })

  // 실제 사망 처리와 같은 지점(victim.alive = false, gameSession.js의 killPlayer/tribunal 경로)을
  // 직접 흉내낸다 — session.players는 Map이므로 항목을 직접 갱신하는 것이 canonical 경로다.
  candidate.session.players.get("v3").alive = false
  candidate.session.players.get("v4").alive = false

  const snapshot = buildSessionSnapshot(candidate.session, viewerUuid)
  // 실제 소켓 계층(handleGetSessionSnapshot, backend/socket/gameSession.js:2294-2297)과 동일한
  // 계약으로 isConnected를 덧붙인다 — v2/v4가 실제 Chrome 회귀의 "4명 끊김"과 같은 모양의
  // 혼합 상태(끊겼지만 생존 / 끊겼고 사망)를 대표한다.
  const reconnectAck = {
    ok: true,
    ...snapshot,
    players: snapshot.players.map((p) => ({
      ...p,
      isConnected: p.uuid === "v2" || p.uuid === "v4" ? false : true,
    })),
  }

  // 게임이 이미 진행 중인 상태에서 도착하는 실제 재접속 ack 경로(핸드셰이크 사이에 끊겼다
  // 다시 붙는 것) — useInGameSessionSnapshotSync.js가 실제로 부르는 바로 그 액션이다.
  useInGameStore.getState().applySessionSnapshot(reconnectAck)
  const firstRender = renderOnce()

  const disconnectedBadge = INGAME_PLAYER_STATUS_ASSETS.disconnected.normalize("NFC")
  const deadBadge = INGAME_PLAYER_STATUS_ASSETS.dead.normalize("NFC")
  const v2PhotoSrc = resolveAccountProfilePhotoSrc("player-profile-드워프").normalize("NFC")
  const v3PhotoSrc = resolveAccountProfilePhotoSrc("player-profile-그림자").normalize("NFC")
  const v4PhotoSrc = resolveAccountProfilePhotoSrc("player-profile-마인").normalize("NFC")
  const v3BorderSrc = resolveAccountProfileBorderSrc("profile-border-귀족").normalize("NFC")

  // 수정 전에는 connected가 항상 true였으므로 status가 DISCONNECTED로 절대 떨어지지 않아
  // 아래 두 단언이 실패했다(실제 Chrome 회귀 재현).
  assert.equal(
    firstRender.filter((src) => src === disconnectedBadge).length,
    2,
    "끊긴 두 참가자(v2, v4)마다 연결 끊김 배지가 실제 DOM에 렌더되어야 한다",
  )
  // mergeSourcePlayerWithPreview는 !connected를 alive보다 먼저 판정하므로, 끊기고 사망한 v4는
  // 사망 배지가 아니라 연결 끊김 배지로 나타난다 — 연결이 유지된 채 사망만 한 v3만 사망 배지다.
  assert.equal(
    firstRender.filter((src) => src === deadBadge).length,
    1,
    "연결이 유지된 채 사망만 한 v3만 사망 배지가 렌더되어야 한다",
  )

  assert.ok(firstRender.includes(v2PhotoSrc), "연결이 끊겨도 계정 사진은 그대로 유지되어야 한다(리포트: 사진은 남아 있었다)")
  assert.ok(firstRender.includes(v3PhotoSrc), "사망해도 계정 사진은 유지되어야 한다")
  assert.ok(firstRender.includes(v4PhotoSrc), "끊기고 사망해도 계정 사진은 유지되어야 한다")
  assert.ok(firstRender.includes(v3BorderSrc), "사망한 참가자도 계정 테두리가 유지되어야 한다(상태 오버레이와 별개 레이어)")

  // role 비밀성 — 연결 끊김·사망 오버레이가 추가되어도 role 값이 DOM 텍스트로 노출되면 안 된다.
  const selfRole = useInGameStore.getState().state.self.role
  const { container: roleCheckContainer } = render(
    React.createElement(
      InGamePlayerSessionContext.Provider,
      { value: { players: renderFinalPlayers(useInGameStore.getState().state), localPlayerId: viewerUuid } },
      React.createElement(InGamePlayerBoard),
    ),
  )
  assert.doesNotMatch(
    roleCheckContainer.textContent,
    new RegExp(selfRole),
    "연결 끊김·사망 오버레이가 추가되어도 role 값이 DOM 텍스트로 노출되면 안 된다",
  )
  cleanup()

  // 새로고침 재현 — 메모리 store를 완전히 비운 뒤, 실제 화면이 새로고침에서 부르는 바로 그
  // 진입점(bootstrapSessionSnapshot)으로만 복원한다(applySessionSnapshot 재호출이 아니다).
  useInGameStore.setState({ gameId: null, state: null, error: null, snapshotSeq: 0 })
  useInGameStore.getState().bootstrapSessionSnapshot(reconnectAck)
  const afterReloadRender = renderOnce()

  assert.deepEqual(
    afterReloadRender,
    firstRender,
    "새로고침(빈 store에서 bootstrapSessionSnapshot) 후에도 연결 끊김·사망 배지와 계정 사진·테두리가 그대로 유지되어야 한다 — 리포트의 'photos retained but disconnected overlays absent even after reload' 실패를 재현/차단한다",
  )
})

// ---------------------------------------------------------------------------
// F-13 AC-05 재검토(CODEX-2) — InGamePlayerBoard/InGamePlayerCard 실제 DOM 렌더
// ---------------------------------------------------------------------------

test("F-13 AC-05: InGamePlayerBoard는 accountBorderSrc를 InGamePlayerCard에 그대로 넘기고, 실제 DOM에서도 계정 테두리는 직업 프레임과 분리된 별도 레이어로 그려지며 alive/dead/disconnected 상태에서도 유지된다", () => {
  const finalPlayers = [
    { id: "p1", nickname: "호스트", status: INGAME_PLAYER_STATUS.ALIVE, portraitSrc: "/p1-portrait.png", frameSrc: "/frame.png", accountBorderSrc: "/p1-border.png", theme: {} },
    { id: "p2", nickname: "사망자", status: INGAME_PLAYER_STATUS.DEAD, portraitSrc: "/p2-portrait.png", frameSrc: "/frame.png", accountBorderSrc: "/p2-border.png", theme: {} },
    { id: "p3", nickname: "끊김", status: INGAME_PLAYER_STATUS.DISCONNECTED, portraitSrc: "/p3-portrait.png", frameSrc: "/frame.png", theme: {} },
  ]

  const imgSrcs = renderBoard(finalPlayers, "p1")

  assert.ok(imgSrcs.includes("/p1-portrait.png") && imgSrcs.includes("/p2-portrait.png") && imgSrcs.includes("/p3-portrait.png"), "세 참가자 모두 서로 다른 실제 초상이 렌더되어야 한다")
  assert.ok(imgSrcs.includes("/p1-border.png"), "생존자의 계정 테두리가 실제 DOM에 렌더되어야 한다")
  assert.ok(imgSrcs.includes("/p2-border.png"), "사망자도 계정 테두리가 유지되어야 한다(상태 오버레이와 별개 레이어)")
  assert.ok(!imgSrcs.includes("/p3-border.png"), "계정 테두리가 없는 참가자는 없는 그대로여야 한다(생성되지 않음)")
  // frameSrc(직업 스킨/카드 프레임)는 세 참가자 모두 같은 자산을 공유하지만 accountBorderSrc와는
  // 별개 <img>로 렌더되어야 한다 — dead 상태는 resolveInGamePlayerFrameSrc가 alive와 다른
  // 값으로 바꾸므로("/frame.png" 접두사는 공유) 접두사 기준으로 세 참가자 모두의 프레임
  // 레이어가 여전히 개별적으로(계정 테두리와 별개로) 남아 있는지 확인한다.
  const frameImgCount = imgSrcs.filter((src) => src.startsWith("/frame.png")).length
  assert.equal(frameImgCount, finalPlayers.length * 2, "직업 프레임은(그림자 레이어 + 본체 레이어) 계정 테두리 렌더와 무관하게 참가자마다 그대로 유지되어야 한다")
})

test("F-13 AC-05: InGamePlayerCard는 role을 props로 받지도 렌더하지도 않는다(비밀 유지) — 실제 DOM 텍스트에 role 값이 노출되지 않는다", () => {
  const finalPlayers = [
    { id: "p1", nickname: "호스트", status: INGAME_PLAYER_STATUS.ALIVE, portraitSrc: "/p1-portrait.png", frameSrc: "/frame.png", accountBorderSrc: "/p1-border.png", theme: {}, role: "JOKER", team: "JOKER" },
  ]
  const { container } = render(
    React.createElement(
      InGamePlayerSessionContext.Provider,
      { value: { players: finalPlayers, localPlayerId: "p1" } },
      React.createElement(ActionHarness, null, React.createElement(InGamePlayerBoard)),
    ),
  )
  assert.doesNotMatch(container.textContent, /JOKER/, "role/team 값이 role을 아는 본인 화면이라도 카드 DOM 텍스트로 노출되면 안 된다(카드 자체가 role을 참조하지 않는다)")
  cleanup()
})

// ---------------------------------------------------------------------------
// F-13 AC-05 재검토(CODEX-2) — MatchingPartySlots 실제 DOM 렌더
// ---------------------------------------------------------------------------

test("F-13 AC-05(CODEX-4): 대기방(useMatchingPage)은 실제로 마운트됐을 때 room.players의 계정 프로필 필드를 slots에서 버리지 않는다 — source 정규식이 아니라 실제 훅 실행으로 검증한다", () => {
  useAuthStore.setState({ user: { uuid: "viewer-uuid" }, isLoggedIn: true, loggedOutIntentionally: false })
  useMatchingStore.setState({
    isSearching: false,
    isInRoom: true,
    roomId: "room-1",
    roomCode: "ABC123",
    hostUuid: "viewer-uuid",
    canStart: true,
    players: [
      { uuid: "viewer-uuid", isReady: true, accountProfilePhotoId: "player-profile-기사", accountProfileBorderId: "profile-border-귀족" },
      { uuid: "peer-uuid", isReady: false, accountProfilePhotoId: "player-profile-드워프", accountProfileBorderId: "profile-border-평민" },
      { uuid: "no-profile-uuid", isReady: false }, // 계정 프로필 필드가 아예 없는 참가자(레거시/미도착)
    ],
  })

  const { result, unmount } = renderHook(() => useMatchingPage())
  try {
    assert.equal(result.current.slots.length, 3)
    const [viewerSlot, peerSlot, bareSlot] = result.current.slots
    assert.equal(viewerSlot.accountProfilePhotoId, "player-profile-기사", "실제 훅 실행 결과에서 본인 계정 사진이 slots로 빠져야 한다")
    assert.equal(viewerSlot.accountProfileBorderId, "profile-border-귀족")
    assert.equal(peerSlot.accountProfilePhotoId, "player-profile-드워프", "다른 참가자의 계정 사진도 각자 다른 값으로 slots에 실려야 한다")
    assert.equal(peerSlot.accountProfileBorderId, "profile-border-평민")
    assert.equal(bareSlot.accountProfilePhotoId, undefined, "필드가 없는 참가자는 undefined로 그대로 전달되어야 한다(MatchingPartySlots가 기본 자산으로 대체)")
  } finally {
    unmount()
    useMatchingStore.getState().clearRoom()
    useAuthStore.setState({ user: null, isLoggedIn: false, loggedOutIntentionally: false })
  }
})

test("F-13 AC-05: MatchingPartySlots는 실제 DOM에서 슬롯마다 서로 다른 계정 초상·테두리를 그리고, 계정 프로필이 없는 더미 슬롯은 기존 기본 자산으로 대체하며, 준비 배지는 그대로 유지한다", () => {
  const slots = [
    { id: "s1", ready: true, accountProfilePhotoId: "player-profile-기사", accountProfileBorderId: "profile-border-귀족" },
    { id: "s2", ready: false, accountProfilePhotoId: "player-profile-드워프", accountProfileBorderId: "profile-border-평민" },
    { id: "s3", ready: false }, // 아직 아무도 들어오지 않은 더미 슬롯
  ]

  const { container } = render(React.createElement(MatchingPartySlots, { slots }))
  const imgSrcs = [...container.querySelectorAll("img")].map((img) => decodeURIComponent(img.getAttribute("src")))

  assert.ok(imgSrcs.some((src) => src.includes("기사")), "s1 슬롯은 실제 계정 사진(기사)을 그려야 한다")
  assert.ok(imgSrcs.some((src) => src.includes("드워프")), "s2 슬롯은 s1과 다른 실제 계정 사진(드워프)을 그려야 한다")
  assert.notEqual(
    [...container.querySelectorAll("img")].map((img) => img.getAttribute("src"))[0],
    [...container.querySelectorAll("img")].map((img) => img.getAttribute("src"))[2],
    "슬롯마다 독립적으로 해석해야 서로 다른 계정 이미지가 나온다",
  )

  const badgeTexts = container.textContent
  assert.ok(badgeTexts.includes("준비"), "준비 여부 배지는 계정 초상 도입과 무관하게 그대로 유지되어야 한다")
  cleanup()
})
