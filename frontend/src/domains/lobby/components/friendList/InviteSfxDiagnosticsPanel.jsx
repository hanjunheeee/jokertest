// 초대 효과음 확인용 진단 패널 (진단이 켜졌을 때만 보임)
// 친구 목록 패널 내용이 씀
import { useSyncExternalStore } from "react"
import {
  INVITE_SFX_QA_FLAG,
  getInviteSfxDiagnosticsAccount,
  getInviteSfxObservations,
  isInviteSfxDiagnosticsEnabled,
  subscribeInviteSfxObservations,
  summarizeInviteSfxObservations,
} from "@/domains/lobby/diagnostics/inviteSfxDiagnostics.js"

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
