/**
 * F-16 AC-02 · 효과음 자산 manifest.
 *
 * 이 파일은 "무엇을 재생해도 되는가"의 유일한 출처다. 사건 kind마다 자산의 출처·제작자·
 * 이용 조건·실제 파일 sha256·검토 상태·길이를 기록하고, 그 어느 하나라도 부족하면 매체를
 * 만들지 않고 무음 사유를 남긴다(A-04).
 *
 * 중요: 지금 이 저장소에는 **이용 조건이 확인된 효과음 자산이 하나도 제공되지 않았다.**
 * 그래서 모든 항목이 reviewStatus=needs_assets_and_usage_review이고 src/sha256이 null이다 —
 * 존재하지 않는 경로·해시를 지어내지 않는다는 A-04를 그대로 지킨다. 결과적으로 F-16이
 * 연결한 모든 사건은 "허용 검사에서 무음 + 사유 기록"으로 끝난다. 이것은 설계 실패가 아니라
 * 계약대로의 동작이며, 실제 청음 완료를 뜻하지 않는다.
 *
 * 자산이 확보되면 해당 항목의 source/creator/usageTerms/sha256/src/durationMs를 채우고
 * reviewStatus를 SFX_REVIEW_STATUS.APPROVED로 바꾸는 것만으로 재생이 열린다 — 재생기 코드는
 * 바뀌지 않는다.
 */

/** 자산 검토 상태. APPROVED만 재생을 허용한다. */
export const SFX_REVIEW_STATUS = Object.freeze({
  APPROVED: "approved",
  NEEDS_REVIEW: "needs_assets_and_usage_review",
})

/**
 * 별도(separate) 효과음의 최대 허용 길이. A-04의 "검토된 최대 2초의 짧은 비음악 자산"이다.
 * 승인 MOV 5개의 4~5초 내장음(embedded)에는 적용하지 않는다 — 그 경로는 claimAudio가
 * 담당하고 길이 제한을 두지 않는다.
 */
export const MAX_SEPARATE_SFX_DURATION_MS = 2000

/** 자산 로드 제한 시간(A-04·중복/수명 계약). */
export const SFX_LOAD_TIMEOUT_MS = 3000

/** 재생이 스스로 끝나지 않을 때 정리하는 여유 시간. 실제 정리는 길이 + 이 값이다. */
export const SFX_PLAYBACK_WATCHDOG_MS = 1000

/** 같은 물리 입력이 아닌 연타를 억제하는 최소 간격(일반 UI 클릭 전용). */
export const SFX_UI_COOLDOWN_MS = 120

/** 재생을 거부한 이유. dispatch()의 reason과 무음 기록에 그대로 쓴다. */
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

/** 사건이 어느 범위 키로 중복을 판정하는가. */
export const SFX_SCOPE = Object.freeze({
  ACCOUNT: "account", // 친구·업적처럼 계정 전역에서 한 번만 나는 사건
  GAME: "game",
  ROOM: "room",
  UI: "ui", // 물리 활성화 단위 — 서버 사건이 아니다
})

/**
 * 자산이 음악인지(별도 효과음으로 등록 금지) 짧은 비음악 효과음인지.
 * A-04: "멜로디·BGM·영상 음악을 별도 효과음으로 등록한다"를 검사로 막는다.
 */
export const SFX_CLASSIFICATION = Object.freeze({
  SHORT_NON_MUSICAL: "short-non-musical",
  MUSIC: "music",
})

/** 아직 자산이 제공되지 않은 항목의 공통 형태 — 경로·해시를 지어내지 않는다. */
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

/**
 * 사건 kind → 자산·범위·알림 설정 키.
 *
 * notificationKey가 있으면 settingsStore.generalChecks의 그 항목이 꺼져 있을 때 재생하지
 * 않는다. audioMode=embedded는 F-27의 영상 내장음이 소유하는 사건이라 별도 음을 내지
 * 않는다(현재는 해당 항목 없음 — F-27이 claimAudio로 선점한다).
 */
