// 세션 스냅샷 반영 계산 입구 (계산은 utils/snapshot/)
// 스냅샷 액션과 시험이 이 경로로 가져다 씀
export { applySessionSnapshotPure, bootstrapSessionSnapshotPure } from "../utils/snapshot/applySnapshot.js"
export { normRoomSettingsSource as normalizeRoomSettingsSourceForStore } from "../utils/snapshot/roomSettings.js"
