// 효과음 요청의 계정·판·방 범위 맞추기와 받아들일지 판정
// sfxPlayer.js가 만들고 재생 요청·임베드 소유가 admit·sync를 씀
import { SFX_COMPLETION, SFX_SCOPE, SFX_SUPPRESSED_REASON } from "../../constants/sfx.js"
import { lookupSfxAsset } from "../../utils/sfx/asset.js"
import { buildKey, guard, pickId, validateEvent } from "../../utils/sfx/event.js"

export function createScope(ctx, stopActive) {
  const { getScope, manifest } = ctx

  // 지금 계정·판·방, 못 읽으면 전부 null
  function read() {
    const scope = guard(() => getScope?.(), null)
    if (scope === null || typeof scope !== "object") return { accountId: null, gameId: null, roomId: null }
    return { accountId: pickId(scope.accountId), gameId: pickId(scope.gameId), roomId: pickId(scope.roomId) }
  }

  // 범위가 바뀌면 세대를 올리고 임베드 소유를 풀고 재생 중인 소리를 멈춤
  function sync() {
    if (ctx.disposed) return
    const next = read()
    const accountChanged = next.accountId !== ctx.lastScope.accountId
    const gameChanged = next.gameId !== ctx.lastScope.gameId
    const roomChanged = next.roomId !== ctx.lastScope.roomId
    if (!accountChanged && !gameChanged && !roomChanged) return

    const previous = ctx.lastScope
    ctx.lastScope = next
    ctx.generation += 1
    for (const claim of [...ctx.embeddedClaims]) claim.release()

    // 계정이 바뀌면 낸 소리 기록 전부, 판·방만 바뀌면 그 판·방 기록만 지움
    if (accountChanged) {
      ctx.handled.clear()
    } else {
      if (gameChanged && previous.gameId !== null) dropSegment(`game:${previous.gameId}`)
      if (roomChanged && previous.roomId !== null) dropSegment(`room:${previous.roomId}`)
    }

    stopActive(SFX_COMPLETION.STOPPED)
  }

  function dropSegment(segment) {
    for (const key of [...ctx.handled.keys()]) {
      if (key.includes(`|${segment}|`)) ctx.handled.delete(key)
    }
  }

  // 소리 종류의 범위에 맞는 계정·판·방인지 보고 중복 키 앞부분을 정함
  function check(entry, event) {
    const scope = ctx.lastScope
    if (entry.scope === SFX_SCOPE.UI) {
      return { ok: true, prefix: `ui|${scope.accountId ?? "anon"}` }
    }

    // 화면 소리 말고는 로그인 계정과 요청 계정이 같아야 함
    if (scope.accountId === null) return { ok: false, reason: SFX_SUPPRESSED_REASON.ANONYMOUS_SCOPE }
    if (event.accountId === null) return { ok: false, reason: SFX_SUPPRESSED_REASON.MISSING_SCOPE }
    if (event.accountId !== scope.accountId) return { ok: false, reason: SFX_SUPPRESSED_REASON.ACCOUNT_MISMATCH }

    if (entry.scope === SFX_SCOPE.GAME) {
      if (event.gameId === null) return { ok: false, reason: SFX_SUPPRESSED_REASON.MISSING_SCOPE }
      if (scope.gameId === null || event.gameId !== scope.gameId) {
        return { ok: false, reason: SFX_SUPPRESSED_REASON.GAME_MISMATCH }
      }
      return { ok: true, prefix: `acct:${scope.accountId}|game:${scope.gameId}` }
    }

    if (entry.scope === SFX_SCOPE.ROOM) {
      if (event.roomId === null) return { ok: false, reason: SFX_SUPPRESSED_REASON.MISSING_SCOPE }
      if (scope.roomId === null || event.roomId !== scope.roomId) {
        return { ok: false, reason: SFX_SUPPRESSED_REASON.ROOM_MISMATCH }
      }
      return { ok: true, prefix: `acct:${scope.accountId}|room:${scope.roomId}` }
    }

    return { ok: true, prefix: `acct:${scope.accountId}` }
  }

  // 요청 검사 → 목록에 있는 소리 → 실시간 요청 → 범위 → 중복 순으로 거름, 통과하면 낸 소리로 적음
  function admit(rawEvent) {
    if (ctx.disposed) return { ok: false, reason: SFX_SUPPRESSED_REASON.DISPOSED }

    const event = validateEvent(rawEvent)
    if (event === null) return { ok: false, reason: SFX_SUPPRESSED_REASON.INVALID_EVENT }

    const entry = lookupSfxAsset(manifest, event.kind)
    if (entry === null) return { ok: false, reason: SFX_SUPPRESSED_REASON.UNKNOWN_KIND, event }

    if (event.origin !== "live") return { ok: false, reason: SFX_SUPPRESSED_REASON.RESTORE_ORIGIN, event }

    sync()
    const scopeCheck = check(entry, event)
    if (!scopeCheck.ok) return { ok: false, reason: scopeCheck.reason, event }

    const key = buildKey(scopeCheck.prefix, event)
    if (ctx.handled.has(key)) return { ok: false, reason: SFX_SUPPRESSED_REASON.DUPLICATE, event }

    ctx.handled.set(key, true)
    return { ok: true, entry, event, key, generation: ctx.generation }
  }

  return { read, sync, admit }
}
