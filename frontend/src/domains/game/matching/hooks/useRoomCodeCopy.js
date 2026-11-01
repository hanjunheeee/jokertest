// 방코드 복사 버튼 상태: 복사됨 표시·오류 문구·복사 결과 표시
// components/RoomCodeViewModal이 씀
// 모달이 다시 열리거나 코드·계정·소켓이 바뀌면 남은 복사 표시를 지움 (다른 방 코드를 복사한 것처럼 보이지 않게)
import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import { useAuthStore } from "../../../auth/store/auth.store.js"
import { getSocket, subscribeSocket } from "../../../../shared/socket/socketClient.js"
import {
  ROOM_CODE_COPY_ERRORS,
  ROOM_CODE_COPY_RESULTS,
  resolveRoomCodeCopy,
  resolveRoomCodeCopyStatus,
} from "../../shared/utils/roomCode.js"

// 복사됨 표시 유지 시간
const COPIED_MS = 2000

export function useRoomCodeCopy({ open, displayRoomCode, onClose }) {
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState("")
  const [copyStatus, setCopyStatus] = useState("")
  const timerRef = useRef(null)
  const genRef = useRef(0)

  const authUuid = useAuthStore((s) => s.user?.uuid ?? null)
  const identityGeneration = useAuthStore((s) => s.identityGeneration ?? null)
  const socket = useSyncExternalStore(subscribeSocket, getSocket, getSocket)
  const socketId = socket?.id ?? null

  const clearTimer = () => {
    if (!timerRef.current) return
    window.clearTimeout(timerRef.current)
    timerRef.current = null
  }

  // 세대 올려서 진행 중 복사 결과를 버리고 표시 지움
  const reset = () => {
    genRef.current += 1
    clearTimer()
    setCopied(false)
    setCopyError("")
    setCopyStatus("")
  }

  useEffect(() => {
    reset()
    return () => {
      genRef.current += 1
      clearTimer()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, displayRoomCode, authUuid, identityGeneration, socket, socketId])

  const handleClose = () => {
    reset()
    onClose()
  }

  const handleCopy = async () => {
    // 복사할 수 없는 코드면 이유만 표시
    const outcome = resolveRoomCodeCopy(displayRoomCode)

    if (!outcome.ok) {
      reset()
      setCopyError(outcome.error)
      setCopyStatus(resolveRoomCodeCopyStatus(displayRoomCode))
      return
    }

    reset()
    const gen = genRef.current

    // 클립보드 결과가 올 때 그사이 표시가 지워졌으면 반영 안 함
    try {
      await navigator.clipboard.writeText(outcome.value)
      if (genRef.current !== gen) return
      setCopied(true)
      setCopyError("")
      setCopyStatus(ROOM_CODE_COPY_RESULTS.COPY_SUCCEEDED)
      timerRef.current = window.setTimeout(() => {
        if (genRef.current !== gen) return
        setCopied(false)
        timerRef.current = null
      }, COPIED_MS)
    } catch {
      if (genRef.current !== gen) return
      setCopied(false)
      setCopyError(ROOM_CODE_COPY_ERRORS.CLIPBOARD_FAILED)
      setCopyStatus(ROOM_CODE_COPY_RESULTS.CLIPBOARD_FAILED)
    }
  }

  return { copied, copyError, copyStatus, handleClose, handleCopy }
}
