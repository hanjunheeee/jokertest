// 게임 초대 소리 진단 기록 (계정별 최근 기록·재생 결과 붙이기·구독)
// 초대 소리 흐름·진단 패널·시험이 입구 파일로 씀
import { INVITE_SFX_DIAGNOSTICS_LIMIT } from "../../constants/inviteSfxDiagnostics.js";
import { isInviteSfxDiagnosticsEnabled } from "./flag.js";

let scopeAccountId = null;
let entries = Object.freeze([]);
let entrySeq = 0;
const listeners = new Set();

// 구독자 하나가 터져도 나머지는 알림 받게 함
function notify() {
    for (const listener of [...listeners]) {
        try { listener(); } catch { /* 구독자 오류는 기록을 막지 않게 무시함 */ }
    }
}

// 계정이 바뀌면 이전 계정 기록을 지움
export function syncInviteSfxDiagnosticsAccount(accountId) {
    const next = typeof accountId === "string" && accountId.length > 0 ? accountId : null;
    if (next === scopeAccountId) return;
    scopeAccountId = next;
    entries = Object.freeze([]);
    notify();
}

export function resetInviteSfxDiagnostics() {
    scopeAccountId = null;
    entries = Object.freeze([]);
    entrySeq = 0;
    notify();
}

// 진단이 켜졌을 때만 기록을 만듦, 다른 계정 사건은 id를 지우고 표시만 남김
export function recordInviteSfxObservation(build) {
    if (!isInviteSfxDiagnosticsEnabled()) return null;
    try {
        const raw = build();
        if (raw === null || typeof raw !== "object") return null;
        const foreign = typeof raw.accountId === "string" && raw.accountId !== scopeAccountId;
        entrySeq += 1;
        entries = Object.freeze([
            ...entries.slice(Math.max(0, entries.length - (INVITE_SFX_DIAGNOSTICS_LIMIT - 1))),
            Object.freeze({
                seq: entrySeq,
                phase: typeof raw.phase === "string" ? raw.phase : "unknown",
                inviteId: foreign ? null : (raw.inviteId ?? null),
                eventId: foreign ? null : (raw.eventId ?? null),
                creationSeq: foreign ? null : (raw.creationSeq ?? null),
                foreignAccount: foreign,
                eligible: raw.eligible === true,
                reason: raw.reason ?? null,
                dispatchStatus: raw.dispatchStatus ?? null,
                dispatchReason: raw.dispatchReason ?? null,
                playback: raw.playback ?? null,
            }),
        ]);
        notify();
        return entrySeq;
    } catch {
        return null;
    }
}

// 재생이 끝나면 그 기록에 결과를 붙임 (그사이 밀려난 기록이면 무시)
export function trackInviteSfxCompletion(seq, completion) {
    if (!Number.isInteger(seq)) return;
    if (completion === null || typeof completion?.then !== "function") return;
    completion.then(
        (settled) => {
            if (!entries.some((entry) => entry.seq === seq)) return;
            entries = Object.freeze(entries.map((entry) => (
                entry.seq === seq ? Object.freeze({ ...entry, playback: settled }) : entry
            )));
            notify();
        },
        () => {},
    );
}

export function getInviteSfxObservations() {
    return entries;
}

export function getInviteSfxDiagnosticsAccount() {
    return scopeAccountId;
}

export function subscribeInviteSfxObservations(listener) {
    if (typeof listener !== "function") return () => {};
    listeners.add(listener);
    return () => listeners.delete(listener);
}
