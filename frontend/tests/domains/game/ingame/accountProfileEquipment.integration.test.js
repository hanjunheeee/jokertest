import test, { mock } from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { register } from "node:module"
import { JSDOM } from "jsdom"
import React from "react"

process.env.DATABASE_URL = process.env.DATABASE_URL || "mysql://test:test@localhost:3306/test"

mock.module("../../../../src/domains/game/ingame/utils/pickInGameJobPortrait.js", {
  namedExports: { pickInGameJobPortrait: (index) => `dummy-portrait-${index}` },
})
mock.module("../../../../src/domains/game/ingame/utils/pickInGamePlayerFrame.js", {
  namedExports: {
    pickInGamePlayerFrame: (index) => `dummy-frame-${index}`,
    resolveInGamePlayerFrameSrc: (frameSrc, status) => (status === "dead" ? `${frameSrc}-dead-variant` : frameSrc),
    resolveAccountCardFrameSrc: (itemId) =>
      (typeof itemId === "string" && itemId.startsWith("player-card-") ? `dummy-card-frame-${itemId}` : null),
  },
})

mock.module("../../../../src/domains/user/api/emojiPalette.api.js", {
  namedExports: {
    getEmojiPaletteApi: async () => { throw new Error("network disabled in test") },
    saveEmojiPaletteApi: async () => { throw new Error("network disabled in test") },
  },
})

const navigateCalls = []
mock.module("react-router-dom", {
  namedExports: { useNavigate: () => (...args) => navigateCalls.push(args) },
})
mock.module("../../../../src/domains/game/matching/hooks/useMatchingRoom.js", {
  namedExports: {
    useMatchingRoom: () => ({
      deleteRoom: () => {}, startGame: () => {}, setReady: () => {},
      isStarting: false, isSettingReady: false, isRoomVerified: true,
    }),
  },
})

const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true })
function installDomGlobal(name, value) {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true })
}
installDomGlobal("window", dom.window)
installDomGlobal("document", dom.window.document)
installDomGlobal("navigator", dom.window.navigator)
installDomGlobal("HTMLElement", dom.window.HTMLElement)
installDomGlobal("Element", dom.window.Element)
installDomGlobal("Node", dom.window.Node)
installDomGlobal("Event", dom.window.Event)
installDomGlobal("MutationObserver", dom.window.MutationObserver)
installDomGlobal("requestAnimationFrame", dom.window.requestAnimationFrame.bind(dom.window))
installDomGlobal("cancelAnimationFrame", dom.window.cancelAnimationFrame.bind(dom.window))
globalThis.IS_REACT_ACT_ENVIRONMENT = true
register(new URL("../../../helpers/jsxNodeLoaderHooks.mjs", import.meta.url))

const { render, renderHook, cleanup } = await import("@testing-library/react")
test.afterEach(() => cleanup())

const { useMatchingStore } = await import("../../../../src/domains/game/matching/store/matchingStore.js")
const { useAuthStore } = await import("../../../../src/domains/auth/store/auth.store.js")
const { useMatchingPage } = await import("../../../../src/domains/game/matching/hooks/useMatchingPage.js")

const { buildPlayerSessionSourceFromGameState } = await import("../../../../src/domains/game/ingame/utils/buildPlayerSessionSourceFromGameState.js")
const { buildInGamePreviewPlayers } = await import("../../../../src/domains/game/ingame/utils/buildInGamePreviewPlayers.js")
const { mergeSourcePlayerWithPreview } = await import("../../../../src/domains/game/ingame/utils/mergeSourcePlayerWithPreview.js")
const { resolveAccountProfileBorderSrc } =
  await import("../../../../src/shared/utils/resolveAccountProfileAssets.js")
const { resolveInGameAccountProfilePhotoSrc } =
  await import("../../../../src/domains/game/ingame/utils/resolveInGameAccountProfilePhotoSrc.js")
