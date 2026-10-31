import { SFX_GENERATED_ASSETS } from "./sfxGeneratedAssets.js"
export const SFX_REVIEW_STATUS = Object.freeze({
  APPROVED: "approved",
  NEEDS_REVIEW: "needs_assets_and_usage_review",
})

export const MAX_SEPARATE_SFX_DURATION_MS = 2000

export const SFX_LOAD_TIMEOUT_MS = 3000

export const SFX_PLAYBACK_WATCHDOG_MS = 1000

export const SFX_UI_COOLDOWN_MS = 120

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

export const SFX_SCOPE = Object.freeze({
  ACCOUNT: "account", // 친구·업적처럼 계정 전역에서 한 번만 나는 사건
  GAME: "game",
  ROOM: "room",
  UI: "ui", // 물리 활성화 단위 — 서버 사건이 아니다
})

export const SFX_CLASSIFICATION = Object.freeze({
  SHORT_NON_MUSICAL: "short-non-musical",
  MUSIC: "music",
})

const NIGHT_SUCCESS_VIDEO_TABLE = Object.freeze({
  "KILL-USER": "/video-direction/night-success-kill-user-stacked.mp4",
  "KILL-TARGET": "/video-direction/night-success-kill-target-stacked.mp4",
  "HEAL-USER": "/video-direction/night-success-heal-stacked.mp4",
  "HEAL-TARGET": "/video-direction/night-success-heal-stacked.mp4",
  "INVESTIGATE-USER": "/video-direction/night-success-investigate-user-stacked.mp4",
  "CONFIRM-USER": "/video-direction/night-success-confirm-user-stacked.mp4",
})

function pendingAsset(extra) {
  return {
    reviewStatus: SFX_REVIEW_STATUS.NEEDS_REVIEW,
    silenceReason: "자산 파일과 이용 조건 검토가 아직 제공되지 않았다(외부 입력 의존).",
    source: null,
    creator: null,
    usageTerms: null,
    sha256: null,
    src: null,
    durationMs: null,
    classification: SFX_CLASSIFICATION.SHORT_NON_MUSICAL,
    ...extra,
  }
}

function synthesizedAsset(kind, extra) {
  const generated = SFX_GENERATED_ASSETS[kind]
  if (!generated) throw new Error(`sfxManifest: 합성 자산 목록에 없는 kind — ${kind} (scripts/gen-sfx.mjs 실행)`)
  return {
    reviewStatus: SFX_REVIEW_STATUS.APPROVED,
    silenceReason: null,
    source: "자작 합성 — frontend/scripts/gen-sfx.mjs (저장소 안에서 생성)",
    creator: "joker 프로젝트 합성 스크립트",
    usageTerms: "자작 — 저작권·이용 조건 제약 없음(운영자 AUDIO-01 완화 2026-09-22)",
    sha256: generated.sha256,
    src: generated.src,
    durationMs: generated.durationMs,
    classification: SFX_CLASSIFICATION.SHORT_NON_MUSICAL,
    ...extra,
  }
}

