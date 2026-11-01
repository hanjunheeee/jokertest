// 대기방 설정 편집 패널 열기·닫기·저장
// useMatchingPage가 씀, 방장이고 방 확인이 끝났고 결과 확인 대기가 없을 때만 열림
import { useEffect, useMemo, useState } from "react"
import { buildRoomSettingsFormState } from "@/domains/game/setup/utils/roomSettingsForm/formState.js"

export function useSettingsEdit({
  isInRoom, isHost, isRoomVerified, roomId, accessType, settings, settingsVersion,
  hasPendingSettingsResult, saveRoomSettings,
}) {
  const [settingsOpen, setSettingsOpen] = useState(false)

  // 지금 방 설정을 편집 폼 값으로 바꿈, 방·버전이 바뀌면 폼을 새로 채우게 키를 바꿈
  const settingsForm = useMemo(
    () => buildRoomSettingsFormState({ accessType, settings }),
    [accessType, settings],
  )
  const settingsFormResetKey = `${roomId ?? ""}:${settingsVersion ?? ""}`

  const canEditSettings = isInRoom && isHost && isRoomVerified && settingsForm.ok && !hasPendingSettingsResult
  const openSettings = () => { if (canEditSettings) setSettingsOpen(true) }
  const closeSettings = () => setSettingsOpen(false)

  // 열린 채로 편집 자격을 잃으면 닫음
  useEffect(() => {
    if (settingsOpen && !canEditSettings) setSettingsOpen(false)
  }, [settingsOpen, canEditSettings])

  // 저장 성공하면 닫음
  const submitSettings = async (formState) => {
    const result = await saveRoomSettings(formState)
    if (result.ok) setSettingsOpen(false)
    return result
  }

  return {
    settingsOpen,
    openSettings,
    closeSettings,
    canEditSettings,
    settingsForm,
    settingsFormResetKey,
    submitSettings,
  }
}
