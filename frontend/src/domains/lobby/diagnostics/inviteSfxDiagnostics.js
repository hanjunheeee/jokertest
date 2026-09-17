/**
 * F-19 AC-07 · 초대 수신음 흐름의 **읽기 전용** QA 진단.
 *
 * ── 왜 있는가 ────────────────────────────────────────────────────────────────
 * AC-07은 "신규 수신 1회 · 중복/복원/재접속 0회"를 실제 브라우저에서 확인하라고 요구한다.
 * 그런데 배포 manifest의 game-invite 자산은 아직 미검토라 **소리 자체가 나지 않는다**.
 * 그래서 운영자가 귀로는 "1회 울림"을 셀 수 없고, 화면에도 그 판정이 드러나지 않아
 * 증거를 만들 수 없었다. 이 모듈은 이미 돌고 있는 런타임이 내린 판정을 **그대로 옮겨 적는**
 * 관찰자다.
 *
 * ── 하지 않는 것 (계약) ──────────────────────────────────────────────────────
 *   · 초대를 만들거나 사건을 합성하지 않는다.
 *   · store를 바꾸지 않는다(소리 표식 소모도 하지 않는다 — 판정은 전부 기존 경계의 것이다).
 *   · Audio를 대체하거나 자산을 승인하지 않는다. 무음은 무음 그대로 사유와 함께 적는다.
 *   · 인증을 우회하지 않고 토큰·비밀값을 담지 않는다.
 *   · 어떤 실패도 수락·거절·입장 경로로 전파하지 않는다(모든 기록은 try로 감싼다).
 *
 * ── 켜지는 조건 ──────────────────────────────────────────────────────────────
 * 개발 번들(import.meta.env.DEV)이면서 URL에 QA 표식(`?qaInviteSfx=1`)이 있을 때만 켜진다.
 * production 번들에서는 두 번째 조건과 무관하게 항상 꺼져 있다.
 *
 * 기록은 현재 계정 범위에서만 유지되고 상한이 있다. 계정이 바뀌거나 로그아웃하면 버린다.
 */

/** QA 표식 이름. 문서와 화면 라벨에 같은 문자열을 쓴다. */
export const INVITE_SFX_QA_FLAG = "qaInviteSfx";

/** 보관 상한 — 무한히 자라지 않게 한다. */
export const INVITE_SFX_DIAGNOSTICS_LIMIT = 40;

/**
 * 환경 접근자. 기본값은 실제 번들 환경이고, 시험만 갈아끼운다.
 *
 * `import.meta.env`는 vite가 주입한다 — node:test에서는 undefined라 기본값이 그대로
 * "production 아님 + DEV 아님"이 되어 꺼진다. 그래서 "production 제외" 시험은 기본값으로,
 * "켜짐" 시험은 주입으로 확인한다.
 */
let readEnv = () => ({
    dev: import.meta.env?.DEV === true,
    search: typeof window !== "undefined" ? (window.location?.search ?? "") : "",
});

/** 시험 전용 — 런타임 코드에서는 쓰지 않는다. */
export function __setInviteSfxDiagnosticsEnvForTests(next) {
    readEnv = next ?? (() => ({ dev: false, search: "" }));
}

/** 개발 번들이면서 QA 표식이 붙어 있을 때만 켜진다. */
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

/**
 * 관찰 기록. 계정 하나의 것만 들고 있는다.
 *
 * **바뀔 때만 새 배열로 바꾼다.** useSyncExternalStore의 getSnapshot은 값이 그대로면 같은
 * 참조를 돌려줘야 하기 때문이다(매번 복사본을 만들면 렌더가 끝없이 반복된다). 대신 배열을
 * 얼려서 호출자가 원본을 건드리지 못하게 한다.
 */
let scopeAccountId = null;
let entries = Object.freeze([]);
let entrySeq = 0;
const listeners = new Set();

function notify() {
    for (const listener of [...listeners]) {
        try { listener(); } catch { /* 구독자 오류가 다음 구독자를 막지 않는다 */ }
    }
}

/** 계정이 바뀌면(또는 로그아웃) 이전 계정의 관찰을 통째로 버린다. */
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

/**
 * 관찰 하나를 적는다. **꺼져 있으면 build()를 부르지도 않는다.**
 *
 * @param {() => object} build 기록할 값을 만드는 함수(켜졌을 때만 실행된다)
 * @returns {number|null} 적힌 기록의 번호(꺼져 있거나 실패하면 null)
 */
export function recordInviteSfxObservation(build) {
    if (!isInviteSfxDiagnosticsEnabled()) return null;
    try {
        const raw = build();
        if (raw === null || typeof raw !== "object") return null;
        // 현재 계정 범위 밖의 관찰은 "다른 계정"이라는 사실만 남기고 식별자는 담지 않는다.
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
                // 기존 경계가 내린 판정 그대로.
                eligible: raw.eligible === true,
                reason: raw.reason ?? null,
                // "재생 시도"와 "실제 청음"은 다른 사실이다(sfxPlayer 계약).
                dispatchStatus: raw.dispatchStatus ?? null,
                dispatchReason: raw.dispatchReason ?? null,
                playback: raw.playback ?? null,
            }),
        ]);
        notify();
        return entrySeq;
    } catch {
        // 진단은 어떤 경우에도 초대 수락·거절·입장을 막지 않는다.
        return null;
    }
}

/**
 * 재생 시도가 실제로 어떻게 정착했는지(played|failed|timed-out|stopped) 뒤늦게 적는다.
 * completion을 **기다리지 않는** 업무 경로와 별개로 돌며, 실패해도 조용히 끝난다.
 */
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

/**
 * 지금까지의 관찰(최신이 뒤). 얼린 배열을 **같은 참조로** 돌려준다 —
 * useSyncExternalStore가 값이 그대로일 때 다시 렌더하지 않게 하기 위해서다.
 */
export function getInviteSfxObservations() {
    return entries;
}

/** 현재 관찰 범위 계정(없으면 null). */
export function getInviteSfxDiagnosticsAccount() {
    return scopeAccountId;
}

export function subscribeInviteSfxObservations(listener) {
    if (typeof listener !== "function") return () => {};
    listeners.add(listener);
    return () => listeners.delete(listener);
}

/**
 * 화면에 보여줄 요약. "적격 판정"과 "실제 청음"을 **따로** 센다 —
 * 미검토 자산이면 적격 1건에 청음 0건이 정상이고, 그것을 1회 청음으로 적지 않는다.
 */
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
