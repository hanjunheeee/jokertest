import { useCallback, useState } from "react"

export const INGAME_SIDE_PANEL_RECORDS = "records"

export const INGAME_SIDE_PANEL_SETTINGS = "settings"

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
