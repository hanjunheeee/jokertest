import { useSyncExternalStore } from "react"
import {
  INVITE_SFX_QA_FLAG,
  getInviteSfxDiagnosticsAccount,
  getInviteSfxObservations,
  isInviteSfxDiagnosticsEnabled,
  subscribeInviteSfxObservations,
  summarizeInviteSfxObservations,
} from "@/domains/lobby/diagnostics/inviteSfxDiagnostics.js"

/**
 * F-19 AC-07 · 초대 수신음 흐름의 QA 관찰 화면(개발 번들 + `?qaInviteSfx=1` 전용).
 *
 * **읽기 전용이다.** 여기서 초대를 만들거나 소리를 내거나 store를 바꾸는 일은 없다 —
 * 이미 돌고 있는 런타임이 내린 판정을 그대로 보여줄 뿐이다. 그래서 이 화면이 있든 없든
 * 초대 수락·거절·입장은 똑같이 동작한다.
 *
 * 두 수를 **분리해서** 보여주는 것이 핵심이다:
 *   · 적격 판정(dispatch 시도) — 커서 이후의 진짜 신규 수신으로 인정된 횟수
 *   · 재생 완료(played)        — 재생기의 완료 보고 횟수(실제 청음 증거가 아님)
 * 배포 자산이 미검토인 지금은 "적격 1 · 청음 0 · 사유 asset-unreviewed"가 정상이며,
 * 이것을 1회 청음으로 적지 않는다.
 */
export default function InviteSfxDiagnosticsPanel() {
  const observations = useSyncExternalStore(
    subscribeInviteSfxObservations,
    getInviteSfxObservations,
    getInviteSfxObservations,
  )

  if (!isInviteSfxDiagnosticsEnabled()) return null

  const summary = summarizeInviteSfxObservations(observations)
  const account = getInviteSfxDiagnosticsAccount()
  const suppressed = Object.entries(summary.suppressedByReason)

  // F-15(AC-02): 명시적 글자 크기는 공용 배율 경로를 지난다(GameInviteTab과 같은 관례).
  return (
    <section
      data-testid="invite-sfx-diagnostics"
      aria-label="QA 초대 소리 진단(읽기 전용)"
      className="app-text-scaled [--app-text-size:10px] mt-2 max-h-40 overflow-y-auto rounded border border-amber-700/60 bg-black/70 p-2 leading-tight text-amber-100"
    >
      <p className="font-bold">
        QA 진단 · 읽기 전용 (?{INVITE_SFX_QA_FLAG}=1)
      </p>
      <p data-testid="invite-sfx-diagnostics-scope">
        관찰 계정: {account === null ? "없음" : `…${account.slice(-6)}`}
      </p>
      <p data-testid="invite-sfx-diagnostics-summary">
        수신 {summary.arrivals} · 적격 판정 {summary.eligibleDispatches} · 재생 완료{" "}
        {summary.audiblePlaybacks}
      </p>
      <p>재생 완료는 재생기 보고이며 실제 청음을 확인한 값이 아닙니다.</p>
      {suppressed.length > 0 ? (
        <ul data-testid="invite-sfx-diagnostics-reasons">
          {suppressed.map(([reason, count]) => (
            <li key={reason}>
              {reason} × {count}
            </li>
          ))}
        </ul>
      ) : null}
      <ol data-testid="invite-sfx-diagnostics-entries">
        {observations.map((entry) => (
          <li key={entry.seq}>
            #{entry.seq} {entry.foreignAccount ? "(다른 계정)" : (entry.inviteId ?? "-")} ·{" "}
            {entry.eligible ? "적격" : "무음"} · {entry.eligible ? (entry.dispatchReason ?? entry.dispatchStatus ?? "-") : entry.reason}
            {entry.playback === null ? "" : ` · 재생=${entry.playback}`}
          </li>
        ))}
      </ol>
    </section>
  )
}
