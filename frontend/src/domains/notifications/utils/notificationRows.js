// 알림 한 줄 모양 검사 (쓸 수 있는 줄·알림 기반 소리 키·읽음 확정 줄)
// 알림 스토어 액션과 병합 계산이 씀
export function isUsableNotification(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false
  if (typeof value.id !== "string" || value.id.length === 0) return false
  if (typeof value.sourceKey !== "string" || value.sourceKey.length === 0) return false
  return true
}

// 알림 줄로도 오는 소리 키인지: 복원 전엔 이 키 소리를 미뤄 두 번 울림을 막음
export function isNotificationBackedSourceKey(sourceKey) {
  if (typeof sourceKey !== "string") return false
  if (sourceKey.startsWith("system:")) return true
  if (/^friend-request:[^:]+:received$/.test(sourceKey)) return true
  if (/^achievement:[^:]+:granted$/.test(sourceKey)) return true
  if (/^game-invite:[^:]+:received$/.test(sourceKey)) return true
  return false
}

// 서버가 읽음 시각을 실제로 찍어 돌려준 줄인지
export function isConfirmedReadRow(row, notificationId) {
  if (!isUsableNotification(row)) return false
  if (row.id !== notificationId) return false
  const readAt = row.readAt ?? null
  if (readAt === null) return false
  // Date·문자열 둘 다 받되 못 읽는 시각은 확정으로 안 봄
  if (readAt instanceof Date) return Number.isFinite(readAt.getTime())
  if (typeof readAt !== "string" || readAt.trim().length === 0) return false
  return Number.isFinite(Date.parse(readAt))
}
