// 판 설정 화면 파일, 지금 판 골드 값 보기 + 바꾸기(확인 창) + 서버(Node)별 반영 결과
// 메뉴 표(adminRoutes)가 /game-settings에 붙임, 바꾼 값은 그 뒤 시작하는 판부터 씀
import { useCallback, useEffect, useRef, useState } from 'react'
import PageHeader from '@/admin/shared/ui/PageHeader'
import StatusNote from '@/admin/shared/ui/StatusNote'
import Field from '@/admin/shared/ui/Field'
import ConfirmDialog from '@/admin/shared/ui/ConfirmDialog'
import { formatKst } from '@/admin/shared/utils/time'
import { fetchGameSettings, saveGameSettings, parseGoldRewardInput } from '@/admin/domains/gameSettings/api/gameSettings.api'
import { ReloadResults } from '@/admin/domains/maintenance/components/NodeResults'

const BUTTON = 'min-h-11 rounded px-4 font-semibold disabled:cursor-not-allowed disabled:opacity-50'

function CurrentState({ view }) {
  const { settings, node } = view
  return (
    <section aria-labelledby="game-settings-now-title" className="rounded border border-line bg-panel p-4">
      <h2 id="game-settings-now-title" className="text-base font-bold">지금 값</h2>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-muted">판마다 주는 골드</dt>
        <dd data-testid="game-settings-gold" className="font-semibold">{settings.goldReward}골드</dd>
        <dt className="text-muted">마지막으로 바꾼 때</dt>
        <dd>{settings.updatedAt ? formatKst(settings.updatedAt) : '바꾼 적 없음'}</dd>
        <dt className="text-muted">이 서버가 쓰는 값</dt>
        <dd>{node?.loadedAt ? `${node.goldReward}골드` : '아직 안 읽음'}</dd>
      </dl>
    </section>
  )
}

// 바꾸기 폼: 처음 값은 붙을 때 한 번만 (저장 뒤엔 key 바꿔 새로 붙임)
function GoldForm({ settings, limits, onSubmit }) {
  const [text, setText] = useState(() => String(settings.goldReward))
  const [error, setError] = useState(null)
  const { min, max } = limits.goldReward
  const submit = (event) => {
    event.preventDefault()
    const value = parseGoldRewardInput(text, { min, max })
    if (value === null) {
      setError(`${min}부터 ${max}까지 정수로 넣어 주세요.`)
      return
    }
    setError(null)
    onSubmit(value)
  }
  return (
    <form aria-labelledby="game-settings-form-title" className="flex flex-col gap-3 rounded border border-line bg-panel p-4" onSubmit={submit} noValidate>
      <h2 id="game-settings-form-title" className="text-base font-bold">판 골드 바꾸기</h2>
      <Field label="판마다 주는 골드" type="number" inputMode="numeric" min={min} max={max} step={1}
        value={text} onChange={(event) => setText(event.target.value)} error={error}
        hint={`판이 끝까지 가면 끝까지 있던 사람 모두가 받아요. 산 채로 나간 사람은 못 받아요. 0이면 안 줘요. (${min}~${max})`} />
      <div className="flex flex-wrap gap-2">
        <button type="submit" className={`${BUTTON} bg-accent text-accent-ink`}>바꾸기</button>
      </div>
    </form>
  )
}

function useGameSettingsView() {
  const [view, setView] = useState(null)
  const [error, setError] = useState(null)
  const alive = useRef(true)
  const load = useCallback(() => fetchGameSettings().then(
    (next) => { if (alive.current) { setView(next); setError(null) } },
    (caught) => { if (alive.current) setError(caught) },
  ), [])
  useEffect(() => {
    alive.current = true
    load()
    return () => { alive.current = false }
  }, [load])
  return { view, error, load }
}

export default function GameSettingsPage() {
  const { view, error, load } = useGameSettingsView()
  const [formKey, setFormKey] = useState(0)
  const [pending, setPending] = useState(null)
  const [result, setResult] = useState(null)

  const save = async () => {
    const saved = await saveGameSettings({ goldReward: pending })
    setResult({ nodes: saved.nodes, partial: saved.partial })
    setPending(null)
    await load()
    setFormKey((key) => key + 1)
  }

  return (
    <section>
      <PageHeader title="판 설정" description="판이 끝날 때 주는 골드를 정해요. 바꾸면 그 뒤에 시작하는 판부터 새 값을 써요." />
      {!view && !error ? <StatusNote state="loading" /> : null}
      {!view && error ? <StatusNote state="error" error={error} onRetry={() => load()} /> : null}
      {view ? (
        <div className="flex max-w-xl flex-col gap-4">
          <CurrentState view={view} />
          <ReloadResults nodes={result?.nodes} partial={result?.partial} />
          <GoldForm key={formKey} settings={view.settings} limits={view.limits} onSubmit={(value) => setPending(value)} />
        </div>
      ) : null}
      {pending !== null ? (
        <ConfirmDialog title="판 골드를 바꿀까요?"
          lines={[`${view?.settings.goldReward ?? '?'}골드 → ${pending}골드`, '이미 진행 중인 판은 시작할 때 값 그대로 줘요.']}
          confirmLabel="바꾸기" onConfirm={save} onCancel={() => setPending(null)} />
      ) : null}
    </section>
  )
}
