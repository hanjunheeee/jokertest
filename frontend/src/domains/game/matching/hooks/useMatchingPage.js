import { useCallback, useEffect, useMemo, useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { MATCHING_PARTY_SLOTS_DUMMY_10, MATCHING_POPUP_COPY } from "../constants/gameMatchingAssets.js"
import { useMatchingRoom } from "./useMatchingRoom"
import { useMatchingRoomKick } from "./useMatchingRoomKick.js"
import { useMatchingFriendInvite } from "./useMatchingFriendInvite.js"
import { useMatchingStore } from "../store/matchingStore"
import { useAuthStore } from "@/domains/auth/store/auth.store"
import { getSocket } from "@/shared/socket/socketClient"
import { buildRoomSettingsFormState } from "@/domains/game/setup/utils/roomSettingsForm.js"
import { clearPartyRejoinGameId, readPartyRejoinGameId } from "../utils/partyMatchingRejoin.js"

export function useMatchingPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const myUuid = useAuthStore((s) => s.user?.uuid)
  const storedPartyGameId = readPartyRejoinGameId(myUuid)
  const awaitRoomAfterGameResult =
    location.state?.awaitRoomAfterGameResult === true || Boolean(storedPartyGameId)
  const endedGameId = typeof location.state?.endedGameId === "string"
    ? location.state.endedGameId
    : storedPartyGameId

  const [uiVisible, setUiVisible] = useState(false)

  const [roomCodeOpen, setRoomCodeOpen] = useState(false)

  const [settingsOpen, setSettingsOpen] = useState(false)

  const {
    isInRoom, players, roomId, roomCode, hostUuid, canStart, clearRoom,
    accessType, settings, settingsVersion,
  } = useMatchingStore()
  const isHost = isInRoom && myUuid === hostUuid
  const myPlayer = players.find((player) => player.uuid === myUuid)
  const isReady = Boolean(myPlayer?.isReady)

  const handleRoomDeleted = useCallback(() => {
    if (awaitRoomAfterGameResult) return
    navigate("/multiplay")
  }, [navigate, awaitRoomAfterGameResult])
  const handleGameStarted = useCallback(() => navigate("/ingame"), [navigate])

  const {
    deleteRoom, startGame, setReady, isStarting, isSettingReady, isRoomVerified,
    saveRoomSettings, verifyRoomSettingsResult, isSavingSettings, hasPendingSettingsResult, settingsError,
    settingsResultNotice, dismissSettingsResultNotice,
    startBlockedMessage, dismissStartBlockedMessage,
  } = useMatchingRoom({
    onRoomDeleted: handleRoomDeleted,
    onGameStarted: handleGameStarted,
    endedGameId: awaitRoomAfterGameResult ? endedGameId : null,
    awaitPartyRoomRejoin: awaitRoomAfterGameResult,
  })

  const {
    canKick, isKickHost, kickModalOpen, openKickModal, closeKickModal,
    kickTargets, kickPendingTarget, kickStatus, kickErrorCode, isKicking, canLookupKickResult, isAwaitingKickResolution,
    requestKickConfirm, cancelKickConfirm, confirmKick, lookupKickResult,
  } = useMatchingRoomKick({ isRoomVerified })

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

  const settingsForm = useMemo(
    () => buildRoomSettingsFormState({ accessType, settings }),
    [accessType, settings],
  )
  const settingsFormResetKey = `${roomId ?? ""}:${settingsVersion ?? ""}`

  const canEditSettings = isInRoom && isHost && isRoomVerified && settingsForm.ok && !hasPendingSettingsResult
  const openSettings = () => { if (canEditSettings) setSettingsOpen(true) }
  const closeSettings = () => setSettingsOpen(false)

  useEffect(() => {
    if (settingsOpen && !canEditSettings) setSettingsOpen(false)
  }, [settingsOpen, canEditSettings])

  const submitSettings = async (formState) => {
    const result = await saveRoomSettings(formState)
    if (result.ok) setSettingsOpen(false)
    return result
  }

  useEffect(() => {
    const frame = requestAnimationFrame(() => setUiVisible(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  const handleBack = () => {
    getSocket()?.emit("leave_room")
    clearRoom()
    clearPartyRejoinGameId(myUuid)
    navigate("/multiplay")
  }

  const toggleReady = () => setReady(!isReady)

  const slots = isInRoom
    ? players.map((player) => ({
        id: player.uuid,
        ready: Boolean(player.isReady),
        accountProfilePhotoId: player.accountProfilePhotoId,
        accountProfileBorderId: player.accountProfileBorderId,
      }))
    : awaitRoomAfterGameResult
      ? []
      : MATCHING_PARTY_SLOTS_DUMMY_10

  const waitingMessage = !isInRoom && awaitRoomAfterGameResult
    ? MATCHING_POPUP_COPY.awaitingHostRoom
    : ""

  const canViewRoomCode = isInRoom && isRoomVerified
  const displayRoomCode = canViewRoomCode ? roomCode : null

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
