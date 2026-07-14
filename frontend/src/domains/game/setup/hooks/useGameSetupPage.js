import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"

/** 게임 만들기 페이지의 입장 애니메이션과 페이지 이동을 관리합니다. */
export function useGameSetupPage() {
  const navigate = useNavigate()

  // 설정 패널과 뒤로가기 버튼 입장 애니메이션을 시작할지 표시합니다.
  const [uiVisible, setUiVisible] = useState(false)

  useEffect(() => {
    const frame = requestAnimationFrame(() => setUiVisible(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  return {
    uiVisible,
    goBackToMultiplay: () => navigate("/multiplay"),
    createGame: () => navigate("/game-matching"),
  }
}