export const SFX_MANIFEST = Object.freeze({
  "ui-click": synthesizedAsset("ui-click", { scope: SFX_SCOPE.UI, notificationKey: null }),
  "ui-confirm": synthesizedAsset("ui-confirm", { scope: SFX_SCOPE.UI, notificationKey: null }),
  "ui-cancel": synthesizedAsset("ui-cancel", { scope: SFX_SCOPE.UI, notificationKey: null }),

  "friend-request-received": synthesizedAsset("friend-request-received", { scope: SFX_SCOPE.ACCOUNT, notificationKey: "friend-invite" }),
  "friend-request-accepted": synthesizedAsset("friend-request-accepted", { scope: SFX_SCOPE.ACCOUNT, notificationKey: "friend-invite" }),
  "friend-request-declined": synthesizedAsset("friend-request-declined", { scope: SFX_SCOPE.ACCOUNT, notificationKey: "friend-invite" }),

  "achievement-granted": synthesizedAsset("achievement-granted", { scope: SFX_SCOPE.ACCOUNT, notificationKey: "system-notification" }),

  "system-notification": synthesizedAsset("system-notification", { scope: SFX_SCOPE.ACCOUNT, notificationKey: "system-notification" }),

  "game-invite": synthesizedAsset("game-invite", { scope: SFX_SCOPE.ACCOUNT, notificationKey: "game-invite" }),

  "room-ready-changed": synthesizedAsset("room-ready-changed", { scope: SFX_SCOPE.ROOM, notificationKey: null }),
  "game-started": synthesizedAsset("game-started", { scope: SFX_SCOPE.GAME, notificationKey: null }),

  "game-phase-changed": synthesizedAsset("game-phase-changed", { scope: SFX_SCOPE.GAME, notificationKey: null }),
  "day-phase-changed": synthesizedAsset("day-phase-changed", { scope: SFX_SCOPE.GAME, notificationKey: null }),
  "night-turn-started": synthesizedAsset("night-turn-started", { scope: SFX_SCOPE.GAME, notificationKey: null }),

  "day-vote-submitted": synthesizedAsset("day-vote-submitted", { scope: SFX_SCOPE.GAME, notificationKey: null }),
  "tribunal-vote-submitted": synthesizedAsset("tribunal-vote-submitted", { scope: SFX_SCOPE.GAME, notificationKey: null }),

  "day-vote-resolved": synthesizedAsset("day-vote-resolved", { scope: SFX_SCOPE.GAME, notificationKey: null }),
  "tribunal-vote-resolved": synthesizedAsset("tribunal-vote-resolved", { scope: SFX_SCOPE.GAME, notificationKey: null }),

  "night-private-result": synthesizedAsset("night-private-result", { scope: SFX_SCOPE.GAME, notificationKey: null }),
  "night-private-failure": synthesizedAsset("night-private-failure", { scope: SFX_SCOPE.GAME, notificationKey: null }),

  "player-eliminated": synthesizedAsset("player-eliminated", { scope: SFX_SCOPE.GAME, notificationKey: null }),
  "game-result": synthesizedAsset("game-result", { scope: SFX_SCOPE.GAME, notificationKey: null }),

  "night-success-video": pendingAsset({
    scope: SFX_SCOPE.GAME,
    notificationKey: null,
    audioMode: "embedded",
    silenceReason: "별도 추출 재생은 금지된다 — 승인된 것은 embeddedVideos의 영상 파일 자체뿐이다.",
    embeddedVideos: NIGHT_SUCCESS_VIDEO_TABLE,
  }),
})

export function lookupSfxAsset(manifest, kind) {
  if (typeof kind !== "string" || kind.length === 0) return null
  if (manifest === null || typeof manifest !== "object") return null
  if (!Object.hasOwn(manifest, kind)) return null
  const entry = manifest[kind]
  return entry !== null && typeof entry === "object" && !Array.isArray(entry) ? entry : null
}

export function checkSfxAssetAllowed(entry) {
  if (entry === null || typeof entry !== "object") {
    return { allowed: false, reason: SFX_SUPPRESSED_REASON.UNKNOWN_KIND }
  }
  if (entry.reviewStatus !== SFX_REVIEW_STATUS.APPROVED) {
    return { allowed: false, reason: SFX_SUPPRESSED_REASON.ASSET_UNREVIEWED }
  }
  const required = ["source", "creator", "usageTerms", "sha256", "src"]
  for (const field of required) {
    const value = entry[field]
    if (typeof value !== "string" || value.trim().length === 0) {
      return { allowed: false, reason: SFX_SUPPRESSED_REASON.ASSET_MISSING }
    }
  }
  if (entry.classification !== SFX_CLASSIFICATION.SHORT_NON_MUSICAL) {
    return { allowed: false, reason: SFX_SUPPRESSED_REASON.ASSET_MUSIC }
  }
  if (!Number.isFinite(entry.durationMs) || entry.durationMs <= 0) {
    return { allowed: false, reason: SFX_SUPPRESSED_REASON.ASSET_MISSING }
  }
  if (entry.durationMs > MAX_SEPARATE_SFX_DURATION_MS) {
    return { allowed: false, reason: SFX_SUPPRESSED_REASON.ASSET_TOO_LONG }
  }
  return { allowed: true, entry }
}

export function verifyLoadedSfxAsset(entry, loaded) {
  if (loaded === null || typeof loaded !== "object") {
    return { ok: false, reason: SFX_SUPPRESSED_REASON.ASSET_MISSING }
  }
  if (typeof loaded.sha256 !== "string" || loaded.sha256.length === 0) {
    return { ok: false, reason: SFX_SUPPRESSED_REASON.ASSET_HASH_MISMATCH }
  }
  if (loaded.sha256 !== entry.sha256) {
    return { ok: false, reason: SFX_SUPPRESSED_REASON.ASSET_HASH_MISMATCH }
  }
  if (typeof loaded.src !== "string" || loaded.src.length === 0) {
    return { ok: false, reason: SFX_SUPPRESSED_REASON.ASSET_MISSING }
  }
  return { ok: true, src: loaded.src }
}

export function listSilencedSfxKinds(manifest = SFX_MANIFEST) {
  return Object.entries(manifest)
    .filter(([, entry]) => !checkSfxAssetAllowed(entry).allowed)
    .map(([kind, entry]) => ({
      kind,
      reason: checkSfxAssetAllowed(entry).reason,
      note: entry?.silenceReason ?? null,
    }))
}
