// 결과 화면 "대기방으로" — 서버 방·우편함이 준비될 때까지 기다리는 시간
// hooks/waitForResultMatchingRoom·useGameResultReturnToMatching이 씀

// get_current_room·get_party_matching_room 재시도 간격
export const RESULT_RETURN_POLL_MS = 700

// 방이 아직 없거나 pending일 때 기다리는 총 시간
export const RESULT_RETURN_WAIT_MS = 18000

// create_room 응답을 못 받았을 때 get_current_room 재시도 횟수 (위 간격 기준)
export const RESULT_RETURN_CREATE_POLL_ATTEMPTS = 16