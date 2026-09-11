import test, { mock } from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { register } from "node:module"
import { JSDOM } from "jsdom"
import React from "react"

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
mock.module("../utils/pickInGamePlayerFrame.js", {
  namedExports: {
    pickInGamePlayerFrame: (index) => `dummy-frame-${index}`,
    resolveInGamePlayerFrameSrc: (frameSrc, status) => (status === "dead" ? `${frameSrc}-dead-variant` : frameSrc),
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
installDomGlobal("Node", dom.window.Node)
installDomGlobal("Event", dom.window.Event)
installDomGlobal("MutationObserver", dom.window.MutationObserver)
installDomGlobal("requestAnimationFrame", dom.window.requestAnimationFrame.bind(dom.window))
installDomGlobal("cancelAnimationFrame", dom.window.cancelAnimationFrame.bind(dom.window))
globalThis.IS_REACT_ACT_ENVIRONMENT = true
register(new URL("./testSupport/jsxNodeLoaderHooks.mjs", import.meta.url))

const { render, cleanup } = await import("@testing-library/react")
test.afterEach(() => cleanup())

const { buildPlayerSessionSourceFromGameState } = await import("../utils/buildPlayerSessionSourceFromGameState.js")
const { buildInGamePreviewPlayers } = await import("../utils/buildInGamePreviewPlayers.js")
const { mergeSourcePlayerWithPreview } = await import("../utils/mergeSourcePlayerWithPreview.js")
const { resolveAccountProfileBorderSrc, resolveAccountProfilePhotoSrc } =
  await import("../../../../shared/utils/resolveAccountProfileAssets.js")
const { INGAME_PLAYER_STATUS } = await import("../constants/board/status/ingamePlayerStatus.js")
const { default: InGamePlayerBoard } = await import("../components/board/InGamePlayerBoard.jsx")
const { InGamePlayerSessionContext } = await import("../components/InGamePlayerSessionContext.js")
const { default: MatchingPartySlots } = await import("../../matching/components/MatchingPartySlots.jsx")
const { useInGameStore } = await import("../store/ingameStore.js")

// backend/game-core/gameSession.js를 실제 CJS 그대로 가져온다(default export = module.exports).
// __testables.buildSessionCandidate/commitGameSession/buildGameStartedPayload/buildSessionSnapshot는
// 전부 실제 production 함수다 — 리터럴을 두 번 복사해 흉내내지 않고, 진짜 커밋된 세션 하나에
// 대해 서버가 실제로 노출하는 두 개의 독립된 직렬화 진입점(최초 game_started, 재접속
// get_session_snapshot)을 각각 그대로 호출한다.
const { default: gameSessionCore } = await import("../../../../../../backend/game-core/gameSession.js")

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

/** finalPlayers를 실제 InGamePlayerSessionContext.Provider + InGamePlayerBoard로 마운트하고
 * 렌더된 <img> src 목록을 돌려준다(실제 DOM, source 정규식이 아니다). */
function renderBoard(finalPlayers, localPlayerId) {
  const { container } = render(
    React.createElement(
      InGamePlayerSessionContext.Provider,
      { value: { players: finalPlayers, localPlayerId } },
      React.createElement(InGamePlayerBoard),
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
  const { commitGameSession, buildGameStartedPayload, buildSessionSnapshot } = gameSessionCore

  const room = {
    id: "room-account-profile-reconnect",
    players: new Map([
      ["ru1", { uuid: "ru1", nickname: "호스트", isReady: true, accountProfilePhotoId: "player-profile-그림자", accountProfileBorderId: "profile-border-귀족" }],
      ["ru2", { uuid: "ru2", nickname: "참가자", isReady: true, accountProfilePhotoId: "player-profile-드워프", accountProfileBorderId: "profile-border-평민" }],
    ]),
    settings: { jokerCount: 1 },
  }
  const candidate = buildSessionCandidate(room, { randomFn: () => 0 })
  assert.equal(candidate.ok, true, "실제 세션 생성이 성공해야 재접속 시나리오를 구성할 수 있다")
  commitGameSession(candidate.session)
  const viewerUuid = "ru2"

  const startedPayload = buildGameStartedPayload(candidate.session, viewerUuid)
  // 서버가 room.players 쪽 값을 나중에 바꿔도(다른 화면에서 프로필을 다시 저장하는 등) 이미
  // 커밋된 이 판의 스냅샷은 영향받지 않아야 한다(A-04) — 커밋 이후 값을 바꿔 그 불변성을
  // 실제로 확인한다.
  room.players.get("ru1").accountProfilePhotoId = "player-profile-마인"
  const reconnectSnapshot = buildSessionSnapshot(candidate.session, viewerUuid)
  // 실제 소켓 핸들러(handleGetSessionSnapshot)와 동일한 ack 계약으로 감싼다.
  const reconnectAck = { ok: true, ...reconnectSnapshot, players: reconnectSnapshot.players.map((p) => ({ ...p, isConnected: true })) }

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
      React.createElement(InGamePlayerBoard),
    ),
  )
  assert.doesNotMatch(container.textContent, /JOKER/, "role/team 값이 role을 아는 본인 화면이라도 카드 DOM 텍스트로 노출되면 안 된다(카드 자체가 role을 참조하지 않는다)")
  cleanup()
})

// ---------------------------------------------------------------------------
// F-13 AC-05 재검토(CODEX-2) — MatchingPartySlots 실제 DOM 렌더
// ---------------------------------------------------------------------------

test("F-13 AC-05: 대기방(useMatchingPage)은 room.players의 계정 프로필 필드를 slots에서 버리지 않는다(데이터 배선)", async () => {
  const hookSource = await readFile(new URL("../../matching/hooks/useMatchingPage.js", import.meta.url), "utf8")
  assert.match(hookSource, /accountProfilePhotoId:\s*player\.accountProfilePhotoId/)
  assert.match(hookSource, /accountProfileBorderId:\s*player\.accountProfileBorderId/)
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
