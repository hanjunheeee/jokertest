// 오른쪽 아래 행동 버튼 그림: 낮 투표 기권·밤 행동 건너뛰기
// 오른쪽 아래 행동 패널(InGameCornerActionPanel)이 사용
import { PLAYER_CARD_OVERLAY_ASSETS } from "../board/ingamePlayerCardOverlayAssets.js"

// 기권은 카드 메뉴 취소 버튼 그림을 같이 씀
export const INGAME_CORNER_ACTION_ASSETS = {
  abstain: PLAYER_CARD_OVERLAY_ASSETS.cancelButton,
  skip: "/button/버튼(미선택).png".normalize("NFD"),
}
