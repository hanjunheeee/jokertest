import { useCallback, useState } from "react"

export const INGAME_CONTROL_PANEL_MODE_COMPACT = "compact"
export const INGAME_CONTROL_PANEL_MODE_EXPANDED = "expanded"

/**
 * 인게임 컨트롤 패널의 compact/expanded 표시 상태만 다루는 presentation 전용 훅.
 * 선택값·제출 상태·에러 같은 게임 진행 상태는 전혀 들고 있지 않는다 — 패널을 접고 펴도
 * useInGameActionPanel이 관리하는 상태는 이 훅과 무관하게 그대로 유지된다.
 */
export function useInGameControlPanelLayout({ defaultExpanded = false } = {}) {
  const [expanded, setExpanded] = useState(defaultExpanded)

  const expand = useCallback(() => setExpanded(true), [])
  const collapse = useCallback(() => setExpanded(false), [])
  const toggle = useCallback(() => setExpanded((current) => !current), [])

  return {
    expanded,
    mode: expanded ? INGAME_CONTROL_PANEL_MODE_EXPANDED : INGAME_CONTROL_PANEL_MODE_COMPACT,
    expand,
    collapse,
    toggle,
  }
}
