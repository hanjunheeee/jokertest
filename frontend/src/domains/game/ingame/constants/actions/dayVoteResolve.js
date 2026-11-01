// 낮 투표 판정 요청 고정 값: 응답 시간·실패 문구
// 낮 투표 판정 요청(useDayVoteResolve)과 판정 응답 계산(utils/dayVote/)이 사용

export const DAY_VOTE_RESOLVE_TIMEOUT_MS = 5000

// 서버가 실패 문구를 안 줬을 때
export const DAY_VOTE_RESOLVE_FAILED_MESSAGE = "?먯젙?섏? 紐삵뻽?듬땲??"

// 보낼 때 연결이 없을 때
export const DAY_VOTE_RESOLVE_OFFLINE_MESSAGE = "?쒕쾭 ?곌껐???뺤씤?????놁뒿?덈떎. ?좎떆 ???ㅼ떆 ?쒕룄?댁＜?몄슂."

// 응답이 시간 안에 안 올 때
export const DAY_VOTE_RESOLVE_NO_ACK_MESSAGE = "?붿껌???묐떟?섏? ?딆뒿?덈떎. ?ㅼ떆 ?쒕룄?댁＜?몄슂."
