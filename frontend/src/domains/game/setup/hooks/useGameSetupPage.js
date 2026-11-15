// 게임 설정 화면 훅: 방 만들기·뒤로 가기 (폼은 늘 기본값, 판 끝 뒤엔 서버가 같은 설정으로 방을 다시 열어 저장값 복원은 없앰)
// GameSetupPage가 씀(모바일도 같음)
import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useAuthStore } from "@/domains/auth/store/auth.store.js"
import { dispatchUiSfx } from "@/shared/hooks/useSfxRuntime.js"
import { useCreateRoom } from "./useCreateRoom.js"

// 게임 설정 화면 값·동작
export function useGameSetupPage() {
  const navigate = useNavigate()

  const [uiVisible, setUiVisible] = useState(false)

  const accountId = useAuthStore((s) => s.user?.uuid ?? null)
  const identityGeneration = useAuthStore((s) => s.identityGeneration)
  // 계정이 바뀌면 폼을 기본값으로 새로 채움 (폼 다시 채우기 키)
  const formResetKey = `${accountId ?? "none"}:${identityGeneration}`

  // 첫 그림 다음 프레임에 화면 드러냄
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
    initialFormState: null,
    formResetKey,
  }
}
