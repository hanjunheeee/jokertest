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
