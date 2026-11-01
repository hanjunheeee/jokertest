// 전체 화면 켬·끔 상태와 바꾸는 함수
// settings 일반 탭이 씀
import { useCallback, useEffect, useState } from "react"

// 전체 화면인 요소가 있으면 켜짐
function readIsFullscreen() {
  return Boolean(document.fullscreenElement)
}

// Esc 등 바깥에서 바뀐 것도 fullscreenchange로 따라감
export function useFullscreen() {
  const [isFullscreen, setIsFullscreen] = useState(readIsFullscreen)

  useEffect(() => {
    const sync = () => setIsFullscreen(readIsFullscreen())
    document.addEventListener("fullscreenchange", sync)
    return () => document.removeEventListener("fullscreenchange", sync)
  }, [])

  // 이미 그 상태면 안 바꿈, 브라우저가 거절하면 실제 상태로 되돌림
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

  // 전체 화면 아닐 땐 아무것도 안 함
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