export const SFX_MANIFEST = Object.freeze({
  // --- 실제 입력(AC-01 버튼 클릭/확인/취소) -------------------------------
  "ui-click": pendingAsset({ scope: SFX_SCOPE.UI, notificationKey: null }),
  "ui-confirm": pendingAsset({ scope: SFX_SCOPE.UI, notificationKey: null }),
  "ui-cancel": pendingAsset({ scope: SFX_SCOPE.UI, notificationKey: null }),

  // --- 친구(AC-01) --------------------------------------------------------
  "friend-request-received": pendingAsset({ scope: SFX_SCOPE.ACCOUNT, notificationKey: "friend-invite" }),
  "friend-request-accepted": pendingAsset({ scope: SFX_SCOPE.ACCOUNT, notificationKey: "friend-invite" }),
  "friend-request-declined": pendingAsset({ scope: SFX_SCOPE.ACCOUNT, notificationKey: "friend-invite" }),

  // --- 업적 보상(AC-01) ---------------------------------------------------
  "achievement-granted": pendingAsset({ scope: SFX_SCOPE.ACCOUNT, notificationKey: "system-notification" }),

  // --- 시스템 알림(F-17 AC-07) -------------------------------------------
  // 서버가 생산하는 새 시스템 알림(notification.service.js의 ensureSystemWelcome)의 소리.
  // 계정 전역 사건이라 scope=account이고, 표시 설정은 업적과 같은 "시스템 알림" 항목을
  // 쓴다(A-03). 자산은 여전히 미검토라 재생기가 매체를 만들기 전에 asset-unreviewed로
  // 거부한다 — 이 항목을 추가했다고 소리가 나는 것이 아니다(A-07).
  "system-notification": pendingAsset({ scope: SFX_SCOPE.ACCOUNT, notificationKey: "system-notification" }),

  // --- 준비·시작(AC-01) ---------------------------------------------------
  "room-ready-changed": pendingAsset({ scope: SFX_SCOPE.ROOM, notificationKey: null }),
  "game-started": pendingAsset({ scope: SFX_SCOPE.GAME, notificationKey: null }),

  // --- 턴 전환(AC-01) -----------------------------------------------------
  "game-phase-changed": pendingAsset({ scope: SFX_SCOPE.GAME, notificationKey: null }),
  "day-phase-changed": pendingAsset({ scope: SFX_SCOPE.GAME, notificationKey: null }),
  "night-turn-started": pendingAsset({ scope: SFX_SCOPE.GAME, notificationKey: null }),

  // --- 투표 제출(AC-01) ---------------------------------------------------
  // 제출(내 ACK)과 판정(전체 방송)은 서로 다른 kind다 — 같은 kind로 묶으면 내 제출과 그
  // 라운드의 판정이 같은 중복 키 공간을 공유하게 된다.
  "day-vote-submitted": pendingAsset({ scope: SFX_SCOPE.GAME, notificationKey: null }),
  "tribunal-vote-submitted": pendingAsset({ scope: SFX_SCOPE.GAME, notificationKey: null }),

  // --- 투표 판정(AC-01) ---------------------------------------------------
  "day-vote-resolved": pendingAsset({ scope: SFX_SCOPE.GAME, notificationKey: null }),
  "tribunal-vote-resolved": pendingAsset({ scope: SFX_SCOPE.GAME, notificationKey: null }),

  // --- 개인 사건(AC-05) ---------------------------------------------------
  // INVESTIGATE·CONFIRM의 개인 결과음. ASSASSINATE success:false는 아래 실패 통지로
  // 따로 매핑한다 — 실패를 성공음으로 둔갑시키지 않는다.
  "night-private-result": pendingAsset({ scope: SFX_SCOPE.GAME, notificationKey: null }),
  "night-private-failure": pendingAsset({ scope: SFX_SCOPE.GAME, notificationKey: null }),

  // --- 사망·결과(AC-01) ---------------------------------------------------
  "player-eliminated": pendingAsset({ scope: SFX_SCOPE.GAME, notificationKey: null }),
  "game-result": pendingAsset({ scope: SFX_SCOPE.GAME, notificationKey: null }),
})

/** manifest에서 kind 항목을 찾는다. 모르는 kind는 null이다(추측하지 않는다). */
export function lookupSfxAsset(manifest, kind) {
  if (typeof kind !== "string" || kind.length === 0) return null
  if (manifest === null || typeof manifest !== "object") return null
  if (!Object.hasOwn(manifest, kind)) return null
  const entry = manifest[kind]
  return entry !== null && typeof entry === "object" && !Array.isArray(entry) ? entry : null
}

/**
 * 매체를 만들기 **전에** 하는 자산 허용 검사(AC-02).
 *
 * 허용 metadata만으로 파일 일치를 보장하지 않으므로, 여기를 통과해도 로드한 데이터의
 * 해시를 다시 대조해야 실제로 재생한다(verifyLoadedSfxAsset).
 *
 * @returns {{ allowed: true, entry: object } | { allowed: false, reason: string }}
 */
export function checkSfxAssetAllowed(entry) {
  if (entry === null || typeof entry !== "object") {
    return { allowed: false, reason: SFX_SUPPRESSED_REASON.UNKNOWN_KIND }
  }
  if (entry.reviewStatus !== SFX_REVIEW_STATUS.APPROVED) {
    return { allowed: false, reason: SFX_SUPPRESSED_REASON.ASSET_UNREVIEWED }
  }
  // 검토 상태만 승인으로 바꾸고 출처·이용 조건·해시·경로를 비워 두는 실수를 막는다.
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

/**
 * 로드해 온 자산의 실제 해시가 검토 기록과 같은지 확인한다(AC-02). 로더가 해시를 돌려주지
 * 못하면 일치를 "가정"하지 않고 불일치로 본다 — 검증되지 않은 바이트를 매체에 넘기지 않는다.
 */
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

/**
 * 현재 manifest에서 무음으로 남아 있는 항목과 사유를 돌려준다 — AC-02의 "미확인 자산은
 * 무음과 사유를 기록한다"를 코드에서 직접 읽을 수 있게 한다(문서 사본이 아니라 실제 값).
 */
export function listSilencedSfxKinds(manifest = SFX_MANIFEST) {
  return Object.entries(manifest)
    .filter(([, entry]) => !checkSfxAssetAllowed(entry).allowed)
    .map(([kind, entry]) => ({
      kind,
      reason: checkSfxAssetAllowed(entry).reason,
      note: entry?.silenceReason ?? null,
    }))
}
