// 파일 역할: useAppTextScaleSync.js - 설정 화면의 "텍스트 크기"(GENERAL_SETTING_TEXT_SIZE)를
// 구독해 실제 화면 배율(--app-text-scale)에 반영하는 훅입니다. App.jsx가 앱 최상단에서 한 번
// 호출하며, 시험도 같은 훅을 써서 "설정 입력 → store → CSS 변수 → 렌더된 텍스트"의 실제
// 생산 경로를 그대로 확인합니다.
import { useEffect } from "react"
import { useSettingsStore } from "../domains/settings/store/settingsStore.js"
import { syncAppTextScale } from "./appTextScale.js"

/**
 * F-15(AC-02): 배율은 font-size 선언에서만 곱해진다 — index.css의 body 기본값과,
 * 스스로 font-size를 지정하는 요소가 쓰는 .app-text-scaled 유틸리티. 간격·프레임은
 * rem·%·cqi 기준이라 이 값에 끌려가지 않는다(화면 전체 확대가 아니다).
 */
export function useAppTextScaleSync() {
  const generalTextSize = useSettingsStore((s) => s.generalTextSize)

  useEffect(() => {
    syncAppTextScale(generalTextSize)
  }, [generalTextSize])
}
