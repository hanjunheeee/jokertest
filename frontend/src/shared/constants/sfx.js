// 효과음 상수 (검수 상태·시간 제한·막힌 이유·소리 범위·소리 분류·재생 끝 결과)
// 효과음 목록·자산 검사·플레이어가 씀 (sfxManifest.js가 같은 이름으로 다시 내보냄)

// 검수 통과한 소리만 냄
export const SFX_REVIEW_STATUS = Object.freeze({
  APPROVED: "approved",
  NEEDS_REVIEW: "needs_assets_and_usage_review",
})

// 따로 재생하는 효과음은 2초까지만 받음
export const MAX_SEPARATE_SFX_DURATION_MS = 2000

// 효과음 파일 받기 최대 대기 시간
export const SFX_LOAD_TIMEOUT_MS = 3000

// 끝 이벤트가 안 올 때 소리 길이 뒤에 더 기다리는 시간
export const SFX_PLAYBACK_WATCHDOG_MS = 1000

// 화면 소리 연타 최소 간격 (겹침 막기)
export const SFX_UI_COOLDOWN_MS = 120

// 소리를 안 낸 이유 (무음 기록에 남김)
export const SFX_SUPPRESSED_REASON = Object.freeze({
  NO_RUNTIME: "no-runtime",
  INVALID_EVENT: "invalid-event",
  UNKNOWN_KIND: "unknown-kind",
  RESTORE_ORIGIN: "restore-origin",
  ANONYMOUS_SCOPE: "anonymous-server-event",
  ACCOUNT_MISMATCH: "account-mismatch",
  GAME_MISMATCH: "game-mismatch",
  ROOM_MISMATCH: "room-mismatch",
  MISSING_SCOPE: "missing-scope",
  DUPLICATE: "duplicate",
  NOTIFICATION_DISABLED: "notification-disabled",
  MUTED: "muted",
  COOLDOWN: "cooldown",
  EMBEDDED_OWNED: "embedded-owned",
  ASSET_UNREVIEWED: "asset-unreviewed",
  ASSET_MISSING: "asset-missing",
  ASSET_MUSIC: "asset-music-classified",
  ASSET_TOO_LONG: "asset-too-long",
  ASSET_HASH_MISMATCH: "asset-hash-mismatch",
  DISPOSED: "disposed",
})

// 소리가 묶이는 범위 (계정·판·방·화면)
export const SFX_SCOPE = Object.freeze({
  ACCOUNT: "account",
  GAME: "game",
  ROOM: "room",
  UI: "ui",
})

// 음악으로 분류된 건 효과음으로 안 냄
export const SFX_CLASSIFICATION = Object.freeze({
  SHORT_NON_MUSICAL: "short-non-musical",
  MUSIC: "music",
})

// 효과음 한 번 재생이 어떻게 끝났는지
export const SFX_COMPLETION = Object.freeze({
  PLAYED: "played",
  FAILED: "failed",
  TIMED_OUT: "timed-out",
  STOPPED: "stopped",
})
