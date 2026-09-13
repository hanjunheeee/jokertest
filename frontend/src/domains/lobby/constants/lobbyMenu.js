// node --test는 @/ alias를 풀지 못하므로 단위 테스트가 닿는 경계는 상대 경로로 둡니다.
import { LOBBY_MENU_BUTTONS } from "./lobbyAssets.js"

// 로비 왼쪽 메뉴에 표시할 버튼 목록입니다.
//
// F-18(AC-05): 명예의 전당(hallOfFame) 항목은 이 배열에서 제거했습니다. LobbyMenuNav가
// 이 배열만 순회해 버튼을 그리므로, 여기서 빠지면 화면·키보드 포커스·접근성 목록 어디에도
// 그 항목이 남지 않습니다(숨긴 버튼이나 빈 슬롯을 따로 두지 않습니다). podium 도메인의
// 페이지·컴포넌트·이미지와 LOBBY_MENU_BUTTONS.hallOfFame 자산 자체는 그대로 보존합니다
// (AC-06) — 사라지는 것은 "로비에서의 진입"뿐입니다.
export const LOBBY_MENU_ITEMS = [
  { id: "gameplay", label: "게임플레이", src: LOBBY_MENU_BUTTONS.gameplay },
  { id: "settings", label: "설정", src: LOBBY_MENU_BUTTONS.settings },
  { id: "store", label: "상점", src: LOBBY_MENU_BUTTONS.store },
  { id: "archive", label: "기억의 서고", src: LOBBY_MENU_BUTTONS.archive },
  { id: "exit", label: "종료", src: LOBBY_MENU_BUTTONS.exit },
  { id: "customerSupport", label: "고객센터", src: LOBBY_MENU_BUTTONS.customerSupport },
]

// 메뉴 id별 이동 경로입니다. 로그아웃처럼 별도 처리가 필요한 메뉴는 여기서 제외합니다.
// 고객센터는 앱 내부 경로가 아니라 외부 Discord 지원 URL로 연결되므로 여기에 없습니다
// (useLobbyMenuNav.js가 shared/discordSupport.js의 판정 결과로 직접 링크를 만듭니다).
export const LOBBY_MENU_ROUTES = {
  gameplay: "/gameMode",
  settings: "/setting",
  store: "/store",
  archive: "/library",
}
