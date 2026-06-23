import { INGAME_CHAT_DUMMY_PROFILES } from "../constants/ingameChatAssets.js"

/** seed(닉네임·id 등)마다 동일한 더미 프로필을 고르기 위한 해시 */
function hashSeed(seed) {
  const text = String(seed)
  let hash = 0

  for (let index = 0; index < text.length; index += 1) {
    hash = (hash + text.charCodeAt(index) * (index + 1)) | 0
  }

  return Math.abs(hash)
}

/** 더미친구 프로필 1~5 중 seed 기준으로 하나 선택 */
export function pickInGameChatProfile(seed) {
  const index = hashSeed(seed) % INGAME_CHAT_DUMMY_PROFILES.length
  return INGAME_CHAT_DUMMY_PROFILES[index]
}

/** 무작위 더미 프로필 (로컬 전송 등 일회성용) */
export function pickRandomInGameChatProfile() {
  const index = Math.floor(Math.random() * INGAME_CHAT_DUMMY_PROFILES.length)
  return INGAME_CHAT_DUMMY_PROFILES[index]
}