const { INGAME_PLAYER_STATUS, INGAME_PLAYER_STATUS_ASSETS } = await import("../../../../src/domains/game/ingame/constants/board/status/ingamePlayerStatus.js")
const { default: InGamePlayerBoard } = await import("../../../../src/domains/game/ingame/components/board/InGamePlayerBoard.jsx")
const { InGamePlayerSessionContext } = await import("../../../../src/domains/game/ingame/components/InGamePlayerSessionContext.js")
const { InGameActionContext } = await import("../../../../src/domains/game/ingame/context/InGameActionContext.jsx")
const { useInGameActionPanel } = await import("../../../../src/domains/game/ingame/hooks/useInGameActionPanel.js")
const { default: MatchingPartySlots } = await import("../../../../src/domains/game/matching/components/MatchingPartySlots.jsx")
const { useInGameStore } = await import("../../../../src/domains/game/ingame/store/ingameStore.js")
const { getInGameRoleRevealInfo } = await import("../../../../src/domains/game/ingame/utils/getInGameRoleRevealInfo.js")
const { getSkinCardWearItemById, getDefaultSkinIdForJob } =
  await import("../../../../src/domains/user/constants/skinCardWear/skinCardWearCatalog.js")

const { default: gameSessionCore } = await import("../../../../../backend/game-core/gameSession.js")
const { default: gameSessionSocketLayer } = await import("../../../../../backend/socket/gameSession.js")
const { default: matchmakingFixtures } = await import("../../../../../backend/tests/helpers/matchmakingFixtures.js")
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

function ActionHarness({ children }) {
  const actionPanelValue = useInGameActionPanel()
  return React.createElement(InGameActionContext.Provider, { value: actionPanelValue }, children)
}

