import { useCallback, useState } from "react"

/**
 * 인게임 좌측 슬라이드 패널(기록·설정)의 열림 상태.
 *
 * 두 패널은 같은 자리에 같은 프레임으로 겹쳐 뜨므로 동시에 열려서는 안 된다. 그래서 각
 * 패널이 자기 boolean을 따로 갖는 대신 "지금 열려 있는 패널" 하나만 상태로 둔다 — 새 패널을
 * 열면 다른 패널은 상태 구조상 저절로 닫힌다(둘 다 열린 상태를 표현할 수 없다).
 */

/** 기록 패널 id */
export const INGAME_SIDE_PANEL_RECORDS = "records"

/** 설정 패널 id */
export const INGAME_SIDE_PANEL_SETTINGS = "settings"

export function useInGameSidePanel() {
  // null이면 아무 패널도 열려 있지 않다.
  const [openPanel, setOpenPanel] = useState(null)

  const openRecords = useCallback(() => setOpenPanel(INGAME_SIDE_PANEL_RECORDS), [])
  const openSettings = useCallback(() => setOpenPanel(INGAME_SIDE_PANEL_SETTINGS), [])
  const close = useCallback(() => setOpenPanel(null), [])

  return {
    openPanel,
    recordsOpen: openPanel === INGAME_SIDE_PANEL_RECORDS,
    settingsOpen: openPanel === INGAME_SIDE_PANEL_SETTINGS,
    openRecords,
    openSettings,
    close,
  }
}
