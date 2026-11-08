// 신고 창 그림: 틀·닫기는 투표 창 그림, 신고 버튼은 추방 버튼(부정) 그림, 취소는 수락 버튼 그림
// 데스크톱·모바일 신고 창·신고 버튼이 씀
import { PLAYER_ASSETS } from "@/domains/game/ingame/constants/controls/kickPlayer/ingameKickPlayerAssets.js"
import { GAME_MATCHING_ASSETS } from "@/domains/game/matching/constants/gameMatchingAssets.js"
import { INGAME_VOTE_ASSETS } from "@/domains/game/ingame/constants/vote/ingameVoteAssets.js"

export const REPORT_FRAME_ASSETS = INGAME_VOTE_ASSETS

export const REPORT_BUTTON_ASSETS = Object.freeze({
  report: PLAYER_ASSETS.kickActionButton,
  cancel: GAME_MATCHING_ASSETS.startGameButton,
})
