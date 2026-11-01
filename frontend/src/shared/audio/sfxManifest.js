// 효과음 목록 (종류별 자산·범위·알림 설정 키)과 재생 못 하는 종류 모아 보기
// 효과음 플레이어 연결 훅·자산 불러오기·밤 성공 영상·시험이 이 경로로 씀 (상수·자산 검사도 여기서 다시 내보냄)
import { SFX_GENERATED_ASSETS } from "./sfxGeneratedAssets.js"
import { SFX_CLASSIFICATION, SFX_REVIEW_STATUS, SFX_SCOPE } from "../constants/sfx.js"
import { checkSfxAssetAllowed } from "../utils/sfx/asset.js"

// 바깥에서 쓰던 이름 그대로 다시 내보냄
export {
  SFX_REVIEW_STATUS,
  MAX_SEPARATE_SFX_DURATION_MS,
  SFX_LOAD_TIMEOUT_MS,
  SFX_SUPPRESSED_REASON,
  SFX_SCOPE,
  SFX_CLASSIFICATION,
} from "../constants/sfx.js"
export { checkSfxAssetAllowed } from "../utils/sfx/asset.js"

// 밤 성공 영상은 소리가 영상 안에 들어 있음 (역할-대상별 영상 파일)
const NIGHT_SUCCESS_VIDEO_TABLE = Object.freeze({
  "KILL-USER": "/video-direction/night-success-kill-user-stacked.mp4",
  "KILL-TARGET": "/video-direction/night-success-kill-target-stacked.mp4",
  "HEAL-USER": "/video-direction/night-success-heal-stacked.mp4",
  "HEAL-TARGET": "/video-direction/night-success-heal-stacked.mp4",
  "INVESTIGATE-USER": "/video-direction/night-success-investigate-user-stacked.mp4",
  "CONFIRM-USER": "/video-direction/night-success-confirm-user-stacked.mp4",
})

// 자산·이용 조건 검토 전인 소리는 재생하지 않음
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

// 저장소 스크립트로 만든 소리는 검수 통과로 봄, 생성 목록에 없으면 바로 던짐
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

// 재생 못 하는 종류와 이유 (진단 화면·시험용)
export function listSilencedSfxKinds(manifest = SFX_MANIFEST) {
  return Object.entries(manifest)
    .filter(([, entry]) => !checkSfxAssetAllowed(entry).allowed)
    .map(([kind, entry]) => ({
      kind,
      reason: checkSfxAssetAllowed(entry).reason,
      note: entry?.silenceReason ?? null,
    }))
}
