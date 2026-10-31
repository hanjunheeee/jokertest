import { useEffect } from "react"
import { useSettingsStore } from "../domains/settings/store/settingsStore.js"
import { syncAppTextScale } from "./appTextScale.js"

export function useAppTextScaleSync() {
  const generalTextSize = useSettingsStore((s) => s.generalTextSize)

  useEffect(() => {
    syncAppTextScale(generalTextSize)
  }, [generalTextSize])
}
