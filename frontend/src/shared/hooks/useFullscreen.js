// 파일 역할: useFullscreen.js - React 상태와 부수효과를 묶는 커스텀 훅입니다.
import { useCallback, useEffect, useState } from "react"

function readIsFullscreen() {
  return Boolean(document.fullscreenElement)
}

/** 브라우저 전체화면(F11) — document.documentElement 기준 */
export function useFullscreen() {
  const [isFullscreen, setIsFullscreen] = useState(readIsFullscreen)

  useEffect(() => {
    const sync = () => setIsFullscreen(readIsFullscreen())
    document.addEventListener("fullscreenchange", sync)
    return () => document.removeEventListener("fullscreenchange", sync)
  }, [])

  const setFullscreen = useCallback(async (next) => {
    try {
      if (next) {
        if (!document.fullscreenElement) {
          await document.documentElement.requestFullscreen()
        }
      } else if (document.fullscreenElement) {
        await document.exitFullscreen()
      }
    } catch {
      setIsFullscreen(readIsFullscreen())
    }
  }, [])

  const exitFullscreen = useCallback(async () => {
    if (!document.fullscreenElement) return
    try {
      await document.exitFullscreen()
    } catch {
      setIsFullscreen(readIsFullscreen())
    }
  }, [])

  return { isFullscreen, setFullscreen, exitFullscreen }
}
