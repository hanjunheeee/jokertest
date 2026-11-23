// 대기방 화면 훅: 방·강퇴·친구 초대·설정 편집 훅을 묶어 화면 값으로 돌려줌
// GameMatchingPage가 씀, 판 끝나고 돌아온 경우(파티 방 기다림)도 여기서 가름
import { useCallback, useEffect, useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { MATCHING_POPUP_COPY } from "../constants/gameMatchingAssets.js"
import { useMatchingRoom } from "./useMatchingRoom"
import { useMatchingRoomKick } from "./useMatchingRoomKick.js"
import { useMatchingFriendInvite } from "./useMatchingFriendInvite.js"
import { useSettingsEdit } from "./useSettingsEdit.js"
import { useMatchingStore } from "../store/matchingStore"
import { useInGameStore } from "@/domains/game/ingame/store/ingameStore.js"
import { useAuthStore } from "@/domains/auth/store/auth.store"
import { clearRejoinGameId, readRejoinGameId } from "../../shared/utils/partyMatchingRejoin.js"
import { buildSlots } from "../utils/chunkPlayerSlots.js"
import { leaveRoom } from "../socket/room.js"
import { traceMatchingFlow } from "../debug/matchingFlowTrace.js"
import { navigateToInGameFromMatching } from "../utils/navigateToInGame.js"
import { shouldLeaveMatchingForInGame } from "../utils/shouldLeaveMatchingForInGame.js"
import { matchingRoomExitMessage, shouldForceMatchingLobbyExit } from "../utils/matchingRoomExit.js"
import { canStayOnMatchingPage as resolveCanStayOnMatchingPage } from "../utils/canStayOnMatchingPage.js"

// 대기방 화면 값·동작 묶음
export function useMatchingPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const myUuid = useAuthStore((s) => s.user?.uuid)

  // 결과 화면에서 왔거나 새로고침 전에 기다리던 판이 있으면 파티 방 기다림
  const storedGameId = readRejoinGameId(myUuid)
  const awaitRequested =
    location.state?.awaitRoomAfterGameResult === true || Boolean(storedGameId)
  // 파티 방에 들어가 확인까지 끝나면 기다림 끝 (그 뒤 방이 지워지면 목록으로 가게, known 1-5)
  const [partyJoined, setPartyJoined] = useState(false)
  const awaiting = awaitRequested && !partyJoined
  const endedGameId = typeof location.state?.endedGameId === "string"
    ? location.state.endedGameId
    : storedGameId

  const [uiVisible, setUiVisible] = useState(false)

  const [roomCodeOpen, setRoomCodeOpen] = useState(false)

  const {
    isInRoom, players, roomId, roomCode, hostUuid, canStart, clearRoom,
    accessType, settings, settingsVersion, roomLocalTrustUntil,
  } = useMatchingStore()
  // 방장·내 준비 여부는 방 상태에서 계산
  const isHost = isInRoom && myUuid === hostUuid
  const myPlayer = players.find((player) => player.uuid === myUuid)
  const isReady = Boolean(myPlayer?.isReady)

  const inGameId = useInGameStore((s) => s.gameId)
  const inGameState = useInGameStore((s) => s.state)
  const goInGameFromMatching = useCallback((source = "matching_page") => {
    const { gameId, state } = useInGameStore.getState()
    if (!shouldLeaveMatchingForInGame(gameId, state)) return
    navigateToInGameFromMatching(navigate, { gameId, source })
  }, [navigate])

  const exitToMultiplay = useCallback((meta) => {
    useMatchingStore.getState().suppressRoomRecover()
    clearRejoinGameId(myUuid)
    if (useMatchingStore.getState().isInRoom) clearRoom()
    const message = meta?.silent ? null : matchingRoomExitMessage(meta)
    if (message) window.alert(message)
    traceMatchingFlow("navigate_multiplay", meta ?? { reason: "exit_matching" })
    navigate("/multiplay", { replace: true })
  }, [navigate, clearRoom, myUuid])

  const canStayOnMatchingPage = resolveCanStayOnMatchingPage({
    awaiting, isInRoom, roomId, players, myUuid, roomLocalTrustUntil,
  })

  // 방이 사라지면 목록으로 (파티 방 기다리는 중엔 그대로 둠), 판 id가 있으면 인게임으로
  const handleRoomDeleted = useCallback((meta) => {
    traceMatchingFlow("matching_page_room_deleted", {
      awaiting,
      ...meta,
      inGameId: useInGameStore.getState().gameId,
    })
    const forceLobby = shouldForceMatchingLobbyExit(meta)
    if (awaiting && !forceLobby) return
    const { gameId: activeGameId, state: activeState } = useInGameStore.getState()
    if (shouldLeaveMatchingForInGame(activeGameId, activeState)) {
      traceMatchingFlow("matching_page_room_deleted_goto_ingame", { inGameId: activeGameId })
      goInGameFromMatching()
      return
    }
    const trustUntil = meta?.trustUntil ?? useMatchingStore.getState().roomLocalTrustUntil
    if (!forceLobby && trustUntil > Date.now()) {
      traceMatchingFlow("block_navigate_multiplay", { reason: "local_trust", meta })
      return
    }
    exitToMultiplay(meta)
  }, [awaiting, goInGameFromMatching, exitToMultiplay])
  const handleGameStarted = useCallback((payload) => {
    traceMatchingFlow("matching_page_on_game_started", {
      gameId: payload?.gameId ?? useInGameStore.getState().gameId,
      reactPathname: location.pathname,
      historyPathname: typeof window !== "undefined" ? window.location.pathname : "",
    })
    goInGameFromMatching()
  }, [goInGameFromMatching, location.pathname])

  // game_started 직후 navigate가 누락돼도 판이 생기면 대기방에서 인게임으로 넘김
  useEffect(() => {
    if (!shouldLeaveMatchingForInGame(inGameId, inGameState)) return
    if (location.pathname !== "/game-matching") return
    goInGameFromMatching()
  }, [inGameId, inGameState, location.pathname, goInGameFromMatching])

  // setGamePayload는 렌더 전에 올 수 있어 구독으로 즉시 이동
  useEffect(() => {
    let prevGameId = useInGameStore.getState().gameId
    return useInGameStore.subscribe((state) => {
      const nextGameId = state.gameId
      if (nextGameId === prevGameId) return
      prevGameId = nextGameId
      if (!shouldLeaveMatchingForInGame(nextGameId, state.state)) return
      if (window.location.pathname !== "/game-matching") return
      goInGameFromMatching()
    })
  }, [goInGameFromMatching])
  // 파티 방 기다림을 그만두면(방 없어짐·시간 지남) 알리고 목록으로 (FE-005)
  const handlePartyRejoinFailed = useCallback((message) => {
    clearRejoinGameId(myUuid)
    if (message) window.alert(message)
    navigate("/multiplay", { replace: true })
  }, [navigate, myUuid])

  // 방 확인·방송·요청 (파티 방 기다리면 끝난 판 id 넘김)
  const {
    deleteRoom, isDeleting, startGame, setReady, isStarting, isSettingReady, isRoomVerified,
    saveRoomSettings, verifyRoomSettingsResult, isSavingSettings, hasPendingSettingsResult, settingsError,
    settingsResultNotice, dismissSettingsResultNotice,
    startBlockedMessage, dismissStartBlockedMessage,
  } = useMatchingRoom({
    onRoomDeleted: handleRoomDeleted,
    onGameStarted: handleGameStarted,
    endedGameId: awaiting ? endedGameId : null,
    awaitPartyRoomRejoin: awaiting,
    onPartyRejoinFailed: handlePartyRejoinFailed,
  })

  // 방에 확인까지 들어가면 파티 재입장 기억을 지우고 기다림도 끝 (옛 sessionStorage가 남아 있어도)
  useEffect(() => {
    if (!isInRoom || !isRoomVerified) return
    clearRejoinGameId(myUuid)
    if (awaiting) setPartyJoined(true)
  }, [awaiting, isInRoom, isRoomVerified, myUuid])

  // 방에 안 앉았는데 대기방 URL만 남은 경우 멀티플레이로 (퇴장·삭제 후 화면 고착 방지)
  useEffect(() => {
    if (canStayOnMatchingPage) return
    if (location.pathname !== "/game-matching") return
    if (roomLocalTrustUntil > Date.now()) return
    traceMatchingFlow("matching_page_orphan_exit", {
      roomLocalTrustUntil,
      endedGameId: storedGameId ?? null,
      isInRoom,
      roomId,
      partyCount: players.length,
    })
    exitToMultiplay({ reason: "orphan_matching", silent: true })
  }, [
    canStayOnMatchingPage, location.pathname, roomLocalTrustUntil,
    storedGameId, isInRoom, roomId, players.length, exitToMultiplay,
  ])

  // 판이 끝났는데 인게임 상태만 남아 있으면 대기방에서 정리 (game_ended는 이 경로에선 안 밀어줌)
  useEffect(() => {
    const { gameId, state } = useInGameStore.getState()
    if (typeof gameId === "string" && gameId.length > 0 && state?.phase === "ENDED") {
      useInGameStore.getState().clearGame()
    }
  }, [])

  // 기다림이 끝났으면 화면 이동 기록의 기다림 표시도 지움 (새로고침해도 다시 안 기다리게)
  const staleAwaitState = partyJoined && location.state?.awaitRoomAfterGameResult === true
  useEffect(() => {
    if (!staleAwaitState) return
    navigate(location.pathname, { replace: true, state: null })
  }, [staleAwaitState, navigate, location.pathname])

  // 강퇴 (방 확인 끝나야 가능)
  const {
    canKick, isKickHost, kickModalOpen, openKickModal, closeKickModal,
    kickTargets, kickPendingTarget, kickStatus, kickErrorCode, isKicking, canLookupKickResult, isAwaitingKickResolution,
    requestKickConfirm, cancelKickConfirm, confirmKick, lookupKickResult,
  } = useMatchingRoomKick({ isRoomVerified })

  // 친구 초대 (방에 있을 때만)
  const {
    canOpenFriendInvite,
    friendInviteModalOpen,
    openFriendInviteModal,
    closeFriendInviteModal,
    inviteFriends,
    invitingIds,
    inviteFriend,
    friendInviteError,
  } = useMatchingFriendInvite({
    roomId: isInRoom ? roomId : null,
    isRoomVerified,
  })

  // 설정 편집 (방장·방 확인 끝·결과 확인 대기 없음일 때만)
  const {
    settingsOpen, openSettings, closeSettings, canEditSettings,
    settingsForm, settingsFormResetKey, submitSettings,
  } = useSettingsEdit({
    isInRoom, isHost, isRoomVerified, roomId, accessType, settings, settingsVersion,
    hasPendingSettingsResult, saveRoomSettings,
  })

  // 첫 그림 다음 프레임에 화면 드러냄
  useEffect(() => {
    const frame = requestAnimationFrame(() => setUiVisible(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  // 뒤로: 방 나가기 알리고 방·기다리던 판 지운 뒤 목록으로
  const handleBack = useCallback(() => {
    useMatchingStore.getState().suppressRoomRecover()
    leaveRoom()
    exitToMultiplay({ reason: "user_back", silent: true })
  }, [exitToMultiplay])

  // 준비 누르면 지금과 반대로 요청
  const toggleReady = () => setReady(!isReady)

  // 자리 목록·기다림 문구 (파티 방 기다리는 중이면 빈 자리 + 기다림 문구)
  const slots = buildSlots({ isInRoom, players, awaiting })
  // 인원 수는 실제 방 사람만 셈 (방 밖 미리보기 가짜 자리는 안 셈)
  const partyCount = isInRoom ? players.length : 0

  const waitingMessage = !isInRoom && awaiting
    ? MATCHING_POPUP_COPY.awaitingHostRoom
    : ""

  // 방 코드는 확인된 방에서만 보여 줌
  const canViewRoomCode = isInRoom && isRoomVerified
  const displayRoomCode = canViewRoomCode ? roomCode : null
  // 볼 자격을 잃으면 창도 닫음 (되찾아도 저절로 다시 안 열리게)
  useEffect(() => {
    if (roomCodeOpen && !canViewRoomCode) setRoomCodeOpen(false)
  }, [roomCodeOpen, canViewRoomCode])

  // 화면에 넘길 값 (canViewRoomCode·roomId·canStart·room* 셋은 페이지가 안 씀)
  return {
    canStayOnMatchingPage,
    uiVisible,
    waitingMessage,
    roomCodeOpen: roomCodeOpen && canViewRoomCode,
    canViewRoomCode,
    openRoomCode: () => { if (canViewRoomCode) setRoomCodeOpen(true) },
    closeRoomCode: () => setRoomCodeOpen(false),
    slots,
    roomId: isInRoom ? roomId : null,
    roomCode: displayRoomCode,
    partyCount,
    isHost,
    isReady,
    isSettingReady,
    toggleReady,
    canStart,
    isStarting,
    // 방에 있고 확인까지 끝났을 때만 확인됨 (파티 방 기다리는 중엔 준비 버튼 잠기게, FE-031)
    isRoomVerified: isInRoom && isRoomVerified,
    startGame,
    deleteRoom,
    isDeleting,
    startBlockedMessage,
    dismissStartBlockedMessage,
    handleBack,
    settingsOpen,
    openSettings,
    closeSettings,
    canEditSettings,
    settingsForm,
    settingsFormResetKey,
    submitSettings,
    isSavingSettings,
    hasPendingSettingsResult,
    verifyRoomSettingsResult,
    settingsError,
    settingsResultNotice,
    dismissSettingsResultNotice,
    canKick,
    isKickHost,
    kickModalOpen,
    openKickModal,
    closeKickModal,
    kickTargets,
    kickPendingTarget,
    kickStatus,
    kickErrorCode,
    isKicking,
    canLookupKickResult,
    isAwaitingKickResolution,
    requestKickConfirm,
    cancelKickConfirm,
    confirmKick,
    lookupKickResult,
    canOpenFriendInvite,
    friendInviteModalOpen,
    openFriendInviteModal,
    closeFriendInviteModal,
    inviteFriends,
    invitingIds,
    inviteFriend,
    friendInviteError,
    roomSettings: settings,
    roomSettingsVersion: settingsVersion,
    roomAccessType: accessType,
  }
}
