// 인게임 행동 컨텍스트: 행동 패널 값·방장·카드 추방 열기를 아래 화면에 나눠 줌
// InGamePage의 Provider가 넣고 행동 패널·카드 판·시간 막대·재판·카드 메뉴가 읽음
import { createContext } from "react"

// Provider 밖에서 읽으면 null
export const InGameActionContext = createContext(null)
