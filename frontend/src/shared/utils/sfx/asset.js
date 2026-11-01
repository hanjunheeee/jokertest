// 효과음 자산 검사 (목록에서 찾기·재생해도 되는 자산인지·불러온 파일 해시 확인)
// 효과음 플레이어·효과음 목록이 씀 (sfxManifest.js가 같은 이름으로 다시 내보냄)
import {
  MAX_SEPARATE_SFX_DURATION_MS,
  SFX_CLASSIFICATION,
  SFX_REVIEW_STATUS,
  SFX_SUPPRESSED_REASON,
} from "../../constants/sfx.js"

// 목록에 자기 키로 있는 객체만 돌려줌
export function lookupSfxAsset(manifest, kind) {
  if (typeof kind !== "string" || kind.length === 0) return null
  if (manifest === null || typeof manifest !== "object") return null
  if (!Object.hasOwn(manifest, kind)) return null
  const entry = manifest[kind]
  return entry !== null && typeof entry === "object" && !Array.isArray(entry) ? entry : null
}

// 검수 통과·출처 정보 다 있음·음악 아님·2초 이하일 때만 재생 허용
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

// 불러온 파일의 해시가 목록 해시와 같을 때만 재생 주소를 줌
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
