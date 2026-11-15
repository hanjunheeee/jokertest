// 대기방 화면 훅: 방·강퇴·친구 초대·설정 편집 훅을 묶어 화면 값으로 돌려줌
// GameMatchingPage가 씀(모바일도 같음), 판 끝나고 같은 방으로 돌아와도 처음 만든 방과 같은 길
import { useCallback, useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useMatchingRoom } from "./useMatchingRoom"
import { useMatchingRoomKick } from "./useMatchingRoomKick.js"
import { useMatchingFriendInvite } from "./useMatchingFriendInvite.js"
import { useSettingsEdit } from "./useSettingsEdit.js"
import { useMatchingStore } from "../store/matchingStore"
import { useAuthStore } from "@/domains/auth/store/auth.store"
import { buildSlots } from "../utils/chunkPlayerSlots.js"
import { leaveRoom } from "../socket/room.js"

// 판 끝 뒤 방장 자리를 비워 둔 동안 자리 아래 안내 (방장 없으면 시작·설정·추방 단추도 아무에게 안 보임)
const HOST_SEAT_RESERVED_MESSAGE =
  "방장 자리를 비워 두었습니다. 지난 판 방장이 오지 않으면 먼저 들어온 사람이 방장이 됩니다."

// 대기방 화면 값·동작 묶음
export function useMatchingPage() {
  const navigate = useNavigate()
  const myUuid = useAuthStore((s) => s.user?.uuid)

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

  // 방이 사라지면 목록으로, 게임 시작하면 인게임으로
  const handleRoomDeleted = useCallback(() => navigate("/multiplay"), [navigate])
  const handleGameStarted = useCallback(() => navigate("/ingame"), [navigate])

  // 방 확인·방송·요청
  const {
    deleteRoom, isDeleting, startGame, setReady, isStarting, isSettingReady, isRoomVerified,
    saveRoomSettings, verifyRoomSettingsResult, isSavingSettings, hasPendingSettingsResult, settingsError,
    settingsResultNotice, dismissSettingsResultNotice,
    startBlockedMessage, dismissStartBlockedMessage,
  } = useMatchingRoom({
    onRoomDeleted: handleRoomDeleted,
    onGameStarted: handleGameStarted,
  })

  // 강퇴 (방 확인 끝나야 가능, 줄 "추방"이 바로 강퇴)
  const {
    canKick, isKickHost, kickModalOpen, openKickModal, closeKickModal,
    kickTargets, kickPendingTarget, kickStatus, kickErrorCode, isKicking, canLookupKickResult, isAwaitingKickResolution,
    requestKickConfirm, lookupKickResult,
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

  // 뒤로: 방 나가기 알리고 방 지운 뒤 목록으로
  const handleBack = () => {
    leaveRoom()
    clearRoom()
    navigate("/multiplay")
  }

  // 준비 누르면 지금과 반대로 요청
  const toggleReady = () => setReady(!isReady)

  // 자리 목록 (판 끝 뒤 방장 자리를 비워 둔 방이면 맨 앞에 "방장 자리" 칸), 방장 자리 안내 문구
  const hostSeatReserved = isInRoom && !hostUuid
  const slots = buildSlots({ isInRoom, players, hostSeatReserved })
  // 인원 수는 실제 방 사람만 셈 (방 밖 미리보기 가짜 자리·방장 자리 칸은 안 셈)
  const partyCount = isInRoom ? players.length : 0

  const waitingMessage = hostSeatReserved ? HOST_SEAT_RESERVED_MESSAGE : ""

  // 방 코드는 확인된 방에서만 보여 줌
  const canViewRoomCode = isInRoom && isRoomVerified
  const displayRoomCode = canViewRoomCode ? roomCode : null
  // 볼 자격을 잃으면 창도 닫음 (되찾아도 저절로 다시 안 열리게)
  if (roomCodeOpen && !canViewRoomCode) setRoomCodeOpen(false)

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
    partyCount,
    isHost,
    isReady,
    isSettingReady,
    toggleReady,
    canStart,
    isStarting,
    // 방에 있고 확인까지 끝났을 때만 확인됨 (확인 전엔 준비 버튼 잠기게, FE-031)
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
