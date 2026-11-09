// 막대 그래프 부품 파일, 날짜별 숫자 하나를 손으로 그린 SVG 막대로 (설치 없음)
// StatsPage가 칸마다(가입·최고 접속·판·매출) 하나씩 씀, 폭은 늘 부모 폭(휴대폰 가로 넘침 없음)
const HEIGHT = 120
const BAR_STEP = 10
const BAR_WIDTH = 7

// 막대 높이: 가장 큰 값 = 꽉 참, 0 = 0 (예: [0, 5, 10] → [0, 60, 120])
const barHeights = (values) => {
  const max = Math.max(0, ...values)
  return values.map((value) => (max > 0 ? Math.round((value / max) * HEIGHT) : 0))
}

// days: [{ date, … }], valueKey: 그릴 칸, unit: 단위 글자, format: 숫자 → 글자
export default function BarChart({ title, days, valueKey, unit = '', format = (value) => value.toLocaleString('ko-KR') }) {
  const values = days.map((day) => Number(day[valueKey]) || 0)
  const heights = barHeights(values)
  const total = values.reduce((sum, value) => sum + value, 0)
  const width = Math.max(1, days.length) * BAR_STEP
  return (
    <figure className="min-w-0 rounded border border-line bg-panel p-3">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
        <span className="font-semibold">{title}</span>
        <span className="text-muted">합 {format(total)}{unit} · 최고 {format(Math.max(0, ...values))}{unit}</span>
      </figcaption>
      <svg
        role="img"
        aria-label={`${title} 날짜별 막대`}
        viewBox={`0 0 ${width} ${HEIGHT}`}
        width="100%"
        height={HEIGHT}
        preserveAspectRatio="none"
        className="mt-2 block w-full text-accent"
      >
        <line x1="0" y1={HEIGHT - 0.5} x2={width} y2={HEIGHT - 0.5} stroke="currentColor" strokeOpacity="0.3" strokeWidth="1" />
        {days.map((day, index) => (
          <rect
            key={day.date}
            data-date={day.date}
            data-value={values[index]}
            x={index * BAR_STEP + (BAR_STEP - BAR_WIDTH) / 2}
            y={HEIGHT - heights[index]}
            width={BAR_WIDTH}
            height={heights[index]}
            fill="currentColor"
          >
            <title>{`${day.date} ${format(values[index])}${unit}`}</title>
          </rect>
        ))}
      </svg>
      <div className="mt-1 flex justify-between text-xs text-muted">
        <span>{days[0]?.date ?? ''}</span>
        <span>{days.length > 1 ? days[days.length - 1].date : ''}</span>
      </div>
    </figure>
  )
}
