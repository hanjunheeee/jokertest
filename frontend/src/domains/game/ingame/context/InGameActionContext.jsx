// 파일 역할: InGameActionContext.jsx - 인게임 행동 훅 값을 화면 트리에 흘려보내는 통로입니다.
import { createContext } from "react"

/**
 * V-1: useInGameActionPanel이 만든 **하나의** 값을 컨트롤 패널과 플레이어 카드 메뉴가 함께
 * 보게 하는 컨텍스트다.
 *
 * 이 파일은 전달만 맡는다 — 행동 훅을 부르지 않고 Provider 컴포넌트도 만들지 않는다. 훅을
 * 부르는 자리(=값의 소유자)는 InGamePage.jsx의 named export InGameActionProvider 하나뿐이고,
 * InGamePlayArea.jsx도 그 하나를 재사용한다. 소유자를 한 곳으로 묶어 두지 않으면 패널과
 * 카드 메뉴가 서로 다른 훅 인스턴스(= 서로 다른 선택 상태)를 보게 된다.
 *
 * 기본값을 null로 두는 이유: Provider 없이 소비되는 자리를 조용히 통과시키지 않기 위해서다.
 * 소비자(useInGamePlayerCardMenu)는 null을 "행동 항목이 하나도 없다"로 다루고 아무 요청도
 * 만들지 않는다(빈 값을 꾸며내 제출 경로를 열지 않는다).
 */
export const InGameActionContext = createContext(null)
