// 설정 기기 저장 키·저장 범위·숨긴 항목·기본 음소거
// 설정 스토어와 저장값 정리 계산이 씀
export const SETTINGS_STORAGE_KEY = "settings-storage"

// 화면에서 뺀 일반 체크: 기본값·저장값 모두에서 뺌
export const HIDDEN_GENERAL_CHECK_IDS = new Set(["fullscreen", "whisper"])

// 채팅 글자 크기 저장 범위 (인게임 채팅 슬라이더와 같은 범위)
export const CHAT_TEXT_SIZE_STORAGE_RANGE = { min: 0, max: 100 }

export const CHAT_CHECK_STORAGE_IDS = ["show-time", "nickname-color"]

export const SFX_MUTED_DEFAULT = false
