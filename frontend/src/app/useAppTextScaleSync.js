// 설정 스토어 글자 크기가 바뀔 때마다 화면 글자 배율을 다시 넣음
// App이 한 번 부름
import { useEffect } from "react"
import { useSettingsStore } from "../domains/settings/store/settingsStore.js"
import { syncAppTextScale } from "./appTextScale.js"

// 글자 크기 값만 구독해서 다른 설정이 바뀔 땐 다시 안 돌림
export function useAppTextScaleSync() {
  const generalTextSize = useSettingsStore((s) => s.generalTextSize)

  useEffect(() => {
    syncAppTextScale(generalTextSize)
  }, [generalTextSize])
}
