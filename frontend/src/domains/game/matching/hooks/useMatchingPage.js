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
import { useAuthStore } from "@/domains/auth/store/auth.store"
import { clearRejoinGameId, readRejoinGameId } from "../../shared/utils/partyMatchingRejoin.js"
import { buildSlots } from "../utils/chunkPlayerSlots.js"
import { leaveRoom } from "../socket/room.js"

// 대기방 화면 값·동작 묶음
export function useMatchingPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const myUuid = useAuthStore((s) => s.user?.uuid)

  // 결과 화면에서 왔거나 새로고침 전에 기다리던 판이 있으면 파티 방 기다림
  const storedGameId = readRejoinGameId(myUuid)
  const awaiting =
    location.state?.awaitRoomAfterGameResult === true || Boolean(storedGameId)
  const endedGameId = typeof location.state?.endedGameId === "string"
    ? location.state.endedGameId
    : storedGameId

  const [uiVisible, setUiVisible] = useState(false)

  const [roomCodeOpen, setRoomCodeOpen] = useState(false)

  const {
    isInRoom, players, roomId, roomCode, hostUuid, canStart, clearRoom,
    accessType, settings, settingsVersion,
  } = useMatchingStore()
  // 방장·내 준비 여부는 방 상태에서 계산
  const isHost = isInRoom && myUuid === hostUuid
  const myPlayer = players.find((player) => player.uuid === myUuid)
  const isReady = Boolean(myPlayer?.isReady)

  // 방이 사라지면 목록으로 (파티 방 기다리는 중엔 그대로 둠), 게임 시작하면 인게임으로
  const handleRoomDeleted = useCallback(() => {
    if (awaiting) return
    navigate("/multiplay")
  }, [navigate, awaiting])
  const handleGameStarted = useCallback(() => navigate("/ingame"), [navigate])

  // 방 확인·방송·요청 (파티 방 기다리면 끝난 판 id 넘김)
  const {
    deleteRoom, startGame, setReady, isStarting, isSettingReady, isRoomVerified,
    saveRoomSettings, verifyRoomSettingsResult, isSavingSettings, hasPendingSettingsResult, settingsError,
    settingsResultNotice, dismissSettingsResultNotice,
    startBlockedMessage, dismissStartBlockedMessage,
  } = useMatchingRoom({
    onRoomDeleted: handleRoomDeleted,
    onGameStarted: handleGameStarted,
    endedGameId: awaiting ? endedGameId : null,
    awaitPartyRoomRejoin: awaiting,
  })

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
  } = useMatchingFriendInvite({
    roomId: isInRoom ? roomId : null,
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
  const handleBack = () => {
    leaveRoom()
    clearRoom()
    clearRejoinGameId(myUuid)
    navigate("/multiplay")
  }

  // 준비 누르면 지금과 반대로 요청
  const toggleReady = () => setReady(!isReady)

  // 자리 목록·기다림 문구 (파티 방 기다리는 중이면 빈 자리 + 기다림 문구)
  const slots = buildSlots({ isInRoom, players, awaiting })

  const waitingMessage = !isInRoom && awaiting
    ? MATCHING_POPUP_COPY.awaitingHostRoom
    : ""

  // 방 코드는 확인된 방에서만 보여 줌
  const canViewRoomCode = isInRoom && isRoomVerified
  const displayRoomCode = canViewRoomCode ? roomCode : null

  // 화면에 넘길 값 (canViewRoomCode·roomId·canStart·room* 셋은 페이지가 안 씀)
  return {
    uiVisible,
    waitingMessage,
    roomCodeOpen: roomCodeOpen && canViewRoomCode,
    canViewRoomCode,
    openRoomCode: () => { if (canViewRoomCode) setRoomCodeOpen(true) },
    closeRoomCode: () => setRoomCodeOpen(false),
    slots,
    roomId: isInRoom ? roomId : null,
    roomCode: displayRoomCode,
    partyCount: slots.length,
    isHost,
    isReady,
    isSettingReady,
    toggleReady,
    canStart,
    isStarting,
    isRoomVerified,
    startGame,
    deleteRoom,
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
    roomSettings: settings,
    roomSettingsVersion: settingsVersion,
    roomAccessType: accessType,
  }
}
