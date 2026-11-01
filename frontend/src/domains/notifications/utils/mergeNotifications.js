// 알림 목록 합치기·정렬
// 알림 스토어의 복원·실시간·읽음 액션이 씀
import { isUsableNotification } from "./notificationRows.js"

// 최신순, 같은 시각이면 id 역순으로 순서 고정
function compare(a, b) {
  const at = Date.parse(a?.createdAt ?? "")
  const bt = Date.parse(b?.createdAt ?? "")
  const av = Number.isNaN(at) ? 0 : at
  const bv = Number.isNaN(bt) ? 0 : bt
  if (av !== bv) return bv - av
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0
}

// id 기준으로 합침, 읽음 시각은 더 이른 쪽을 남김
export function mergeNotifications(existing, incoming) {
  const byId = new Map()
  for (const item of existing) byId.set(item.id, item)

  for (const raw of incoming) {
    if (!isUsableNotification(raw)) continue
    const prev = byId.get(raw.id)
    if (prev === undefined) {
      byId.set(raw.id, raw)
      continue
    }
    // 한쪽만 읽었으면 그 시각, 둘 다면 먼저 읽은 시각 유지
    const prevRead = prev.readAt ?? null
    const nextRead = raw.readAt ?? null
    let readAt = prevRead ?? nextRead
    if (prevRead !== null && nextRead !== null) {
      readAt = Date.parse(prevRead) <= Date.parse(nextRead) ? prevRead : nextRead
    }
    byId.set(raw.id, { ...prev, ...raw, readAt })
  }

  return [...byId.values()].sort(compare)
}
