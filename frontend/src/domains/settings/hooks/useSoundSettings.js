// 파일 역할: useSoundSettings.js - React 상태와 부수효과를 묶는 커스텀 훅입니다.
import { useState } from "react"
import { SOUND_SETTING_VOLUMES } from "../constants/soundSettings.js"

function defaultVolumes() {
  return Object.fromEntries(
    SOUND_SETTING_VOLUMES.map(({ id, defaultValue }) => [id, defaultValue]),
  )
}

/** 사운드 탭 볼륨 값 — 프론트 상태에만 보관하며 서버로 저장하지 않습니다. */
export function useSoundSettings() {
  const [volumes, setVolumes] = useState(defaultVolumes)

  const setVolume = (id, next) => {
    setVolumes((prev) => ({ ...prev, [id]: next }))
  }

  return { volumes, setVolume }
}
