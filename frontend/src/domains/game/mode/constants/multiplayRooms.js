/**
 * 공개방 목록 API가 붙기 전까지 화면 확인에 쓰는 더미 방 목록입니다.
 * accessType: "open"(코드 없이 입장) | "code"(입장 코드 필요, 코드 값 자체는 여기 담지 않음)
 * status: "waiting" | "in_progress" 만 저장합니다. 마감(full) 여부는 저장하지 않고
 * current >= max로 항상 파생 계산합니다 (frontend/src/domains/game/mode/utils/deriveRoomDisplayStatus.js 참고).
 */
export const DUMMY_MULTIPLAY_ROOMS = [
  { id: "room-1", stage: 1, current: 2, max: 5, title: "누구든 들어와 방", accessType: "open", status: "waiting" },
  { id: "room-2", stage: 1, current: 4, max: 8, title: "초보 환영", accessType: "open", status: "waiting" },
  { id: "room-3", stage: 2, current: 7, max: 10, title: "진지하게 ㄱㄱ", accessType: "open", status: "in_progress" },
  { id: "room-4", stage: 1, current: 1, max: 6, title: "친구 구함", accessType: "code", status: "waiting" },
  { id: "room-5", stage: 3, current: 5, max: 10, title: "연습방", accessType: "code", status: "waiting" },
  { id: "room-6", stage: 2, current: 3, max: 8, title: "느긋하게", accessType: "open", status: "waiting" },
  { id: "room-7", stage: 1, current: 6, max: 10, title: "공개방 테스트", accessType: "open", status: "waiting" },
  { id: "room-8", stage: 2, current: 8, max: 8, title: "밤늦게만", accessType: "open", status: "waiting" },
  { id: "room-9", stage: 1, current: 6, max: 6, title: "거의 만석", accessType: "open", status: "waiting" },
  { id: "room-10", stage: 3, current: 8, max: 10, title: "고수만", accessType: "code", status: "in_progress" },
  { id: "room-11", stage: 1, current: 3, max: 10, title: "편하게 놀자", accessType: "open", status: "waiting" },
  { id: "room-12", stage: 2, current: 4, max: 8, title: "속임수 연습", accessType: "open", status: "waiting" },
  { id: "room-13", stage: 1, current: 1, max: 5, title: "새벽반", accessType: "code", status: "waiting" },
  { id: "room-14", stage: 2, current: 6, max: 10, title: "토론-heavy", accessType: "open", status: "waiting" },
  { id: "room-15", stage: 3, current: 3, max: 8, title: "승부는 진지하게", accessType: "open", status: "waiting" },
  { id: "room-16", stage: 1, current: 7, max: 10, title: "인원 많음", accessType: "open", status: "waiting" },
  { id: "room-17", stage: 2, current: 6, max: 6, title: "소규모 정예", accessType: "code", status: "waiting" },
  { id: "room-18", stage: 1, current: 4, max: 8, title: "초보 OK", accessType: "open", status: "waiting" },
  { id: "room-19", stage: 3, current: 10, max: 10, title: "마감 임박", accessType: "open", status: "waiting" },
  { id: "room-20", stage: 2, current: 5, max: 10, title: "스크롤 테스트", accessType: "open", status: "waiting" },
]
