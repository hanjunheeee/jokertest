import { useCallback, useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  MATCHING_PARTY_SLOTS_DUMMY_10,
  MATCHING_ROOM_CODE_DUMMY,
} from "../constants/gameMatchingAssets.js"
import { useMatchingRoom } from "./useMatchingRoom"
// F-21(AC-02): 대기방 추방의 실제 소비 경계다. 목록·확인·전송·결과 재조회는 전부 이 훅이
// 소유하고(인게임과 같은 useKickPlayerRequest를 쓴다), 이 페이지 훅은 그 값을 그대로 넘긴다.
import { useMatchingRoomKick } from "./useMatchingRoomKick.js"
import { useMatchingStore } from "../store/matchingStore"
import { useAuthStore } from "@/domains/auth/store/auth.store"
import { getSocket } from "@/shared/socket/socketClient"
import { buildRoomSettingsFormState } from "@/domains/game/setup/utils/roomSettingsForm.js"

/** 매칭 대기 페이지에서 필요한 상태 계산과 페이지 이동을 묶습니다. */
export function useMatchingPage() {
  const navigate = useNavigate()

  // 입장 페이드인이 끝나서 UI를 보여줘도 되는지 표시합니다.
  const [uiVisible, setUiVisible] = useState(false)

  // 초대코드 공유 모달이 열려 있는지 표시합니다.
  const [roomCodeOpen, setRoomCodeOpen] = useState(false)

  // F-19(AC-01/AC-06): 대기방의 친구 패널이 초대를 보내려면 **검증된 방 식별자**가 필요하다.
  // useMatchingPage는 지금까지 roomId를 노출하지 않았다 — matchingStore의 실제 값을 그대로
  // 내보내고, isRoomVerified와 함께 패널에 넘긴다(검증 전에는 초대 발송이 비활성이다).
  // 설정 편집 패널이 열려 있는지(방장만 열 수 있다).
  const [settingsOpen, setSettingsOpen] = useState(false)

  const {
    isInRoom, players, roomId, roomCode, hostUuid, canStart, clearRoom,
    accessType, settings, settingsVersion,
  } = useMatchingStore()
  const myUuid = useAuthStore((s) => s.user?.uuid)
  const isHost = isInRoom && myUuid === hostUuid
  // canStart는 서버가 계산해 store에 내려준 값을 그대로 쓴다(여기서 재계산하지 않음).
  const myPlayer = players.find((player) => player.uuid === myUuid)
  const isReady = Boolean(myPlayer?.isReady)

  const handleRoomDeleted = useCallback(() => navigate("/multiplay"), [navigate])
  const handleGameStarted = useCallback(() => navigate("/ingame"), [navigate])

  const {
    deleteRoom, startGame, setReady, isStarting, isSettingReady, isRoomVerified,
    saveRoomSettings, verifyRoomSettingsResult, isSavingSettings, hasPendingSettingsResult, settingsError,
    settingsResultNotice, dismissSettingsResultNotice,
  } = useMatchingRoom({
    onRoomDeleted: handleRoomDeleted,
    onGameStarted: handleGameStarted,
  })

  // F-21(AC-02): 방장만 추방 진입을 갖는다. 방 검증 전에는 열리지 않는다 — 아직 서버가
  // 확정해 주지 않은 소속으로 남을 내보내면 화면만 성공한 것처럼 보인다.
  const {
    canKick, kickModalOpen, openKickModal, closeKickModal,
    kickTargets, kickPendingTarget, kickStatus, kickErrorCode, isKicking, canLookupKickResult, isAwaitingKickResolution,
    requestKickConfirm, cancelKickConfirm, confirmKick, lookupKickResult,
  } = useMatchingRoomKick({ isRoomVerified })

  // F-20(AC-03/AC-05): 서버가 확정한 설정을 폼 상태로 변환한다. 변환이 실패하면(서버 설정이
  // 이 화면이 표현할 수 없는 값) 기본값으로 덮어 "저장 가능한 것처럼" 보이게 하지 않고
  // 편집 자체를 막는다 — 덮으면 방장이 건드리지도 않은 값을 저장하게 된다.
  const settingsForm = useMemo(
    () => buildRoomSettingsFormState({ accessType, settings }),
    [accessType, settings],
  )
  // 방·설정 버전이 바뀌면 폼을 서버 최신값으로 다시 맞춘다(이전 초안을 남기지 않는다).
  const settingsFormResetKey = `${roomId ?? ""}:${settingsVersion ?? ""}`

  const canEditSettings = isInRoom && isHost && isRoomVerified && settingsForm.ok && !hasPendingSettingsResult
  const openSettings = () => { if (canEditSettings) setSettingsOpen(true) }
  const closeSettings = () => setSettingsOpen(false)

  // 방장이 아니게 되거나 검증이 풀리면 편집 패널을 닫는다 — 열린 채로 두면 이미 권한이 없는
  // 초안을 계속 보게 된다(저장은 서버가 어차피 거부한다).
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
    navigate("/multiplay")
  }

  // 준비 완료/준비 취소 버튼은 목표 상태(현재의 반대값)를 명시적으로 전달한다.
  const toggleReady = () => setReady(!isReady)

  // F-13(AC-05): room.players는 matchmaking.js(loadRoomParticipantProfile/
  // captureRoomStartProfiles)가 이미 계정별 accountProfilePhotoId/accountProfileBorderId를
  // 실어 보낸다 — 여기서 그 두 필드를 버리지 않고 그대로 slots에 옮겨야 대기방 슬롯이
  // 서로 다른 계정 이미지를 보여줄 수 있다(MatchingPartySlots.jsx).
  const slots = isInRoom
    ? players.map((player) => ({
        id: player.uuid,
        ready: Boolean(player.isReady),
        accountProfilePhotoId: player.accountProfilePhotoId,
        accountProfileBorderId: player.accountProfileBorderId,
      }))
    : MATCHING_PARTY_SLOTS_DUMMY_10

  const displayRoomCode = isInRoom ? roomCode : MATCHING_ROOM_CODE_DUMMY

  return {
    uiVisible,
    roomCodeOpen,
    openRoomCode: () => setRoomCodeOpen(true),
    closeRoomCode: () => setRoomCodeOpen(false),
    slots,
    // 실제 방 식별자다(화면 표시용 displayRoomCode와 다르다) — 방에 들어가 있지 않으면 null.
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
    handleBack,
    // F-20: 대기방 설정 편집. 비방장·미검증·결과 미확인 중에는 진입 자체가 열리지 않는다.
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
    // 결과 확인까지 마쳤는데도 적용 여부를 알 수 없을 때 대기방에 남는 안내(A-07).
    settingsResultNotice,
    dismissSettingsResultNotice,
    // F-21(AC-02): 대기방 추방. 비방장에게는 canKick이 false라 진입 자체가 없고, 확인 취소는
    // 소켓 요청 0회이며, 미확인 결과는 성공으로 바꾸지 않고 기존 키 조회만 제공한다.
    canKick,
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
    // 비방장도 현재 설정을 읽을 수 있도록 서버 확정값을 그대로 노출한다(편집은 불가).
    roomSettings: settings,
    roomSettingsVersion: settingsVersion,
    roomAccessType: accessType,
  }
}
