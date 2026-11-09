// 점검 화면 파일, 지금 점검 상태·남은 판·방 + 점검 예약/바꾸기/끄기(확인 창) + 서버별 결과 + 옆에 점검 순서 8단계
// 메뉴 표(adminRoutes) '/maintenance'가 붙임, 30초마다 백그라운드로 다시 읽음 (남은 판 수·강제 종료 결과 따라감)
import { useCallback, useEffect, useRef, useState } from 'react'
import PageHeader from '@/admin/shared/ui/PageHeader'
import StatusNote from '@/admin/shared/ui/StatusNote'
import Field from '@/admin/shared/ui/Field'
import ConfirmDialog from '@/admin/shared/ui/ConfirmDialog'
import { adminErrorText } from '@/admin/shared/api/errorText'
import { formatKst } from '@/admin/shared/utils/time'
import {
  fetchMaintenance, saveMaintenance, isoToKstInput, toScheduleBody, kstInputToIso, OFF_BODY,
} from '@/admin/domains/maintenance/api/maintenance.api'
import MaintenanceSteps from '@/admin/domains/maintenance/components/MaintenanceSteps'
import { ReloadResults, ForceEndResults } from '@/admin/domains/maintenance/components/NodeResults'

export const REFRESH_MS = 30_000
const MESSAGE_MAX = 500
const BUTTON = 'min-h-11 rounded px-4 font-semibold'

const stateText = (maintenance) => {
  if (maintenance?.active) return '점검 중'
  if (maintenance?.enabled) return '예약됨'
  return '꺼짐'
}

// 서버 상태 → 폼 처음 값 (꺼져 있으면 빈 칸)
const formFrom = (maintenance) => ({
  startsAt: maintenance?.enabled ? isoToKstInput(maintenance.startsAt) : '',
  endsAt: maintenance?.enabled ? isoToKstInput(maintenance.endsAt) : '',
  message: maintenance?.enabled ? maintenance.message ?? '' : '',
})

// 폼 검사 → 칸 이름별 문구 (비면 통과)
const checkForm = (form) => {
  const errors = {}
  const startsAt = kstInputToIso(form.startsAt)
  if (!startsAt) errors.startsAt = '시작 시각을 넣어 주세요.'
  const endsAt = kstInputToIso(form.endsAt)
  if (startsAt && endsAt && Date.parse(endsAt) <= Date.parse(startsAt)) errors.endsAt = '끝 안내 시각은 시작 시각보다 뒤여야 해요.'
  if (form.message.trim().length > MESSAGE_MAX) errors.message = `안내 문구는 ${MESSAGE_MAX}자까지 써요.`
  return errors
}

const countText = (value, unit) => (value === null || value === undefined ? '지금 숫자 못 받음' : `${value}${unit}`)

function CurrentState({ view }) {
  const { maintenance } = view
  return (
    <section aria-labelledby="maintenance-now-title" className="rounded border border-line bg-panel p-4">
      <h2 id="maintenance-now-title" className="text-base font-bold">지금 상태</h2>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-muted">점검</dt>
        <dd data-testid="maintenance-state" className={maintenance.active ? 'font-semibold text-danger' : 'font-semibold'}>{stateText(maintenance)}</dd>
        <dt className="text-muted">시작 시각</dt>
        <dd>{maintenance.enabled ? formatKst(maintenance.startsAt) : '—'}</dd>
        <dt className="text-muted">끝 안내</dt>
        <dd>{maintenance.enabled ? formatKst(maintenance.endsAt) : '—'}</dd>
        <dt className="text-muted">남은 판</dt>
        <dd data-testid="maintenance-live-games">{countText(view.liveGames, '개')}</dd>
        <dt className="text-muted">열린 방</dt>
        <dd>{countText(view.liveRooms, '개')}</dd>
      </dl>
    </section>
  )
}

