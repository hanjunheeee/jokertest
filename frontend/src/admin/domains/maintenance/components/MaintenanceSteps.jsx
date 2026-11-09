// 점검 순서 안내 부품 파일, 8단계와 지금 단계(예약 전 / 예약됨 / 점검 중·판 n개 남음 / 판 0개)를 보여 줌
// 점검 화면(MaintenancePage) 옆에 붙음, 1·8단계는 공지 화면 바로 가기
import { Link } from 'react-router-dom'

// 공지 화면 주소 (1-3)
const ANNOUNCEMENTS_PATH = '/announcements'

const STEPS = [
  { id: 1, title: '미리 공지', note: '예: 30분 전에 접속한 사람 모두에게', link: '공지 화면으로' },
  { id: 2, title: '점검 예약', note: '시작 시각·안내 문구·끝 안내 시각을 넣고 켜기 → 플레이어 화면에 큰 안내' },
  { id: 3, title: '시각이 되면 판 강제 종료', note: '자동, 서버마다 끝낸 판·닫은 방 수가 아래에 나옴' },
  { id: 4, title: '진행 판 0개 확인', note: '남은 판·열린 방 숫자를 봄' },
  { id: 5, title: '배포' },
  { id: 6, title: '확인', note: '관리자 화면·게임 접속' },
  { id: 7, title: '점검 끄기' },
  { id: 8, title: '끝 공지', link: '공지 화면으로' },
]

// 지금 단계: 꺼짐 → 1, 예약됨 → 3(시각 기다림), 점검 중·판 남음(또는 못 셈) → 4, 점검 중·판 0개 → 5
// 예: { maintenance:{ enabled:true, active:true }, liveGames:2 } → { step:4, label:'점검 중 · 판 2개 남음' }
const currentStepOf = ({ maintenance, liveGames }) => {
  if (!maintenance?.enabled) return { step: 1, label: '예약 전' }
  if (!maintenance.active) return { step: 3, label: '예약됨' }
  if (liveGames === null || liveGames === undefined) return { step: 4, label: '점검 중 · 남은 판 수 못 받음' }
  if (liveGames > 0) return { step: 4, label: `점검 중 · 판 ${liveGames}개 남음` }
  return { step: 5, label: '점검 중 · 판 0개' }
}

const stateText = (id, step) => {
  if (id < step) return '지남'
  if (id === step) return '지금'
  return ''
}

export default function MaintenanceSteps({ maintenance, liveGames }) {
  const { step, label } = currentStepOf({ maintenance, liveGames })
  return (
    <aside aria-labelledby="maintenance-steps-title" className="rounded border border-line bg-panel p-4">
      <h2 id="maintenance-steps-title" className="text-base font-bold">점검 순서</h2>
      <p className="mt-1 text-sm">
        지금: <strong data-testid="maintenance-stage">{step}단계 · {label}</strong>
      </p>
      <ol className="mt-3 flex flex-col gap-2">
        {STEPS.map((item) => {
          const current = item.id === step
          return (
            <li
              key={item.id}
              aria-current={current ? 'step' : undefined}
              className={`rounded border px-3 py-2 text-sm ${current ? 'border-accent bg-page' : 'border-line'} ${item.id < step ? 'text-muted' : ''}`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-semibold">{item.id}. {item.title}</span>
                <span className="shrink-0 text-xs text-muted">{stateText(item.id, step)}</span>
              </div>
              {item.note ? <p className="mt-0.5 text-muted">{item.note}</p> : null}
              {item.link ? (
                <Link to={ANNOUNCEMENTS_PATH} className="mt-1 inline-flex min-h-11 items-center text-accent underline">
                  {item.link}
                </Link>
              ) : null}
            </li>
          )
        })}
      </ol>
    </aside>
  )
}
