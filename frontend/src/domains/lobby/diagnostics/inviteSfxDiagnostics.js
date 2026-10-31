export const INVITE_SFX_QA_FLAG = "qaInviteSfx";

export const INVITE_SFX_DIAGNOSTICS_LIMIT = 40;

let readEnv = () => ({
    dev: import.meta.env?.DEV === true,
    search: typeof window !== "undefined" ? (window.location?.search ?? "") : "",
});

export function __setInviteSfxDiagnosticsEnvForTests(next) {
    readEnv = next ?? (() => ({ dev: false, search: "" }));
}

export function isInviteSfxDiagnosticsEnabled() {
    try {
        const env = readEnv();
        if (env?.dev !== true) return false;
        const params = new URLSearchParams(env.search ?? "");
        const value = params.get(INVITE_SFX_QA_FLAG);
        return value === "1" || value === "true";
    } catch {
        return false;
    }
}

let scopeAccountId = null;
let entries = Object.freeze([]);
let entrySeq = 0;
const listeners = new Set();

function notify() {
    for (const listener of [...listeners]) {
        try { listener(); } catch {}
    }
}

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

export function summarizeInviteSfxObservations(observations = getInviteSfxObservations()) {
    const summary = {
        arrivals: 0,
        eligibleDispatches: 0,
        audiblePlaybacks: 0,
        suppressedByReason: {},
    };
    for (const entry of observations) {
        if (entry.phase === "received") summary.arrivals += 1;
        if (entry.eligible) summary.eligibleDispatches += 1;
        if (entry.playback === "played") summary.audiblePlaybacks += 1;
        const reason = entry.eligible ? entry.dispatchReason : entry.reason;
        if (typeof reason === "string" && reason.length > 0) {
            summary.suppressedByReason[reason] = (summary.suppressedByReason[reason] ?? 0) + 1;
        }
    }
    return summary;
}
