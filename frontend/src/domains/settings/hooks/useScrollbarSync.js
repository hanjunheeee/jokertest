import { useCallback, useLayoutEffect, useRef, useState } from "react"

/**
 * 설정 목록 내 [data-setting-row] 항목들의 영역(top, height)을 측정합니다.
 * 항목이 없으면 null을 반환합니다.
 */
function measureSettingRows(listEl) {
  const rows = listEl.querySelectorAll("[data-setting-row]")
  if (!rows.length) return null

  const wrapRect = listEl.getBoundingClientRect()
  const firstRect = rows[0].getBoundingClientRect()
  const lastRect = rows[rows.length - 1].getBoundingClientRect()

  return {
    top: firstRect.top - wrapRect.top, // 래퍼 기준 상단 오프셋
    height: lastRect.bottom - firstRect.top, // 첫 행 상단 ~ 마지막 행 하단
  }
}

/**
 * 커스텀 스크롤바 위치·높이 동기화 훅.
 *
 * 설정 행 영역을 측정해 스크롤바를 정확히 같은 위치에 겹칩니다.
 *
 * useLayoutEffect 사용 이유:
 *   useEffect는 브라우저가 화면을 그린 후 실행되므로 스크롤바가 한 프레임 늦게 정렬됩니다.
 *   useLayoutEffect는 DOM 업데이트 직후, 페인트 전에 실행되어 깜빡임을 방지합니다.
 *
 * visible을 deps에 포함하는 이유:
 *   패널이 opacity 0 → 1로 전환된 직후 레이아웃이 확정되므로 재측정이 필요합니다.
 *
 * @param {string} activeTab - 현재 활성 탭 id ("general"일 때만 스크롤바 표시)
 * @param {boolean} visible - 패널 노출 여부
 */
export function useScrollbarSync(activeTab, visible) {
  // useRef(초기값)는 .current에 값을 담아두는 훅으로, 값이 바뀌어도 리렌더링을 일으키지
  // 않습니다. DOM 엘리먼트를 계속 참조해야 할 때 자주 사용합니다.
  const listRef = useRef(null) // 설정 목록 컨테이너 DOM 엘리먼트를 담을 ref

  // useState(초기값)은 [현재값, 값을 바꾸는 함수]를 반환하며, setScrollbarBox가 호출되면
  // 이 훅을 사용하는 컴포넌트가 다시 렌더링되어 스크롤바 위치가 화면에 반영됩니다.
  const [scrollbarBox, setScrollbarBox] = useState(null) // 측정된 {top, height} 또는 null

  // useCallback(함수, deps)은 deps가 바뀌지 않는 한 동일한 함수 참조를 재사용하게 해주는 훅입니다.
  // 여기서는 activeTab이 바뀔 때만 새 함수를 만들어, 아래 useLayoutEffect의 deps로 안전하게 씁니다.
  const syncScrollbarHeight = useCallback(() => {
    const listEl = listRef.current
    if (!listEl || activeTab !== "general") {
      setScrollbarBox(null) // general 탭이 아니면 스크롤바 숨김
      return
    }
    setScrollbarBox(measureSettingRows(listEl))
  }, [activeTab])

  useLayoutEffect(() => {
    syncScrollbarHeight()
    const listEl = listRef.current
    if (!listEl) return undefined

    // 패널 크기나 내부 항목이 바뀔 때마다 스크롤바 재정렬
    const observer = new ResizeObserver(() => syncScrollbarHeight())
    observer.observe(listEl)
    window.addEventListener("resize", syncScrollbarHeight)

    return () => {
      observer.disconnect()
      window.removeEventListener("resize", syncScrollbarHeight)
    }
  }, [syncScrollbarHeight, visible])

  return { listRef, scrollbarBox }
}
