// 게임 시작 막힘 창 제목·글자 모양, 시작 요청 실패 문구, 시작 최소 인원과 시작 단추가 꺼진 까닭 글(인원 모자람·준비 안 됨)
// GameStartBlockedModal·hooks/room(useRoomRequests·useSettingsSave)·useMatchingPage가 씀
import { GENERAL_GAME_SETUP } from '../../setup/constants/gameSetupOptions.js'

// 시작 최소 인원: 방 만들기에서 고를 수 있는 가장 작은 정원과 같은 값 (서버 규칙도 같음, 숫자를 여기 또 적지 않으려고 거기서 읽음)
// 그 항목을 못 찾으면 null → 단추를 미리 끄지 않음 (서버가 거절 글로 막음)
export const MIN_START_PLAYERS = GENERAL_GAME_SETUP.find((item) => item.id === 'max-players')?.min ?? null

// 인원이 모자라 시작 단추가 꺼졌을 때 까닭 글 → 예: "5명부터 시작할 수 있습니다. (지금 3명)"
export const startShortageMessage = (count) => `${MIN_START_PLAYERS}명부터 시작할 수 있습니다. (지금 ${count}명)`

// 준비 안 한 사람이 있어 시작 단추가 꺼졌을 때 까닭 글 → 예: "모두 준비해야 시작할 수 있습니다. (준비 3/5)"
export const startNotReadyMessage = (readyCount, total) => `모두 준비해야 시작할 수 있습니다. (준비 ${readyCount}/${total})`

export const BLOCKED_TITLE = '게임을 시작할 수 없습니다'

export const BLOCKED_TITLE_CLASS =
  'font-subheading app-text-scaled [--app-text-size:clamp(1rem,2.4vw,1.35rem)] font-bold leading-snug text-[#3a1a0c]'

export const BLOCKED_MSG_CLASS =
  'font-subheading app-text-scaled [--app-text-size:clamp(0.88rem,1.85vw,1.05rem)] font-semibold leading-relaxed text-[#3a1a0c]' // 흐리게 하면 양피지 어두운 얼룩 자리에서 흐려 제목과 같은 색

// 실패 문구: 연결 없음·방 확인 중·응답 없음·그 밖
export const GAME_START_MESSAGES = Object.freeze({
  SOCKET_UNAVAILABLE: '서버 연결을 확인할 수 없습니다. 잠시 후 다시 시도해주세요.',
  ROOM_SYNC_PENDING: '현재 방 상태를 확인하고 있습니다. 잠시 후 다시 시도해주세요.',
  REQUEST_TIMEOUT: '게임 시작 요청이 응답하지 않습니다. 잠시 후 다시 시도해주세요.',
  FALLBACK: '게임을 시작할 수 없습니다.',
})
