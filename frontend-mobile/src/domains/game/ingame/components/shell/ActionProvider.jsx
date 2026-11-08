// 인게임 행동 Provider: 행동 패널 값·방장을 InGameActionContext로 나눠 줌
// InGamePage가 씀, 데스크톱 InGamePage의 InGameActionProvider를 옮김 (인게임 추방은 기능 제거, 대기방 추방만 남음)
import { InGameActionContext } from "@/domains/game/ingame/context/InGameActionContext.jsx"
import { useInGameStore } from "@/domains/game/ingame/store/ingameStore.js"
import { useInGameActionPanel } from "@/domains/game/ingame/hooks/useInGameActionPanel.js"

export default function ActionProvider({ interactionBlocked = false, children }) {
  const actionPanelValue = useInGameActionPanel({ interactionBlocked })
  const hostUuid = useInGameStore((s) => s.hostUuid ?? null)

  return (
    <InGameActionContext.Provider value={{ ...actionPanelValue, hostUuid }}>
      {children}
    </InGameActionContext.Provider>
  )
}
