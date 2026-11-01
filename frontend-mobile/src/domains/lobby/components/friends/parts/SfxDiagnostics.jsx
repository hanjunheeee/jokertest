// 초대 효과음 확인용 QA 진단 칸 (개발 빌드 + 주소 ?qaInviteSfx=1일 때만 보임)
// 친구 시트(FriendsSheet)가 맨 아래에 그림
import { useSyncExternalStore } from "react"
import {
  INVITE_SFX_QA_FLAG,
  getInviteSfxDiagnosticsAccount,
  getInviteSfxObservations,
  isInviteSfxDiagnosticsEnabled,
  subscribeInviteSfxObservations,
  summarizeInviteSfxObservations,
} from "@/domains/lobby/diagnostics/inviteSfxDiagnostics.js"

// 데스크톱 InviteSfxDiagnosticsPanel과 같은 내용 (데스크톱 화면은 못 불러 따로 둠)
export default function SfxDiagnostics() {
  const observations = useSyncExternalStore(
    subscribeInviteSfxObservations,
    getInviteSfxObservations,
    getInviteSfxObservations,
  )

  // 훅은 먼저 부르고, 진단이 꺼져 있으면 안 그림
  if (!isInviteSfxDiagnosticsEnabled()) return null

  const summary = summarizeInviteSfxObservations(observations)
  const account = getInviteSfxDiagnosticsAccount()
  const suppressed = Object.entries(summary.suppressedByReason)

  return (
    <section
      data-testid="invite-sfx-diagnostics"
      aria-label="QA 초대 소리 진단(읽기 전용)"
      className="app-text-scaled [--app-text-size:11px] mt-2 max-h-32 shrink-0 overflow-y-auto rounded border border-amber-700/60 bg-black/70 p-2 leading-tight text-amber-100"
    >
      <p className="font-bold text-inherit">QA 진단 · 읽기 전용 (?{INVITE_SFX_QA_FLAG}=1)</p>
      <p className="text-inherit">관찰 계정: {account === null ? "없음" : `…${account.slice(-6)}`}</p>
      <p className="text-inherit">
        수신 {summary.arrivals} · 적격 판정 {summary.eligibleDispatches} · 재생 완료 {summary.audiblePlaybacks}
      </p>
      <p className="text-inherit">재생 완료는 재생기 보고이며 실제 청음을 확인한 값이 아닙니다.</p>
      {suppressed.length > 0 ? (
        <ul>
          {suppressed.map(([reason, count]) => <li key={reason}>{reason} × {count}</li>)}
        </ul>
      ) : null}
      <ol>
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
