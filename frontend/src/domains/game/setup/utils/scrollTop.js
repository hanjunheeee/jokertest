// 스크롤 위치 계산·부드러운 스크롤 (DOM만 다룸, 앱 상태는 안 건드림)
// hooks/useSetupContentScrollOnRoleModeChange가 씀

// 끝으로 갈수록 느려지는 움직임
export function easeOutCubic(progress) {
  return 1 - (1 - progress) ** 3
}

// 스크롤 가능한 범위 안으로 자름
export function clampScrollTop(container, scrollTop) {
  const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight)
  return Math.min(Math.max(0, scrollTop), maxScrollTop)
}

// 내용이 줄어 범위를 벗어난 스크롤 위치를 바로잡음
export function clampContentScroll(container) {
  container.scrollTop = clampScrollTop(container, container.scrollTop)
}

// 요소가 스크롤 영역 안에서 어디 있는지 (스크롤 위치 기준)
export function offsetIn(container, element) {
  const containerRect = container.getBoundingClientRect()
  const elementRect = element.getBoundingClientRect()
  return {
    top: container.scrollTop + (elementRect.top - containerRect.top),
    bottom: container.scrollTop + (elementRect.bottom - containerRect.top),
    height: elementRect.height,
  }
}

// targetTop까지 부드럽게 스크롤, 멈추는 함수 돌려줌 (거의 같은 위치면 바로 옮김)
export function animateScrollTop(container, targetTop, duration) {
  const startTop = container.scrollTop
  const delta = targetTop - startTop

  if (Math.abs(delta) < 1) {
    container.scrollTop = targetTop
    return () => {}
  }

  const startTime = performance.now()
  let frameId = 0

  // 한 프레임: 진행 비율만큼 옮기고 끝 아니면 다음 프레임
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
