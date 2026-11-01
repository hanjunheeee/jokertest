// 게임 설정 화면 훅: 저장된 다음 게임 설정 복원·방 만들기·뒤로 가기
// GameSetupPage가 씀
import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useAuthStore } from "@/domains/auth/store/auth.store.js"
import { dispatchUiSfx } from "@/shared/hooks/useSfxRuntime.js"
import { useNextRoomSettingsStore } from "../store/nextRoomSettingsStore.js"
import { resolveRestore } from "../utils/resolveRestore.js"
import { useCreateRoom } from "./useCreateRoom.js"

export function useGameSetupPage() {
  const navigate = useNavigate()

  const [uiVisible, setUiVisible] = useState(false)

  const accountId = useAuthStore((s) => s.user?.uuid ?? null)
  const identityGeneration = useAuthStore((s) => s.identityGeneration)
  const readRestoreSource = useNextRoomSettingsStore((s) => s.readRestoreSource)

  // 계정이 바뀌면 그 계정의 저장값으로 폼을 새로 채움
  const restore = useMemo(() => {
    if (!accountId) return { formState: null, resetKey: `none:${identityGeneration}`, notice: "" }
    return resolveRestore(readRestoreSource(accountId), `${accountId}:${identityGeneration}`)
  }, [accountId, identityGeneration, readRestoreSource])

  useEffect(() => {
    const frame = requestAnimationFrame(() => setUiVisible(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  const { isCreating, createGame, isBusy } = useCreateRoom({ navigate, accountId, identityGeneration })

  // 만드는 중에 나가면 방이 생길 수 있다고 한 번 물음
  const goBackToMultiplay = () => {
    if (isBusy()) {
      const confirmed = window.confirm(
        "방 생성 요청이 진행 중입니다. 방이 생성될 수 있지만 현재 화면에서 나가시겠습니까?"
      )
      dispatchUiSfx(confirmed ? "ui-confirm" : "ui-cancel")
      if (!confirmed) return
      navigate("/multiplay")
      return
    }
    dispatchUiSfx("ui-cancel")
    navigate("/multiplay")
  }

  return {
    uiVisible,
    isCreating,
    goBackToMultiplay,
    createGame,
    initialFormState: restore.formState,
    formResetKey: restore.resetKey,
    restoreNotice: restore.notice,
  }
}
