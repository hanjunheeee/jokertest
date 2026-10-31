import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { getSocket, subscribeSocket } from '@/shared/socket/socketClient'
import { useMatchingStore } from '../store/matchingStore'
import { useInGameStore } from '../../ingame/store/ingameStore'
import { useAuthStore } from '@/domains/auth/store/auth.store'
import { dispatchSfxEvent, dispatchUiSfx } from '@/shared/hooks/useSfxRuntime.js'
import {
  ROOM_SETTINGS_ERROR_CODES,
  ROOM_SETTINGS_ERROR_MESSAGES,
  ROOM_SETTINGS_RESULT_TIMEOUT_MS,
  SOCKET_EVENTS,
  UPDATE_ROOM_SETTINGS_TIMEOUT_MS,
} from '@/domains/game/setup/constants/gameSetupSocket.js'
import { buildUpdateRoomSettingsPayload } from '@/domains/game/setup/utils/roomSettingsForm.js'
import { GAME_START_MESSAGES } from '../constants/gameStartMessages.js'
import {
  clearPartyRejoinGameId,
  consumePartyMatchingRoomReady,
  persistPartyRejoinGameId,
  rememberPartyMatchingRoomReady,
} from '../utils/partyMatchingRejoin.js'

const playRoomSfx = (kind, sfxEvent) => {
  if (sfxEvent === null || typeof sfxEvent !== 'object') return
  const { user, isLoggedIn } = useAuthStore.getState()
  const accountId = isLoggedIn && user?.uuid ? user.uuid : null
  if (accountId === null) return
  dispatchSfxEvent({
    kind,
    eventId: sfxEvent.eventId,
    accountId,
    roomId: sfxEvent.roomId,
    origin: sfxEvent.origin,
  })
}

const READY_EVENT = Object.freeze({ APPLY: 'apply', STALE: 'stale', NEWER: 'newer' })

const classifyReadyEvent = (state, uuid, { settingsVersion, readyRevision }) => {
  if (Number.isSafeInteger(settingsVersion)) {
    if (!Number.isSafeInteger(state.settingsVersion)) return READY_EVENT.NEWER
    if (settingsVersion > state.settingsVersion) {
      return READY_EVENT.NEWER
    }
    if (settingsVersion < state.settingsVersion) return READY_EVENT.STALE
  }
  const player = state.players.find((p) => p.uuid === uuid)
  if (Number.isInteger(readyRevision) && Number.isInteger(player?.readyRevision)
    && readyRevision <= player.readyRevision) return READY_EVENT.STALE
  return READY_EVENT.APPLY
}

const revealsNewerSettingsVersion = (room) => {
  if (room === null || typeof room !== 'object') return false
  const { roomId, settingsVersion: known } = useMatchingStore.getState()
  if (room.roomId !== roomId) return false
  const incoming = room.settingsVersion
  if (!Number.isSafeInteger(incoming)) return false
  if (!Number.isSafeInteger(known)) return true
  return incoming > known
}

const START_GAME_TIMEOUT_MS = 8000
const SET_READY_TIMEOUT_MS = 5000

const SOCKET_UNAVAILABLE_MESSAGE = GAME_START_MESSAGES.SOCKET_UNAVAILABLE

const CURRENT_ROOM_CHECK_TIMEOUT_MS = 5000
const CURRENT_ROOM_PENDING_RETRY_INTERVAL_MS = 700
const CURRENT_ROOM_PENDING_MAX_RETRIES = 3
const PARTY_MATCHING_ROOM_POLL_MS = 2500
const PARTY_MATCHING_ROOM_POLL_TIMEOUT_MS = 5000

