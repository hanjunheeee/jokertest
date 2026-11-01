// 옆 창 열림 훅: 기록 창·설정 창 중 하나만 열기
// 인게임 화면(InGamePage)이 사용
import { useCallback, useState } from "react"

// 옆 창 이름 (시험도 이 이름으로 비교)
export const INGAME_SIDE_PANEL_RECORDS = "records"

export const INGAME_SIDE_PANEL_SETTINGS = "settings"

// 열린 창과 열기·닫기 (하나를 열면 다른 건 닫힘)
export function useInGameSidePanel() {
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
