// 대기방 훅 조립: 방 확인·방송 반영·파티 재입장·요청을 묶어 화면에 돌려줌
// hooks/useMatchingRoom.js(입구)를 거쳐 useMatchingPage가 씀
// 효과 순서(살아 있음 → 파티 재입장 → 방 이벤트 → 방 확인 → 계정·방 바뀜)는 원래 한 파일일 때와 같게 둠
import { useSyncExternalStore } from 'react'
import { getSocket, subscribeSocket } from '@/shared/socket/socketClient.js'
import { useMatchingStore } from '../../store/matchingStore'
import { useRoomCore } from './useRoomCore.js'
import { usePartyRejoin } from './usePartyRejoin.js'
import { useRoomEvents } from './useRoomEvents.js'
import { useRoomCheck } from './useRoomCheck.js'
import { useRoomReset } from './useRoomReset.js'
import { useRoomRequests } from './useRoomRequests.js'
import { useSettingsSave } from './useSettingsSave.js'

export function useRoom({
  onRoomDeleted,
  onGameStarted,
  endedGameId = null,
  awaitPartyRoomRejoin = false,
}) {
  const roomId = useMatchingStore((s) => s.roomId)

  // 소켓이 바뀌면 다시 그림 (효과들이 새 소켓에 다시 붙음)
  const socket = useSyncExternalStore(subscribeSocket, getSocket, getSocket)

  const ctx = useRoomCore({ endedGameId, awaitPartyRoomRejoin })
  usePartyRejoin(ctx, socket, endedGameId, awaitPartyRoomRejoin)
  useRoomEvents(ctx, { socket, roomId, onRoomDeleted, onGameStarted })
  useRoomCheck(ctx, socket, onRoomDeleted)
  useRoomReset(ctx)

  const { deleteRoom, startGame, setReady } = useRoomRequests(ctx)
  const { saveRoomSettings, verifyRoomSettingsResult } = useSettingsSave(ctx)

  return {
    deleteRoom,
    startGame,
    setReady,
    isStarting: ctx.isStarting,
    isSettingReady: ctx.isSettingReady,
    isRoomVerified: ctx.syncStatus === 'verified',
    saveRoomSettings,
    verifyRoomSettingsResult,
    isSavingSettings: ctx.isSaving,
    hasPendingSettingsResult: ctx.pending !== null,
    settingsError: ctx.settingsError,
    settingsResultNotice: ctx.notice,
    dismissSettingsResultNotice: () => ctx.setNotice(null),
    startBlockedMessage: ctx.startBlocked,
    dismissStartBlockedMessage: () => ctx.setStartBlocked(null),
  }
}