// 예약 폼: 처음 값은 붙을 때 한 번만 (30초 새로고침이 쓰던 칸을 덮지 않게, 저장 뒤엔 key 바꿔 새로 붙임)
function ScheduleForm({ maintenance, onSchedule, onTurnOff }) {
  const [form, setForm] = useState(() => formFrom(maintenance))
  const [errors, setErrors] = useState({})
  const { enabled } = maintenance
  const set = (name) => (event) => setForm({ ...form, [name]: event.target.value })
  const submit = (event) => {
    event.preventDefault()
    const found = checkForm(form)
    setErrors(found)
    if (Object.keys(found).length === 0) onSchedule(toScheduleBody(form))
  }
  return (
    <form aria-labelledby="maintenance-form-title" className="flex flex-col gap-3 rounded border border-line bg-panel p-4" onSubmit={submit}>
      <h2 id="maintenance-form-title" className="text-base font-bold">{enabled ? '점검 바꾸기' : '점검 예약'}</h2>
      <Field label="시작 시각 (한국 시각)" type="datetime-local" value={form.startsAt} onChange={set('startsAt')} error={errors.startsAt}
        hint="이 시각이 되면 진행 중인 판이 승패 없이 끝나고 대기방도 닫혀요. 지난 시각이면 바로 시작해요." />
      <Field label="끝 안내 시각 (한국 시각, 안 넣어도 됨)" type="datetime-local" value={form.endsAt} onChange={set('endsAt')} error={errors.endsAt}
        hint="플레이어에게 보여 주는 안내일 뿐, 이 시각에 저절로 꺼지지 않아요." />
      <Field as="textarea" rows={3} label="안내 문구" value={form.message} onChange={set('message')} error={errors.message}
        hint={`플레이어 화면 큰 안내에 그대로 보여요. ${form.message.trim().length}/${MESSAGE_MAX}자`} />
      <div className="flex flex-wrap gap-2">
        <button type="submit" className={`${BUTTON} bg-danger text-danger-ink`}>{enabled ? '점검 바꾸기' : '점검 예약하기'}</button>
        {enabled ? <button type="button" onClick={onTurnOff} className={`${BUTTON} border border-line`}>점검 끄기</button> : null}
      </div>
    </form>
  )
}

// 확인 창에 다시 보여 줄 줄
const confirmLines = (body) => [
  `시작: ${formatKst(body.startsAt)}`,
  `끝 안내: ${formatKst(body.endsAt)}`,
  `안내 문구: ${body.message ?? '(기본 문구)'}`,
  '시작 시각에 진행 중인 판은 승패 없이 끝나고 대기방은 닫혀요.',
]

function useMaintenanceView() {
  const [view, setView] = useState(null)
  const [error, setError] = useState(null)
  const alive = useRef(true)
  const show = useCallback((next) => { if (alive.current) { setView(next); setError(null) } }, [])
  const fail = useCallback((caught) => { if (alive.current) setError(caught) }, [])
  const load = useCallback((background = false) => fetchMaintenance({ background }).then(show, fail), [show, fail])
  useEffect(() => {
    alive.current = true
    load()
    const timer = setInterval(() => load(true), REFRESH_MS)
    return () => { alive.current = false; clearInterval(timer) }
  }, [load])
  return { view, error, load }
}

export default function MaintenancePage() {
  const { view, error, load } = useMaintenanceView()
  const [formKey, setFormKey] = useState(0)
  const [pending, setPending] = useState(null)
  const [result, setResult] = useState(null)

  const save = async () => {
    const saved = await saveMaintenance(pending.body)
    setResult({ nodes: saved.nodes, partial: saved.partial })
    setPending(null)
    await load()
    setFormKey((key) => key + 1)
  }

  const enabled = view?.maintenance.enabled
  return (
    <section>
      <PageHeader title="점검" description="점검을 예약하면 플레이어 화면에 큰 안내가 뜨고, 시작 시각에 진행 중인 판이 끝나요." />
      {!view && !error ? <StatusNote state="loading" /> : null}
      {!view && error ? <StatusNote state="error" error={error} onRetry={() => load()} /> : null}
      {view && error ? <p role="alert" className="mb-3 text-sm text-danger">새로 읽지 못했어요: {adminErrorText(error)} (아래는 마지막 상태)</p> : null}
      {view ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="flex min-w-0 flex-col gap-4">
            <CurrentState view={view} />
            <ReloadResults nodes={result?.nodes} partial={result?.partial} />
            <ForceEndResults forceEnds={view.forceEnds} />
            <ScheduleForm key={formKey} maintenance={view.maintenance}
              onSchedule={(body) => setPending({ kind: 'schedule', body })} onTurnOff={() => setPending({ kind: 'off', body: OFF_BODY })} />
          </div>
          <MaintenanceSteps maintenance={view.maintenance} liveGames={view.liveGames} />
        </div>
      ) : null}
      {pending?.kind === 'schedule' ? (
        <ConfirmDialog title={enabled ? '점검을 바꿀까요?' : '점검을 예약할까요?'} lines={confirmLines(pending.body)}
          danger confirmLabel={enabled ? '바꾸기' : '예약하기'} onConfirm={save} onCancel={() => setPending(null)} />
      ) : null}
      {pending?.kind === 'off' ? (
        <ConfirmDialog title="점검을 끌까요?" lines={['끄면 바로 방 만들기·입장이 다시 열리고 플레이어 큰 안내가 사라져요.']}
          confirmLabel="끄기" onConfirm={save} onCancel={() => setPending(null)} />
      ) : null}
    </section>
  )
}
