// 직업 구성 방식(자동·직접)을 바꾸면 설정 본문을 그 구역이 보이게 스크롤
// components/GameSetupPanel이 씀, 처음 그릴 때와 다른 탭일 때는 스크롤 위치만 바로잡음
import { useLayoutEffect, useRef } from "react"
import { animateScrollTop, clampContentScroll, clampScrollTop, offsetIn } from "../utils/scrollTop.js"

const SCROLL_MS = 240
// 아래 버튼 줄에 가리지 않게 남기는 여백
const SAFE_BOTTOM_PX = 220

// 스크롤 목표: 요약 줄이 있으면 요약이 보이게, 없으면 구역 전체(넘치면 구역 끝)가 보이게
function roleSectionTop(container) {
  const section = container.querySelector("[data-setup-role-composition]")
  if (!section) return container.scrollTop

  const summary = section.querySelector("[data-setup-role-composition-summary]")
  const sectionMetrics = offsetIn(container, section)
  const viewportHeight = container.clientHeight

  if (summary) {
    const summaryMetrics = offsetIn(container, summary)
    const scrollForSummary =
      summaryMetrics.bottom - viewportHeight + SAFE_BOTTOM_PX

    return clampScrollTop(container, scrollForSummary)
  }

  const visibleHeight = Math.max(0, viewportHeight - SAFE_BOTTOM_PX)
  if (sectionMetrics.height <= visibleHeight) {
    return clampScrollTop(container, sectionMetrics.top)
  }

  return clampScrollTop(container, sectionMetrics.top + sectionMetrics.height - visibleHeight)
}

export function useSetupContentScrollOnRoleModeChange(containerRef, roleMode, activeTab) {
  const prevModeRef = useRef(roleMode)
  const skipFirstRef = useRef(true)
  const cancelRef = useRef(null)

  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return

    // 하던 스크롤 멈춤
    cancelRef.current?.()
    cancelRef.current = null

    // 처음 그릴 땐 스크롤 안 함
    if (skipFirstRef.current) {
      skipFirstRef.current = false
      prevModeRef.current = roleMode
      clampContentScroll(container)
      return
    }

    const modeChanged = prevModeRef.current !== roleMode
    prevModeRef.current = roleMode

    // 일반 탭에서 방식이 바뀌었으면 다음 프레임(바뀐 내용 그린 뒤)에 스크롤
    if (modeChanged && activeTab === "general") {
      const frameId = requestAnimationFrame(() => {
        const targetTop = roleSectionTop(container)
        cancelRef.current = animateScrollTop(container, targetTop, SCROLL_MS)
      })

      return () => {
        cancelAnimationFrame(frameId)
        cancelRef.current?.()
        cancelRef.current = null
      }
    }

    clampContentScroll(container)

    return () => {
      cancelRef.current?.()
      cancelRef.current = null
    }
  }, [containerRef, roleMode, activeTab])
}
