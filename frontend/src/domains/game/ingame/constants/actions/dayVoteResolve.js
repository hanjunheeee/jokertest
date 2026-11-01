// 낮 투표 판정 요청 고정 값: 응답 시간·실패 문구
// 낮 투표 판정 요청 훅(useDayVoteResolve)과 utils/dayVoteResolve.js가 사용

// 판정 응답 기다리는 시간
export const TIMEOUT_MS = 5000

// 서버가 실패 문구를 안 줬을 때
export const FAILED_MSG = "?먯젙?섏? 紐삵뻽?듬땲??"

// 보낼 때 연결이 없을 때
export const OFFLINE_MSG = "?쒕쾭 ?곌껐???뺤씤?????놁뒿?덈떎. ?좎떆 ???ㅼ떆 ?쒕룄?댁＜?몄슂."

// 응답이 시간 안에 안 올 때
export const NO_ACK_MSG = "?붿껌???묐떟?섏? ?딆뒿?덈떎. ?ㅼ떆 ?쒕룄?댁＜?몄슂."
