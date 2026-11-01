// 대기방 훅들이 같이 쓰는 상태·ref 묶음(ctx)과 그 상태를 지우는 도우미
// hooks/room 아래 훅이 이 묶음을 받아 씀
// 요청 버전·방 반영 세대·소속 세대를 한곳에 둬서 연결 끊김·계정 바뀜·방 바뀜 때 한꺼번에 무효화하기 쉽게 함
import { useEffect, useRef, useState } from 'react'
import {
  ROOM_SETTINGS_ERROR_CODES,
  ROOM_SETTINGS_ERROR_MESSAGES,
} from '@/domains/game/shared/constants/gameSetupSocket.js'

export function useRoomCore({ endedGameId, awaitPartyRoomRejoin }) {
  // 방 확인 상태: waiting_socket / checking / verified / failed
  const [syncStatus, setSyncStatus] = useState('waiting_socket')

  // 시작·준비 요청 중 표시 (ref는 연타 막기, state는 화면 표시)
  const [isStarting, setIsStarting] = useState(false)
  const [isSettingReady, setIsSettingReady] = useState(false)
  const startingRef = useRef(false)
  const readyingRef = useRef(false)
  const mountedRef = useRef(true)

  // 끝난 판 id·파티 방 기다림 여부는 매 렌더 최신값으로 덮음 (효과 안에서 최신값 읽기)
  const endedIdRef = useRef(endedGameId)
  endedIdRef.current = endedGameId
  const awaitPartyRef = useRef(awaitPartyRoomRejoin)
  awaitPartyRef.current = awaitPartyRoomRejoin
  const partyBusyRef = useRef(false)

  // 요청 버전: 올리면 그 전 요청의 응답은 버림
  const startVerRef = useRef(0)
  const readyVerRef = useRef(0)
  const settingsVerRef = useRef(0)

  // 설정 저장 상태 (pending = 응답 못 받아 결과 확인이 필요한 요청)
  const [isSaving, setIsSaving] = useState(false)
  const savingRef = useRef(false)
  const [pending, setPending] = useState(null)
  const [settingsError, setSettingsError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [startBlocked, setStartBlocked] = useState(null)
  const inFlightRef = useRef(null)

  // 방 반영 세대: 방 확인 응답이 오기 전에 다른 반영이 끼면 그 응답은 버림
  // 확인 훅이 살아 있으면 그 훅 함수를 부르고(확인 다시 시작), 없으면 세대만 올림
  const applyGenRef = useRef(0)
  const bumpRef = useRef(null)
  const resyncRef = useRef(null)
  const resync = () => {
    if (resyncRef.current) resyncRef.current()
    else applyGenRef.current += 1
  }
  const bump = () => {
    if (bumpRef.current) bumpRef.current()
    else applyGenRef.current += 1
  }

  // 소속 세대: 계정·방이 바뀌면 올림, 이벤트 구독도 다시 붙임
  const memberGenRef = useRef(0)
  const [eventGen, setEventGen] = useState(0)

  // 방 전체 준비 집계가 바뀐 횟수 (준비 응답의 canStart를 믿어도 되는지 보기)
  const readyAggRef = useRef(0)

  // 방 확인을 시작한 소켓·계정
  const identityRef = useRef({ socket: null, uuid: null })

  // 확인된 방을 넣는 중에는 방 바뀜 구독이 확인을 다시 시작하지 않게 표시
  const applyingRef = useRef(false)
  const applyVerified = (apply) => {
    applyingRef.current = true
    try { apply() } finally { applyingRef.current = false }
  }
  const invalidateRef = useRef(null)

  // 요청 중 표시 끄기 (화면이 살아 있을 때만 state 바꿈)
  const clearStart = () => {
    startingRef.current = false
    if (mountedRef.current) setIsStarting(false)
  }
  const clearReady = () => {
    readyingRef.current = false
    if (mountedRef.current) setIsSettingReady(false)
  }
  const clearSaving = () => {
    savingRef.current = false
    if (mountedRef.current) setIsSaving(false)
  }

  // 연결이 끊기면 보낸 요청을 모두 무효로 함
  // 저장 요청이 날아가던 중이면 결과 확인이 필요하다고 표시
  const dropRequests = () => {
    startVerRef.current += 1
    readyVerRef.current += 1
    settingsVerRef.current += 1
    const inFlightSave = inFlightRef.current
    if (inFlightSave && mountedRef.current) {
      setPending((prev) => prev ?? inFlightSave)
      setSettingsError({
        code: ROOM_SETTINGS_ERROR_CODES.UNKNOWN,
        message: ROOM_SETTINGS_ERROR_MESSAGES.RESULT_UNKNOWN,
      })
      if (inFlightRef.current === inFlightSave) {
        inFlightRef.current = null
      }
    }
    applyGenRef.current += 1
    clearStart()
    clearReady()
    clearSaving()
  }

  // 화면이 살아 있는지 표시, 떠날 때 시작 요청 표시 지움
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      clearStart()
    }
  }, [])

  return {
    syncStatus, setSyncStatus,
    isStarting, setIsStarting, startingRef,
    isSettingReady, setIsSettingReady, readyingRef,
    mountedRef,
    endedIdRef, awaitPartyRef, partyBusyRef,
    startVerRef, readyVerRef, settingsVerRef,
    isSaving, setIsSaving, savingRef,
    pending, setPending,
    settingsError, setSettingsError,
    notice, setNotice,
    startBlocked, setStartBlocked,
    inFlightRef,
    applyGenRef, bumpRef, resyncRef, resync, bump,
    memberGenRef, eventGen, setEventGen,
    readyAggRef,
    identityRef,
    applyingRef, applyVerified, invalidateRef,
    clearStart, clearReady, clearSaving, dropRequests,
  }
}