function renderBoard(finalPlayers, localPlayerId) {
  const { container } = render(
    React.createElement(
      InGamePlayerSessionContext.Provider,
      { value: { players: finalPlayers, localPlayerId } },
      React.createElement(ActionHarness, null, React.createElement(InGamePlayerBoard)),
    ),
  )
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

  assert.equal(withProfile.portraitSrc, resolveInGameAccountProfilePhotoSrc("player-profile-기사"))
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

test("F-13 AC-05: 서버가 계정 테두리를 실어 보내도 인게임 카드에는 accountBorderSrc를 만들지 않는다(원형 프레임 미표시)", () => {
  const state = gameStartedState([
    { uuid: "u1", nickname: "호스트", alive: true, themeIndex: 0, accountProfilePhotoId: "player-profile-기사", accountProfileBorderId: "profile-border-귀족" },
    { uuid: "u2", nickname: "참가자", alive: true, themeIndex: 1 },
  ])

  const finalPlayers = renderFinalPlayers(state)
  const withBorder = finalPlayers.find((p) => p.id === "u1")
  const withoutBorder = finalPlayers.find((p) => p.id === "u2")

  assert.equal(withBorder.accountProfileBorderId, "profile-border-귀족")
  assert.equal(Object.hasOwn(withBorder, "accountBorderSrc"), false)
  assert.equal(Object.hasOwn(withoutBorder, "accountBorderSrc"), false)
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
  assert.equal(withCard.portraitSrc, resolveInGameAccountProfilePhotoSrc("player-profile-기사"))
  assert.equal(Object.hasOwn(withCard, "accountBorderSrc"), false)
})

test("F-14 AC-01/AC-04: 실제 backend 세션의 self.accountSkinId가 getInGameRoleRevealInfo view-model에 정확히 그 구매 스킨의 standing 자산으로 실린다(합성 self 리터럴이 아니라 실제 buildGameStartedPayload 생산 경로)", () => {
  const { buildSessionCandidate } = gameSessionCore.__testables
  const { commitGameSession, buildGameStartedPayload } = gameSessionCore

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

  for (const player of startedPayload.state.players) {
    assert.equal(Object.hasOwn(player, "accountSkinId"), false, `players[].${player.uuid}에 accountSkinId가 있으면 안 된다`)
    assert.equal(Object.hasOwn(player, "accountSkinsByJob"), false, `players[].${player.uuid}에 accountSkinsByJob이 있으면 안 된다`)
  }

  const roleInfo = getInGameRoleRevealInfo(self, { authUuid: "rs1" })
  assert.ok(roleInfo)
  assert.equal(roleInfo.standingSrc, getSkinCardWearItemById(expectedSkinId).standingSrc)
  assert.notEqual(
    roleInfo.standingSrc,
    getSkinCardWearItemById(getDefaultSkinIdForJob(self.role === "JOKER" ? "clown" : "noble")).standingSrc,
    "구매한 스킨이 있으므로 기본 스킨이 아니라 실제 구매한 스킨이 view-model에 실려야 한다",
  )

})

test("F-14 AC-01/AC-04: self.accountSkinId가 없는(미장착) 참가자는 getInGameRoleRevealInfo view-model에 그 직업의 기본 스킨 standing 자산이 실린다", () => {
  const { buildSessionCandidate } = gameSessionCore.__testables
  const { commitGameSession, buildGameStartedPayload } = gameSessionCore

  const room = {
    id: "room-role-reveal-default-skin",
    players: new Map([
      ["rd1", { uuid: "rd1", nickname: "호스트", isReady: true }],
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

})

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
  room.players.get("ru1").accountProfilePhotoId = "player-profile-마인"

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
  useInGameStore.getState().setGamePayload({ gameId: startedPayload.gameId, state: startedPayload.state })
  const startedState = useInGameStore.getState().state
  assert.equal(startedState.players.find((p) => p.uuid === "ru1").accountProfilePhotoId, "player-profile-그림자", "커밋 시점 값이 그대로 반영되어야 한다(재커밋 이후 room.players 변경과 무관)")

  const firstRender = (() => {
    const finalPlayers = renderFinalPlayers(startedState)
    return renderBoard(finalPlayers, startedState.self.uuid)
  })()

  const expectedPhotoSrc = resolveInGameAccountProfilePhotoSrc("player-profile-그림자").normalize("NFC")
  assert.ok(firstRender.includes(expectedPhotoSrc), "최초 game_started 렌더에 실제 계정 사진이 실제 DOM img로 나타나야 한다")

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

  const startedPayload = buildGameStartedPayload(candidate.session, viewerUuid)
  useInGameStore.setState({ gameId: null, state: null, error: null, snapshotSeq: 0 })
  useInGameStore.getState().setGamePayload({ gameId: startedPayload.gameId, state: startedPayload.state })

  candidate.session.players.get("v3").alive = false
  candidate.session.players.get("v4").alive = false

  const snapshot = buildSessionSnapshot(candidate.session, viewerUuid)
  const reconnectAck = {
    ok: true,
    ...snapshot,
    players: snapshot.players.map((p) => ({
      ...p,
      isConnected: p.uuid === "v2" || p.uuid === "v4" ? false : true,
    })),
  }

  useInGameStore.getState().applySessionSnapshot(reconnectAck)
  const firstRender = renderOnce()

  const disconnectedBadge = INGAME_PLAYER_STATUS_ASSETS.disconnected.normalize("NFC")
  const deadBadge = INGAME_PLAYER_STATUS_ASSETS.dead.normalize("NFC")
  const v2PhotoSrc = resolveInGameAccountProfilePhotoSrc("player-profile-드워프").normalize("NFC")
  const v3PhotoSrc = resolveInGameAccountProfilePhotoSrc("player-profile-그림자").normalize("NFC")
  const v4PhotoSrc = resolveInGameAccountProfilePhotoSrc("player-profile-마인").normalize("NFC")
  const v3BorderSrc = resolveAccountProfileBorderSrc("profile-border-귀족").normalize("NFC")

  assert.equal(
    firstRender.filter((src) => src === disconnectedBadge).length,
    2,
    "끊긴 두 참가자(v2, v4)마다 연결 끊김 배지가 실제 DOM에 렌더되어야 한다",
  )
  assert.equal(
    firstRender.filter((src) => src === deadBadge).length,
    1,
    "연결이 유지된 채 사망만 한 v3만 사망 배지가 렌더되어야 한다",
  )

  assert.ok(firstRender.includes(v2PhotoSrc), "연결이 끊겨도 계정 사진은 그대로 유지되어야 한다(리포트: 사진은 남아 있었다)")
  assert.ok(firstRender.includes(v3PhotoSrc), "사망해도 계정 사진은 유지되어야 한다")
  assert.ok(firstRender.includes(v4PhotoSrc), "끊기고 사망해도 계정 사진은 유지되어야 한다")
  assert.ok(!firstRender.includes(v3BorderSrc), "인게임 카드에는 원형 계정 테두리를 렌더하지 않아야 한다")

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

  useInGameStore.setState({ gameId: null, state: null, error: null, snapshotSeq: 0 })
  useInGameStore.getState().bootstrapSessionSnapshot(reconnectAck)
  const afterReloadRender = renderOnce()

  assert.deepEqual(
    afterReloadRender,
    firstRender,
    "새로고침(빈 store에서 bootstrapSessionSnapshot) 후에도 연결 끊김·사망 배지와 계정 사진이 그대로 유지되어야 한다 — 리포트의 'photos retained but disconnected overlays absent even after reload' 실패를 재현/차단한다",
  )
})

test("F-13 AC-05: InGamePlayerBoard는 alive/dead/disconnected 상태에서 ingame 사각형 초상만 렌더하고 원형 계정 테두리는 그리지 않는다", () => {
  const finalPlayers = [
    { id: "p1", nickname: "호스트", status: INGAME_PLAYER_STATUS.ALIVE, portraitSrc: "/p1-portrait.png", frameSrc: "/frame.png", theme: {} },
    { id: "p2", nickname: "사망자", status: INGAME_PLAYER_STATUS.DEAD, portraitSrc: "/p2-portrait.png", frameSrc: "/frame.png", theme: {} },
    { id: "p3", nickname: "끊김", status: INGAME_PLAYER_STATUS.DISCONNECTED, portraitSrc: "/p3-portrait.png", frameSrc: "/frame.png", theme: {} },
  ]

  const imgSrcs = renderBoard(finalPlayers, "p1")

  assert.ok(imgSrcs.includes("/p1-portrait.png") && imgSrcs.includes("/p2-portrait.png") && imgSrcs.includes("/p3-portrait.png"), "세 참가자 모두 서로 다른 실제 초상이 렌더되어야 한다")
  assert.ok(!imgSrcs.includes("/p1-border.png") && !imgSrcs.includes("/p2-border.png"), "원형 계정 테두리 자산은 DOM에 나타나면 안 된다")
  const frameImgCount = imgSrcs.filter((src) => src.startsWith("/frame.png")).length
  assert.equal(frameImgCount, finalPlayers.length * 2, "직업 프레임은(그림자 레이어 + 본체 레이어) 참가자마다 그대로 유지되어야 한다")
})

test("F-13 AC-05: InGamePlayerCard는 role을 props로 받지도 렌더하지도 않는다(비밀 유지) — 실제 DOM 텍스트에 role 값이 노출되지 않는다", () => {
  const finalPlayers = [
    { id: "p1", nickname: "호스트", status: INGAME_PLAYER_STATUS.ALIVE, portraitSrc: "/p1-portrait.png", frameSrc: "/frame.png", theme: {}, role: "JOKER", team: "JOKER" },
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
      { uuid: "no-profile-uuid", isReady: false },
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

test("F-13 AC-05: MatchingPartySlots는 준비 여부에 따라 매칭 실루엣만 그리고 준비/대기 배지는 표시하지 않는다", () => {
  const slots = [
    { id: "s1", ready: true, accountProfilePhotoId: "player-profile-기사", accountProfileBorderId: "profile-border-귀족" },
    { id: "s2", ready: false, accountProfilePhotoId: "player-profile-드워프", accountProfileBorderId: "profile-border-평민" },
    { id: "s3", ready: false },
  ]

  const { container } = render(React.createElement(MatchingPartySlots, { slots }))
  const imgSrcs = [...container.querySelectorAll("img")].map((img) => decodeURIComponent(img.getAttribute("src")))

  assert.equal(imgSrcs.filter((src) => src.includes("매칭 준비 실루엣")).length, 1)
  assert.equal(imgSrcs.filter((src) => src.includes("매칭 미준비 실루엣")).length, 2)
  assert.equal(imgSrcs.some((src) => src.includes("기사") || src.includes("드워프")), false,
    "슬롯은 계정 프로필 이미지 대신 실루엣만 그려야 한다")

  const text = container.textContent
  assert.equal(text.includes("준비완료"), false)
  assert.equal(text.includes("대기중"), false)
  cleanup()
})
