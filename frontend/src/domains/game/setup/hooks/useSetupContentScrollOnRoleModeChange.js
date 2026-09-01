import { useLayoutEffect, useRef } from "react"

const ROLE_MODE_SCROLL_DURATION_MS = 240
/** summary가 프레임 안에 들어오도록 — 값을 키울수록 더 아래로 스크롤 (92px보다 아래) */
const ROLE_MODE_SCROLL_SAFE_BOTTOM_PX = 220

function easeOutCubic(progress) {
  return 1 - (1 - progress) ** 3
}

function clampScrollTop(container, scrollTop) {
  const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight)
  return Math.min(Math.max(0, scrollTop), maxScrollTop)
}

function clampSetupContentScrollTop(container) {
  container.scrollTop = clampScrollTop(container, container.scrollTop)
}

function getScrollOffsetWithinContainer(container, element) {
  const containerRect = container.getBoundingClientRect()
  const elementRect = element.getBoundingClientRect()
  return {
    top: container.scrollTop + (elementRect.top - containerRect.top),
    bottom: container.scrollTop + (elementRect.bottom - containerRect.top),
    height: elementRect.height,
  }
}

function getRoleCompositionScrollTop(container) {
  const section = container.querySelector("[data-setup-role-composition]")
  if (!section) return container.scrollTop

  const summary = section.querySelector("[data-setup-role-composition-summary]")
  const sectionMetrics = getScrollOffsetWithinContainer(container, section)
  const viewportHeight = container.clientHeight

  if (summary) {
    const summaryMetrics = getScrollOffsetWithinContainer(container, summary)
    const scrollForSummary =
      summaryMetrics.bottom - viewportHeight + ROLE_MODE_SCROLL_SAFE_BOTTOM_PX

    return clampScrollTop(container, scrollForSummary)
  }

  const visibleHeight = Math.max(0, viewportHeight - ROLE_MODE_SCROLL_SAFE_BOTTOM_PX)
  if (sectionMetrics.height <= visibleHeight) {
    return clampScrollTop(container, sectionMetrics.top)
  }

  return clampScrollTop(container, sectionMetrics.top + sectionMetrics.height - visibleHeight)
}

function animateScrollTop(container, targetTop, duration = ROLE_MODE_SCROLL_DURATION_MS) {
  const startTop = container.scrollTop
  const delta = targetTop - startTop

  if (Math.abs(delta) < 1) {
    container.scrollTop = targetTop
    return () => {}
  }

  const startTime = performance.now()
  let frameId = 0

  const step = (now) => {
    const progress = Math.min(1, (now - startTime) / duration)
    container.scrollTop = startTop + delta * easeOutCubic(progress)

    if (progress < 1) {
      frameId = requestAnimationFrame(step)
      return
    }

    container.scrollTop = targetTop
  }

  frameId = requestAnimationFrame(step)

  return () => {
    cancelAnimationFrame(frameId)
  }
}

/**
 * 역할 구성(AUTO ↔ CUSTOM) 전환 시 설정 목록 스크롤을 역할 구성 구역으로 맞추고,
 * 높이가 줄어든 뒤 scrollTop이 범위를 벗어나지 않게 clamp합니다.
 */
export function useSetupContentScrollOnRoleModeChange(containerRef, roleMode, activeTab) {
  const prevRoleModeRef = useRef(roleMode)
  const skipInitialRef = useRef(true)
  const cancelScrollRef = useRef(null)

  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return

    cancelScrollRef.current?.()
    cancelScrollRef.current = null

    if (skipInitialRef.current) {
      skipInitialRef.current = false
      prevRoleModeRef.current = roleMode
      clampSetupContentScrollTop(container)
      return
    }

    const modeChanged = prevRoleModeRef.current !== roleMode
    prevRoleModeRef.current = roleMode

    if (modeChanged && activeTab === "general") {
      const frameId = requestAnimationFrame(() => {
        const targetTop = getRoleCompositionScrollTop(container)
        cancelScrollRef.current = animateScrollTop(container, targetTop)
      })

      return () => {
        cancelAnimationFrame(frameId)
        cancelScrollRef.current?.()
        cancelScrollRef.current = null
      }
    }

    clampSetupContentScrollTop(container)

    return () => {
      cancelScrollRef.current?.()
      cancelScrollRef.current = null
    }
  }, [containerRef, roleMode, activeTab])
}