export function useMatchingRoom({
  onRoomDeleted,
  onGameStarted,
  endedGameId = null,
  awaitPartyRoomRejoin = false,
}) {
  const roomId = useMatchingStore((s) => s.roomId)

  const socket = useSyncExternalStore(subscribeSocket, getSocket, getSocket)

  const [roomSyncStatus, setRoomSyncStatus] = useState('waiting_socket')

  const [isStarting, setIsStarting] = useState(false)
  const [isSettingReady, setIsSettingReady] = useState(false)
  const isStartingRef = useRef(false)
  const isSettingReadyRef = useRef(false)
  const mountedRef = useRef(true)
  const endedGameIdRef = useRef(endedGameId)
  endedGameIdRef.current = endedGameId
  const awaitPartyRoomRejoinRef = useRef(awaitPartyRoomRejoin)
  awaitPartyRoomRejoinRef.current = awaitPartyRoomRejoin
  const partyRejoinInFlightRef = useRef(false)
  const startRequestVersionRef = useRef(0)
  const readyRequestVersionRef = useRef(0)
  const settingsRequestVersionRef = useRef(0)
  const [isSavingSettings, setIsSavingSettings] = useState(false)
  const isSavingSettingsRef = useRef(false)
  const [pendingSettingsRequest, setPendingSettingsRequest] = useState(null)
  const [settingsError, setSettingsError] = useState(null)
  const [settingsResultNotice, setSettingsResultNotice] = useState(null)
  const [startBlockedMessage, setStartBlockedMessage] = useState(null)
  const inFlightSettingsRequestRef = useRef(null)

  const roomApplyGenerationRef = useRef(0)
  const bumpRoomApplyGenerationRef = useRef(null)
  const requestRoomResyncRef = useRef(null)
  const requestRoomResync = () => {
    if (requestRoomResyncRef.current) requestRoomResyncRef.current()
    else roomApplyGenerationRef.current += 1
  }
  const bumpRoomApplyGeneration = () => {
    if (bumpRoomApplyGenerationRef.current) bumpRoomApplyGenerationRef.current()
    else roomApplyGenerationRef.current += 1
  }

  const roomMembershipGenerationRef = useRef(0)
  const [roomEventGeneration, setRoomEventGeneration] = useState(0)

  const readyAggregateGenerationRef = useRef(0)

  const socketIdentityRef = useRef({ socket: null, uuid: null })

  const applyingVerifiedRoomRef = useRef(false)
  const applyVerifiedRoom = (apply) => {
    applyingVerifiedRoomRef.current = true
    try { apply() } finally { applyingVerifiedRoomRef.current = false }
  }
  const invalidateRoomVerificationRef = useRef(null)

  const clearStartState = () => {
    isStartingRef.current = false
    if (mountedRef.current) setIsStarting(false)
  }
  const clearReadyState = () => {
    isSettingReadyRef.current = false
    if (mountedRef.current) setIsSettingReady(false)
  }
  const clearSettingsState = () => {
    isSavingSettingsRef.current = false
    if (mountedRef.current) setIsSavingSettings(false)
  }

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      clearStartState()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!socket || !awaitPartyRoomRejoinRef.current) return undefined

    const attachedSocket = socket
    const attachedUuid = useAuthStore.getState().user?.uuid ?? null
    let owned = true
    const isCurrentSource = () =>
      owned
      && attachedSocket === getSocket()
      && (useAuthStore.getState().user?.uuid ?? null) === attachedUuid

    const rememberResolvedPartyGameId = (gameId) => {
      if (typeof gameId !== 'string' || gameId.length === 0) return
      endedGameIdRef.current = gameId
      persistPartyRejoinGameId(attachedUuid, gameId)
    }

    const completePartyRejoin = (payload) => {
      if (!isCurrentSource()) return
      if (payload === null || typeof payload !== 'object') return
      const accountId = useAuthStore.getState().user?.uuid ?? null
      useInGameStore.getState().clearGame()
      useMatchingStore.getState().setRoom(payload)
      clearPartyRejoinGameId(accountId)
      partyRejoinInFlightRef.current = false
      roomApplyGenerationRef.current += 1
      if (mountedRef.current) setRoomSyncStatus('verified')
    }

    const requestPartyRejoin = (payload) => {
      if (!isCurrentSource()) return
      if (useMatchingStore.getState().isInRoom) return
      if (partyRejoinInFlightRef.current) return
      const payloadGameId = typeof payload?.gameId === 'string' ? payload.gameId : null
      const knownGameId = endedGameIdRef.current
      if (payloadGameId && knownGameId && payloadGameId !== knownGameId) return
      if (payloadGameId && !knownGameId) rememberResolvedPartyGameId(payloadGameId)
      const roomCode = payload?.room?.roomCode
      if (typeof roomCode !== 'string' || roomCode.length === 0) return
      partyRejoinInFlightRef.current = true
      const joinPayload = { roomCode }
      if (typeof payload?.room?.roomId === 'string' && payload.room.roomId.length > 0) {
        joinPayload.roomId = payload.room.roomId
      }
      socket.emit('join_room_by_code', joinPayload)
    }

    const handleRoomJoined = (payload) => {
      completePartyRejoin(payload)
    }

    const handlePartyMatchingRoomReady = (payload) => {
      rememberPartyMatchingRoomReady(payload)
      requestPartyRejoin(payload)
    }

    const syncCurrentRoomIfAny = () => {
      if (!isCurrentSource()) return Promise.resolve()
      if (!awaitPartyRoomRejoinRef.current || useMatchingStore.getState().isInRoom) {
        return Promise.resolve()
      }
      return socket
        .timeout(CURRENT_ROOM_CHECK_TIMEOUT_MS)
        .emitWithAck('get_current_room', {})
        .then((response) => {
          if (!isCurrentSource()) return
          if (response?.ok && response.room) completePartyRejoin(response.room)
        })
        .catch(() => {})
    }

    const pollPartyMatchingRoom = () => {
      if (!isCurrentSource()) return
      if (!awaitPartyRoomRejoinRef.current || useMatchingStore.getState().isInRoom) return
      void syncCurrentRoomIfAny()
      const pollPayload = endedGameIdRef.current ? { gameId: endedGameIdRef.current } : {}
      socket
        .timeout(PARTY_MATCHING_ROOM_POLL_TIMEOUT_MS)
        .emitWithAck(SOCKET_EVENTS.GET_PARTY_MATCHING_ROOM, pollPayload)
        .then((response) => {
          if (!isCurrentSource()) return
          if (!response?.ok || !response.room) return
          const resolvedGameId = response.gameId ?? endedGameIdRef.current
          if (resolvedGameId) rememberResolvedPartyGameId(resolvedGameId)
          rememberPartyMatchingRoomReady({ gameId: resolvedGameId, room: response.room })
          requestPartyRejoin({ gameId: resolvedGameId, room: response.room })
        })
        .catch(() => {
          partyRejoinInFlightRef.current = false
        })
    }

    const pendingParty = consumePartyMatchingRoomReady(endedGameIdRef.current)
    if (pendingParty) requestPartyRejoin(pendingParty)
    pollPartyMatchingRoom()

    const handleRoomJoinFailed = () => {
      partyRejoinInFlightRef.current = false
    }

    socket.on('room_joined', handleRoomJoined)
    socket.on('room_join_failed', handleRoomJoinFailed)
    socket.on('party_matching_room_ready', handlePartyMatchingRoomReady)

    const pollTimer = window.setInterval(pollPartyMatchingRoom, PARTY_MATCHING_ROOM_POLL_MS)

    return () => {
      owned = false
      window.clearInterval(pollTimer)
      socket.off('room_joined', handleRoomJoined)
      socket.off('room_join_failed', handleRoomJoinFailed)
      socket.off('party_matching_room_ready', handlePartyMatchingRoomReady)
    }
  }, [socket, endedGameId, awaitPartyRoomRejoin])

  useEffect(() => {
    if (!socket || !roomId) return

    const { addPlayer, removePlayer, updateHost, setPlayerReady, clearRoom, applyRoomSettings } =
      useMatchingStore.getState()

    const attachedSocket = socket
    const attachedUuid = useAuthStore.getState().user?.uuid ?? null
    const attachedMembership = roomMembershipGenerationRef.current
    let owned = true
    const isCurrentSource = () =>
      owned
      && attachedSocket === getSocket()
      && (useAuthStore.getState().user?.uuid ?? null) === attachedUuid
      && roomMembershipGenerationRef.current === attachedMembership

    const applyRoomEvent = (apply) => {
      apply()
      bumpRoomApplyGenerationRef.current?.()
    }

    const handlePlayerJoinedRoom = ({ player, canStart }) => {
      if (!isCurrentSource()) return
      readyAggregateGenerationRef.current += 1
      applyRoomEvent(() => addPlayer(player, canStart))
    }
    const handlePlayerLeftRoom = ({ uuid, canStart, membershipId, roomId: eventRoomId }) => {
      if (!isCurrentSource()) return
      if (eventRoomId !== undefined && eventRoomId !== roomId) return
      if (typeof membershipId === "string" && membershipId.length > 0) {
        const seated = useMatchingStore.getState().players?.find((player) => player.uuid === uuid)
        if (!seated) return
        if (typeof seated.membershipId === "string" && seated.membershipId !== membershipId) return
      }
      readyAggregateGenerationRef.current += 1
      applyRoomEvent(() => removePlayer(uuid, canStart))
    }
    const handleHostChanged = ({
      hostUuid, canStart, roomId: eventRoomId, settingsVersion, roomInstanceId, bootEpoch,
    }) => {
      if (!isCurrentSource()) return
      if (eventRoomId !== undefined && eventRoomId !== roomId) return
      const identity = useMatchingStore.getState()
      if (typeof roomInstanceId === "string" && typeof identity.roomInstanceId === "string"
        && roomInstanceId !== identity.roomInstanceId) return
      if (typeof bootEpoch === "string" && typeof identity.bootEpoch === "string"
        && bootEpoch !== identity.bootEpoch) return
      applyRoomEvent(() => updateHost(hostUuid, canStart))
      const known = useMatchingStore.getState().settingsVersion
      if (settingsVersion !== undefined && settingsVersion !== known) requestRoomResync()
    }
    const handleRoomSettingsUpdated = (payload) => {
      if (!isCurrentSource()) return
      if (!payload || payload.roomId !== roomId) return
      const known = useMatchingStore.getState().settingsVersion
      const incoming = payload.settingsVersion
      if (Number.isSafeInteger(incoming) && Number.isSafeInteger(known)) {
        if (incoming < known) return
        if (incoming === known) return
      }
      readyAggregateGenerationRef.current += 1
      applyRoomEvent(() => applyRoomSettings(payload))
    }
    const handlePlayerReadyChanged = ({
      uuid, isReady, canStart, sfxEvent, roomId: eventRoomId, settingsVersion, readyRevision,
    }) => {
      if (!isCurrentSource()) return
      if (eventRoomId !== undefined && eventRoomId !== roomId) return
      const verdict = classifyReadyEvent(useMatchingStore.getState(), uuid, { settingsVersion, readyRevision })
      if (verdict === READY_EVENT.STALE) return
      if (verdict === READY_EVENT.NEWER) {
        requestRoomResync()
        return
      }
      readyAggregateGenerationRef.current += 1
      applyRoomEvent(() => setPlayerReady(uuid, isReady, canStart, readyRevision))
      playRoomSfx('room-ready-changed', sfxEvent)
    }
    const handleRoomDeleted = () => {
      if (!isCurrentSource()) return
      applyVerifiedRoom(clearRoom)
      onRoomDeleted?.()
    }
    const handleGameStarted = (payload) => {
      if (!isCurrentSource()) return
      clearStartState()
      const { hostUuid } = useMatchingStore.getState()
      useInGameStore.getState().setGamePayload({ ...payload, hostUuid })
      applyVerifiedRoom(clearRoom)
      onGameStarted?.(payload)

      const gameId = useInGameStore.getState().gameId
      const { user, isLoggedIn } = useAuthStore.getState()
      const accountId = isLoggedIn && user?.uuid ? user.uuid : null
      if (typeof gameId === 'string' && gameId.length > 0 && accountId !== null) {
        dispatchSfxEvent({
          kind: 'game-started',
          eventId: `game:${gameId}:started`,
          accountId,
          gameId,
          origin: payload?.sfxEvent?.origin ?? payload?.origin ?? 'live',
        })
      }
    }

    socket.on('player_joined_room', handlePlayerJoinedRoom)
    socket.on('player_left_room', handlePlayerLeftRoom)
    socket.on('host_changed', handleHostChanged)
    socket.on('player_ready_changed', handlePlayerReadyChanged)
    socket.on('room_deleted', handleRoomDeleted)
    socket.on('game_started', handleGameStarted)
    socket.on(SOCKET_EVENTS.ROOM_SETTINGS_UPDATED, handleRoomSettingsUpdated)

    return () => {
      owned = false
      socket.off('player_joined_room', handlePlayerJoinedRoom)
      socket.off('player_left_room', handlePlayerLeftRoom)
      socket.off('host_changed', handleHostChanged)
      socket.off('player_ready_changed', handlePlayerReadyChanged)
      socket.off('room_deleted', handleRoomDeleted)
      socket.off('game_started', handleGameStarted)
      socket.off(SOCKET_EVENTS.ROOM_SETTINGS_UPDATED, handleRoomSettingsUpdated)
    }
  }, [socket, roomId, roomEventGeneration, onRoomDeleted, onGameStarted])

  useEffect(() => {
    if (!socket) {
      setRoomSyncStatus('waiting_socket')
      return
    }

    if (socketIdentityRef.current.socket !== socket) {
      socketIdentityRef.current = { socket, uuid: useAuthStore.getState().user?.uuid ?? null }
    }
    const isConnectionIdentityCurrent = () =>
      socketIdentityRef.current.socket === socket
      && socketIdentityRef.current.uuid === (useAuthStore.getState().user?.uuid ?? null)

    let cancelled = false
    let retryTimer = null
    let activeSeriesId = 0
    let activeRequestVersion = 0
    let checkInFlight = false

    const markRoomStateAdvanced = () => { roomApplyGenerationRef.current += 1 }
    let hasPromptedRetry = false

    const invalidateActiveCheck = () => {
      activeSeriesId += 1
      activeRequestVersion += 1
      checkInFlight = false
      if (retryTimer !== null) {
        window.clearTimeout(retryTimer)
        retryTimer = null
      }
    }

    const invalidateActionRequests = () => {
      startRequestVersionRef.current += 1
      readyRequestVersionRef.current += 1
      settingsRequestVersionRef.current += 1
      const inFlightSave = inFlightSettingsRequestRef.current
      if (inFlightSave && mountedRef.current) {
        setPendingSettingsRequest((prev) => prev ?? inFlightSave)
        setSettingsError({
          code: ROOM_SETTINGS_ERROR_CODES.UNKNOWN,
          message: ROOM_SETTINGS_ERROR_MESSAGES.RESULT_UNKNOWN,
        })
        if (inFlightSettingsRequestRef.current === inFlightSave) {
          inFlightSettingsRequestRef.current = null
        }
      }
      roomApplyGenerationRef.current += 1
      clearStartState()
      clearReadyState()
      clearSettingsState()
    }

    const settleFailed = (seriesId) => {
      if (cancelled || seriesId !== activeSeriesId) return
      setRoomSyncStatus('failed')
      if (hasPromptedRetry) return
      hasPromptedRetry = true
      const confirmed = window.confirm('방 상태를 확인하지 못했습니다. 다시 확인하시겠습니까?')
      dispatchUiSfx(confirmed ? 'ui-confirm' : 'ui-cancel')
      if (confirmed) {
        startCheckSeries({ resetPromptState: false })
      }
    }

    const runCheckAttempt = (seriesId, retryCount) => {
      if (cancelled || seriesId !== activeSeriesId) return

      if (socket !== getSocket() || !socket.connected || !window.navigator.onLine) {
        setRoomSyncStatus('waiting_socket')
        return
      }
      if (!isConnectionIdentityCurrent()) {
        setRoomSyncStatus('waiting_socket')
        return
      }

      activeRequestVersion += 1
      const requestVersion = activeRequestVersion
      const requestSocket = socket
      const requestRoomId = useMatchingStore.getState().roomId
      const requestUuid = useAuthStore.getState().user?.uuid
      const requestApplyGeneration = roomApplyGenerationRef.current
      const requestMembership = roomMembershipGenerationRef.current

      const isStale = () =>
        cancelled ||
        requestSocket !== getSocket() ||
        seriesId !== activeSeriesId ||
        requestVersion !== activeRequestVersion ||
        !mountedRef.current ||
        useMatchingStore.getState().roomId !== requestRoomId ||
        useAuthStore.getState().user?.uuid !== requestUuid ||
        roomApplyGenerationRef.current !== requestApplyGeneration ||
        roomMembershipGenerationRef.current !== requestMembership

      checkInFlight = true
      requestSocket.timeout(CURRENT_ROOM_CHECK_TIMEOUT_MS).emitWithAck('get_current_room', {})
        .then((response) => {
          if (requestVersion === activeRequestVersion) checkInFlight = false
          if (isStale()) return

          if (!response?.ok) {
            settleFailed(seriesId)
            return
          }

          if (response.room) {
            applyVerifiedRoom(() => useMatchingStore.getState().setRoom(response.room))
            markRoomStateAdvanced()
            setRoomSyncStatus('verified')
            hasPromptedRetry = false
            return
          }

          if (response.pending) {
            if (retryCount < CURRENT_ROOM_PENDING_MAX_RETRIES) {
              retryTimer = window.setTimeout(() => {
                retryTimer = null
                runCheckAttempt(seriesId, retryCount + 1)
              }, CURRENT_ROOM_PENDING_RETRY_INTERVAL_MS)
              return
            }
            settleFailed(seriesId)
            return
          }

          if (awaitPartyRoomRejoinRef.current && !useMatchingStore.getState().isInRoom) {
            if (mountedRef.current) setRoomSyncStatus('verified')
            return
          }
          applyVerifiedRoom(() => useMatchingStore.getState().clearRoom())
          markRoomStateAdvanced()
          onRoomDeleted?.()
        })
        .catch(() => {
          if (requestVersion === activeRequestVersion) checkInFlight = false
          if (!isStale()) settleFailed(seriesId)
        })
    }

    const startCheckSeries = ({ resetPromptState }) => {
      if (retryTimer !== null) {
        window.clearTimeout(retryTimer)
        retryTimer = null
      }
      activeSeriesId += 1
      if (resetPromptState) hasPromptedRetry = false
      setRoomSyncStatus('checking')
      runCheckAttempt(activeSeriesId, 0)
    }

    bumpRoomApplyGenerationRef.current = () => {
      roomApplyGenerationRef.current += 1
      if (!cancelled && checkInFlight) startCheckSeries({ resetPromptState: false })
    }
    requestRoomResyncRef.current = () => {
      if (cancelled) return
      roomApplyGenerationRef.current += 1
      startCheckSeries({ resetPromptState: false })
    }
    invalidateRoomVerificationRef.current = () => {
      if (cancelled) return
      roomApplyGenerationRef.current += 1
      startCheckSeries({ resetPromptState: false })
    }

    if (socket.connected) {
      startCheckSeries({ resetPromptState: true })
    } else {
      setRoomSyncStatus('waiting_socket')
    }

    const handleConnect = () => startCheckSeries({ resetPromptState: true })
    const handleDisconnect = () => {
      invalidateActiveCheck()
      invalidateActionRequests()
      setRoomSyncStatus('waiting_socket')
    }
    const handleBrowserOffline = () => {
      invalidateActiveCheck()
      invalidateActionRequests()
      setRoomSyncStatus('waiting_socket')
    }
    const handleBrowserOnline = () => {
      if (cancelled) return
      if (socket !== getSocket()) return
      if (socket.connected) startCheckSeries({ resetPromptState: true })
    }
    socket.on('connect', handleConnect)
    socket.on('disconnect', handleDisconnect)
    window.addEventListener('offline', handleBrowserOffline)
    window.addEventListener('online', handleBrowserOnline)

    return () => {
      cancelled = true
      bumpRoomApplyGenerationRef.current = null
      requestRoomResyncRef.current = null
      invalidateRoomVerificationRef.current = null
      invalidateActiveCheck()
      invalidateActionRequests()
      socket.off('connect', handleConnect)
      socket.off('disconnect', handleDisconnect)
      window.removeEventListener('offline', handleBrowserOffline)
      window.removeEventListener('online', handleBrowserOnline)
    }
  }, [socket, onRoomDeleted])

  useEffect(() => {
    const unsubscribe = useAuthStore.subscribe((state, prevState) => {
      const nextUuid = state?.user?.uuid ?? null
      const prevUuid = prevState?.user?.uuid ?? null
      if (nextUuid === prevUuid) return
      roomApplyGenerationRef.current += 1
      roomMembershipGenerationRef.current += 1
      setRoomEventGeneration(roomMembershipGenerationRef.current)
      settingsRequestVersionRef.current += 1
      inFlightSettingsRequestRef.current = null
      clearSettingsState()
      startRequestVersionRef.current += 1
      readyRequestVersionRef.current += 1
      clearStartState()
      clearReadyState()
      if (!mountedRef.current) return
      setPendingSettingsRequest(null)
      setSettingsError(null)
      setSettingsResultNotice(null)
      applyVerifiedRoom(() => useMatchingStore.getState().clearRoom())

      if (invalidateRoomVerificationRef.current) invalidateRoomVerificationRef.current()
      else setRoomSyncStatus('waiting_socket')
    })
    return () => unsubscribe?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const unsubscribe = useMatchingStore.subscribe((state, prevState) => {
      if (state.roomId === prevState.roomId) return
      roomMembershipGenerationRef.current += 1
      setRoomEventGeneration(roomMembershipGenerationRef.current)
      settingsRequestVersionRef.current += 1
      inFlightSettingsRequestRef.current = null
      clearSettingsState()
      startRequestVersionRef.current += 1
      readyRequestVersionRef.current += 1
      clearStartState()
      clearReadyState()
      if (!mountedRef.current) return
      setPendingSettingsRequest((prev) => (prev && prev.roomId !== state.roomId ? null : prev))
      setSettingsResultNotice(null)

      if (applyingVerifiedRoomRef.current) return
      if (invalidateRoomVerificationRef.current) invalidateRoomVerificationRef.current()
      else setRoomSyncStatus('waiting_socket')
    })
    return () => unsubscribe?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const isRoomVerified = roomSyncStatus === 'verified'

  const deleteRoom = () => getSocket()?.emit('delete_room')

  const startGame = async () => {
    if (isStartingRef.current) return
    const socket = getSocket()
    if (!socket || !socket.connected || !window.navigator.onLine) {
      setStartBlockedMessage(SOCKET_UNAVAILABLE_MESSAGE)
      return
    }
    if (roomSyncStatus !== 'verified') {
      setStartBlockedMessage(GAME_START_MESSAGES.ROOM_SYNC_PENDING)
      return
    }

    startRequestVersionRef.current += 1
    const requestVersion = startRequestVersionRef.current
    const requestSocket = socket
    const { roomId: requestRoomId, settingsVersion: requestSettingsVersion } = useMatchingStore.getState()
    const requestUuid = useAuthStore.getState().user?.uuid
    const requestMembership = roomMembershipGenerationRef.current
    if (!requestRoomId || !Number.isSafeInteger(requestSettingsVersion)) {
      setStartBlockedMessage(GAME_START_MESSAGES.ROOM_SYNC_PENDING)
      return
    }
    const isStaleResponse = () => {
      if (!mountedRef.current) return true
      if (requestVersion !== startRequestVersionRef.current) return true
      if (requestMembership !== roomMembershipGenerationRef.current) return true
      if (requestSocket !== getSocket()) return true
      if (!requestSocket.connected) return true
      if (!window.navigator.onLine) return true
      const current = useMatchingStore.getState()
      if (!current.isInRoom || current.roomId !== requestRoomId) return true
      if (useAuthStore.getState().user?.uuid !== requestUuid) return true
      return false
    }

    isStartingRef.current = true
    setIsStarting(true)
    try {
      const response = await socket.timeout(START_GAME_TIMEOUT_MS).emitWithAck('start_game', {
        roomId: requestRoomId,
        expectedSettingsVersion: requestSettingsVersion,
      })
      if (isStaleResponse()) return

      if (!response?.ok) {
        if (response?.code === 'ROOM_STATE_CHANGED') requestRoomResync()
        setStartBlockedMessage(response?.message ?? GAME_START_MESSAGES.FALLBACK)
      }
    } catch {
      if (!isStaleResponse()) setStartBlockedMessage(GAME_START_MESSAGES.REQUEST_TIMEOUT)
    } finally {
      if (requestVersion === startRequestVersionRef.current
        && requestMembership === roomMembershipGenerationRef.current) {
        clearStartState()
      }
    }
  }

  const setReady = async (isReady) => {
    if (isSettingReadyRef.current) return
    const socket = getSocket()
    if (!socket || !socket.connected || !window.navigator.onLine) {
      alert(SOCKET_UNAVAILABLE_MESSAGE)
      return
    }
    if (roomSyncStatus !== 'verified') {
      alert('현재 방 상태를 확인하고 있습니다. 잠시 후 다시 시도해주세요.')
      return
    }

    readyRequestVersionRef.current += 1
    const requestVersion = readyRequestVersionRef.current
    const requestSocket = socket
    const { roomId: requestRoomId, settingsVersion: requestSettingsVersion } = useMatchingStore.getState()
    const requestUuid = useAuthStore.getState().user?.uuid
    const requestMembership = roomMembershipGenerationRef.current
    const requestReadyAggregate = readyAggregateGenerationRef.current
    if (!requestRoomId || !Number.isSafeInteger(requestSettingsVersion)) {
      alert('현재 방 상태를 확인하고 있습니다. 잠시 후 다시 시도해주세요.')
      return
    }
    const isStaleResponse = () => {
      if (!mountedRef.current) return true
      if (requestVersion !== readyRequestVersionRef.current) return true
      if (requestMembership !== roomMembershipGenerationRef.current) return true
      if (requestSocket !== getSocket()) return true
      if (!requestSocket.connected) return true
      if (!window.navigator.onLine) return true
      const current = useMatchingStore.getState()
      if (!current.isInRoom || current.roomId !== requestRoomId) return true
      if (useAuthStore.getState().user?.uuid !== requestUuid) return true
      return false
    }

    isSettingReadyRef.current = true
    setIsSettingReady(true)
    try {
      const response = await socket.timeout(SET_READY_TIMEOUT_MS).emitWithAck('set_ready', {
        isReady,
        roomId: requestRoomId,
        expectedSettingsVersion: requestSettingsVersion,
      })
      if (isStaleResponse()) return

      if (response?.ok) {
        const current = useMatchingStore.getState()
        if (response.roomId !== undefined && response.roomId !== current.roomId) return
        const verdict = classifyReadyEvent(current, requestUuid, {
          settingsVersion: response.settingsVersion, readyRevision: response.readyRevision,
        })
        if (verdict === READY_EVENT.STALE) return
        if (verdict === READY_EVENT.NEWER) {
          requestRoomResync()
          return
        }
        const roomWideFresh = readyAggregateGenerationRef.current === requestReadyAggregate
        current.setPlayerReady(
          requestUuid,
          response.isReady,
          roomWideFresh ? response.canStart : undefined,
          response.readyRevision,
        )
        if (roomWideFresh) {
          bumpRoomApplyGeneration()
        } else {
          requestRoomResync()
        }
        playRoomSfx('room-ready-changed', response.sfxEvent)
      } else if (response?.code === ROOM_SETTINGS_ERROR_CODES.SETTINGS_VERSION_CONFLICT) {
        requestRoomResync()
        alert(response.message ?? '방 설정이 변경되었습니다. 최신 설정을 확인해주세요.')
      } else {
        alert(response?.message ?? '준비 상태를 변경하지 못했습니다.')
      }
    } catch {
      if (!isStaleResponse()) alert('준비 상태를 변경하지 못했습니다. 잠시 후 다시 시도해주세요.')
    } finally {
      if (requestVersion === readyRequestVersionRef.current
        && requestMembership === roomMembershipGenerationRef.current) {
        clearReadyState()
      }
    }
  }

  const createSettingsRequestId = () => {
    const random = globalThis.crypto?.randomUUID?.()
    return random ?? `rs-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  }

  const saveRoomSettings = async (formState) => {
    if (isSavingSettingsRef.current) return { ok: false, code: 'BUSY' }
    const socket = getSocket()
    if (!socket || !socket.connected || !window.navigator.onLine) {
      alert(SOCKET_UNAVAILABLE_MESSAGE)
      return { ok: false, code: 'OFFLINE' }
    }
    if (roomSyncStatus !== 'verified') {
      alert('현재 방 상태를 확인하고 있습니다. 잠시 후 다시 시도해주세요.')
      return { ok: false, code: 'NOT_VERIFIED' }
    }
    if (pendingSettingsRequest) {
      alert(ROOM_SETTINGS_ERROR_MESSAGES.RESULT_UNKNOWN)
      return { ok: false, code: ROOM_SETTINGS_ERROR_CODES.UNKNOWN }
    }

    const { roomId: requestRoomId, settingsVersion, hostUuid } = useMatchingStore.getState()
    const requestUuid = useAuthStore.getState().user?.uuid
    if (!requestRoomId || !Number.isSafeInteger(settingsVersion) || hostUuid !== requestUuid) {
      return { ok: false, code: ROOM_SETTINGS_ERROR_CODES.NOT_HOST }
    }

    const requestId = createSettingsRequestId()
    const payload = buildUpdateRoomSettingsPayload({
      ...formState,
      roomId: requestRoomId,
      requestId,
      expectedSettingsVersion: settingsVersion,
    })

    settingsRequestVersionRef.current += 1
    const requestVersion = settingsRequestVersionRef.current
    const requestSocket = socket
    const requestMembership = roomMembershipGenerationRef.current
    const requestApplyGeneration = roomApplyGenerationRef.current
    inFlightSettingsRequestRef.current = { roomId: requestRoomId, requestId }
    const isStaleResponse = () => {
      if (!mountedRef.current) return true
      if (requestVersion !== settingsRequestVersionRef.current) return true
      if (requestSocket !== getSocket()) return true
      if (useAuthStore.getState().user?.uuid !== requestUuid) return true
      if (requestMembership !== roomMembershipGenerationRef.current) return true
      if (useMatchingStore.getState().roomId !== requestRoomId) return true
      return false
    }
    const isRoomSnapshotFresh = () => roomApplyGenerationRef.current === requestApplyGeneration

    isSavingSettingsRef.current = true
    setIsSavingSettings(true)
    setSettingsError(null)
    setSettingsResultNotice(null)
    try {
      const response = await requestSocket
        .timeout(UPDATE_ROOM_SETTINGS_TIMEOUT_MS)
        .emitWithAck(SOCKET_EVENTS.UPDATE_ROOM_SETTINGS, payload)
      if (isStaleResponse()) return { ok: false, code: 'STALE' }

      if (mountedRef.current) {
        setPendingSettingsRequest((prev) => (prev?.requestId === requestId ? null : prev))
      }

      if (response?.ok) {
        if (Number.isSafeInteger(response.settingsVersion)) {
          const current = useMatchingStore.getState()
          if (current.roomId === requestRoomId && (current.settingsVersion ?? 0) < response.settingsVersion) {
            requestRoomResync()
          }
        }
        return { ok: true, changed: response.changed === true }
      }

      if (response?.room && isRoomSnapshotFresh()
        && useMatchingStore.getState().roomId === response.room.roomId) {
        useMatchingStore.getState().setRoom(response.room)
        bumpRoomApplyGeneration()
      } else if (revealsNewerSettingsVersion(response?.room)) {
        requestRoomResync()
      }
      setSettingsError({ code: response?.code ?? ROOM_SETTINGS_ERROR_CODES.INTERNAL_ERROR, message: response?.message })
      return { ok: false, code: response?.code }
    } catch {
      if (!isStaleResponse()) {
        setPendingSettingsRequest({ roomId: requestRoomId, requestId })
        setSettingsError({ code: ROOM_SETTINGS_ERROR_CODES.UNKNOWN, message: ROOM_SETTINGS_ERROR_MESSAGES.RESULT_UNKNOWN })
      }
      return { ok: false, code: ROOM_SETTINGS_ERROR_CODES.UNKNOWN }
    } finally {
      if (inFlightSettingsRequestRef.current?.requestId === requestId) {
        inFlightSettingsRequestRef.current = null
      }
      if (requestVersion === settingsRequestVersionRef.current) clearSettingsState()
    }
  }

  const verifyRoomSettingsResult = async () => {
    const pending = pendingSettingsRequest
    if (!pending) return { ok: false, code: 'NO_PENDING' }
    const socket = getSocket()
    if (!socket || !socket.connected || !window.navigator.onLine) {
      alert(SOCKET_UNAVAILABLE_MESSAGE)
      return { ok: false, code: 'OFFLINE' }
    }

    const requestUuid = useAuthStore.getState().user?.uuid
    settingsRequestVersionRef.current += 1
    const requestVersion = settingsRequestVersionRef.current
    const requestSocket = socket
    const requestMembership = roomMembershipGenerationRef.current
    const requestApplyGeneration = roomApplyGenerationRef.current
    const isStaleResponse = () =>
      !mountedRef.current
      || requestVersion !== settingsRequestVersionRef.current
      || requestSocket !== getSocket()
      || useAuthStore.getState().user?.uuid !== requestUuid
      || requestMembership !== roomMembershipGenerationRef.current
    const isRoomSnapshotFresh = () => roomApplyGenerationRef.current === requestApplyGeneration

    isSavingSettingsRef.current = true
    setIsSavingSettings(true)
    try {
      const response = await requestSocket
        .timeout(ROOM_SETTINGS_RESULT_TIMEOUT_MS)
        .emitWithAck(SOCKET_EVENTS.GET_ROOM_SETTINGS_UPDATE_RESULT, pending)
      if (isStaleResponse()) return { ok: false, code: 'STALE' }
      if (!response?.ok) return { ok: false, code: response?.code ?? ROOM_SETTINGS_ERROR_CODES.UNKNOWN }

      const appliedAuthoritativeRoom = Boolean(response.room) && isRoomSnapshotFresh()
        && response.room.roomId === useMatchingStore.getState().roomId
      if (appliedAuthoritativeRoom) {
        useMatchingStore.getState().setRoom(response.room)
        bumpRoomApplyGeneration()
      }

      if (response.status === 'UNKNOWN') {
        setSettingsError(null)
        setPendingSettingsRequest(null)
        setSettingsResultNotice(ROOM_SETTINGS_ERROR_MESSAGES.RESULT_UNRESOLVED)
        requestRoomResync()
        return { ok: true, status: 'UNKNOWN' }
      }

      setPendingSettingsRequest(null)
      setSettingsError(null)
      setSettingsResultNotice(null)

      if (!appliedAuthoritativeRoom
        && (!response.room || isRoomSnapshotFresh() || revealsNewerSettingsVersion(response.room))) {
        requestRoomResync()
      }
      return { ok: true, status: response.status, settingsVersion: response.settingsVersion }
    } catch {
      if (!isStaleResponse()) {
        setSettingsError({ code: ROOM_SETTINGS_ERROR_CODES.UNKNOWN, message: ROOM_SETTINGS_ERROR_MESSAGES.RESULT_UNKNOWN })
      }
      return { ok: false, code: ROOM_SETTINGS_ERROR_CODES.UNKNOWN }
    } finally {
      if (requestVersion === settingsRequestVersionRef.current) clearSettingsState()
    }
  }

  return {
    deleteRoom,
    startGame,
    setReady,
    isStarting,
    isSettingReady,
    isRoomVerified,
    saveRoomSettings,
    verifyRoomSettingsResult,
    isSavingSettings,
    hasPendingSettingsResult: pendingSettingsRequest !== null,
    settingsError,
    settingsResultNotice,
    dismissSettingsResultNotice: () => setSettingsResultNotice(null),
    startBlockedMessage,
    dismissStartBlockedMessage: () => setStartBlockedMessage(null),
  }
}
