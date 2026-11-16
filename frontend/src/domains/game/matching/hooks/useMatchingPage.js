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
import { MIN_START_PLAYERS, startNotReadyMessage, startShortageMessage } from "../constants/gameStartMessages.js"

// 판 끝 뒤 방장 자리를 비워 둔 동안 자리 아래 안내 (방장 없으면 시작·설정·추방 단추도 아무에게 안 보임)
const HOST_SEAT_RESERVED_MESSAGE =
  "방장 자리를 비워 두었습니다. 지난 판 방장이 오지 않으면 먼저 들어온 사람이 방장이 됩니다."

// 시작 단추가 꺼진 까닭 글 고르기 (방장만, 없으면 null)
// 예: 3명 → "5명부터 시작할 수 있습니다. (지금 3명)", 5명 중 3명 준비 → "모두 준비해야 시작할 수 있습니다. (준비 3/5)"
function pickStartLockedReason({ isHost, lacksPlayers, someoneNotReady, partyCount, readyCount }) {
  if (!isHost) return null
  if (lacksPlayers) return startShortageMessage(partyCount)
  if (someoneNotReady) return startNotReadyMessage(readyCount, partyCount)
  return null
}

// 대기방 화면 값·동작 묶음
export function useMatchingPage() {
  const navigate = useNavigate()
  const myUuid = useAuthStore((s) => s.user?.uuid)

  const [uiVisible, setUiVisible] = useState(false)

  const [roomCodeOpen, setRoomCodeOpen] = useState(false)

  const {
    isInRoom, players, roomId, roomCode, hostUuid, canStart, clearRoom,
    accessType, settings, settingsVersion, title,
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
    deleteRoom, isDeleting, startGame, setReady, isStarting, isSettingReady, isRoomVerified, roomSyncStatus,
    saveRoomSettings, verifyRoomSettingsResult, isSavingSettings, hasPendingSettingsResult, settingsError,
    settingsResultNotice, dismissSettingsResultNotice,
    startBlockedMessage, dismissStartBlockedMessage,
  } = useMatchingRoom({
    onRoomDeleted: handleRoomDeleted,
    onGameStarted: handleGameStarted,
  })

  // 강퇴 (방 확인 끝나야 가능, 줄 "추방"이 바로 강퇴)
  const {
    canKick, isKickHost, kickLockedReason, kickModalOpen, openKickModal, closeKickModal,
    kickTargets, kickPendingTarget, kickStatus, kickErrorCode, isKicking, canLookupKickResult, isAwaitingKickResolution,
    requestKickConfirm, lookupKickResult,
  } = useMatchingRoomKick({ isRoomVerified, roomSyncStatus })

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
  // 정원(방 설정의 maxPlayers)과 방 이름, 값이 없으면 null → 화면이 그 글을 안 그림
  const maxPlayers = settings?.maxPlayers
  const partyMax = isInRoom && Number.isInteger(maxPlayers) && maxPlayers > 0 ? maxPlayers : null
  const roomTitle = isInRoom && typeof title === "string" && title.trim().length > 0 ? title.trim() : null

  const waitingMessage = hostSeatReserved ? HOST_SEAT_RESERVED_MESSAGE : ""

  // 방장의 시작 단추를 미리 끄는 까닭 글 (눌러야 서버 거절 글로 알던 것을 누르기 전에 알게, 서버 거절은 그대로 있음)
  // 인원 모자람이 먼저, 그다음 준비 안 됨 (서버 규칙: 방장까지 전원 준비)
  // 준비 쪽은 서버가 준 canStart가 거짓이고 명단에도 준비 안 한 사람이 보일 때만 끔
  // → canStart가 거짓인데 명단은 전원 준비(역할 구성 안 맞음·입장 처리 중·값이 낡음)면 안 끄고 서버 거절 글에 맡김
  const readyCount = players.filter((player) => player?.isReady === true).length
  const lacksPlayers = MIN_START_PLAYERS !== null && partyCount < MIN_START_PLAYERS
  const someoneNotReady = canStart !== true && readyCount < partyCount
  const startLockedReason = pickStartLockedReason({ isHost, lacksPlayers, someoneNotReady, partyCount, readyCount })

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
    partyMax,
    roomTitle,
    isHost,
    isReady,
    isSettingReady,
    toggleReady,
    canStart,
    startLockedReason,
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
    kickLockedReason,
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
