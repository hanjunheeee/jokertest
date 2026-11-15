// 판 설정 값 서버 부르기 파일, 보기 · 바꾸기 (/admin-api/game-settings)
// 판 설정 화면(GameSettingsPage)이 씀
import { adminApi } from '@/admin/shared/api/adminClient'

// → { settings:{ goldReward, updatedAt, updatedBy }, limits:{ goldReward:{ min, max } }, node:{ goldReward, loadedAt } }
export const fetchGameSettings = () => adminApi.get('/game-settings')

// → { settings, limits, nodes:[{ node, ok, code? }], partial }
export const saveGameSettings = ({ goldReward }) => adminApi.send('PUT', '/game-settings', { goldReward })

// 입력 칸 글자 → 판 골드 수 (0~max 정수 글자만), 예: '2' → 2, '1.5'·'-1'·'' → null
export const parseGoldRewardInput = (text, { min = 0, max = 100 } = {}) => {
  const value = String(text ?? '').trim()
  if (!/^\d{1,3}$/.test(value)) return null
  const number = Number(value)
  return number >= min && number <= max ? number : null
}
