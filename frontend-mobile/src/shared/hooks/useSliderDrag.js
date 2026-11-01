// 손가락·마우스·키보드로 슬라이더 값 바꾸기 (막대 위치 → 값, 손잡이 위치 계산)
// shared/ui/slider/RangeSlider.jsx가 씀
import { useRef } from "react"

// 손가락은 이만큼 옆으로 움직여야 끌기로 봄 (세로 스크롤과 구분)
const TOUCH_SLOP_PX = 6
// PageUp·PageDown 한 번에 움직이는 칸 수
const PAGE_STEPS = 10

// 막대 양끝 장식을 뺀 구간: px(손잡이 반폭)와 %(그림 장식) 둘 다 받음
const EDGE_DEFAULT = { startPx: 0, endPx: 0, startPct: 0, endPct: 0 }

// 손잡이 left 값 (값 계산과 같은 구간을 씀)
export function knobLeft(edge, t) {
  const e = { ...EDGE_DEFAULT, ...edge }
  const start = `(${e.startPx}px + ${e.startPct}%)`
  const span = `(100% - ${e.startPx + e.endPx}px - ${e.startPct + e.endPct}%)`
  return `calc(${start} + ${span} * ${t})`
}

// min=max면 0 (0으로 나누기 막기)
export function ratioOf(value, min, max) {
  if (max === min) return 0
  return Math.min(1, Math.max(0, (value - min) / (max - min)))
}

// 칸 단위로 맞추고 범위 안에 가둠
function snap(raw, min, max, step) {
  const stepped = Math.round((raw - min) / step) * step + min
  return Math.min(max, Math.max(min, Number(stepped.toFixed(4))))
}

// 누른 x 좌표 → 값
function valueAt(clientX, el, { min, max, step, edge }) {
  const e = { ...EDGE_DEFAULT, ...edge }
  const rect = el.getBoundingClientRect()
  const left = rect.left + e.startPx + (rect.width * e.startPct) / 100
  const width = rect.width - e.startPx - e.endPx - (rect.width * (e.startPct + e.endPct)) / 100
  const t = width > 0 ? Math.min(1, Math.max(0, (clientX - left) / width)) : 0
  return snap(min + t * (max - min), min, max, step)
}

// 손가락은 옆으로 끌 때만 값 바꿈(세로 스크롤 방해 안 함), 마우스는 누르는 즉시
export function useSliderDrag({ value, min, max, step = 1, edge, disabled, onChange }) {
  const trackRef = useRef(null)
  const dragRef = useRef(null)
  const opts = { min, max, step, edge }

  const emit = (next) => {
    if (next !== value) onChange(next)
  }
  const emitAt = (clientX) => {
    if (trackRef.current) emit(valueAt(clientX, trackRef.current, opts))
  }

  const onPointerDown = (event) => {
    if (disabled) return
    const touch = event.pointerType === "touch"
    dragRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY, active: !touch }
    if (!touch) {
      event.currentTarget.setPointerCapture?.(event.pointerId)
      emitAt(event.clientX)
    }
  }

  const onPointerMove = (event) => {
    const drag = dragRef.current
    if (!drag || drag.id !== event.pointerId) return
    if (!drag.active) {
      const dx = Math.abs(event.clientX - drag.x)
      const dy = Math.abs(event.clientY - drag.y)
      if (dx < TOUCH_SLOP_PX || dx < dy) return
      drag.active = true
      event.currentTarget.setPointerCapture?.(event.pointerId)
    }
    emitAt(event.clientX)
  }

  // 손가락을 움직이지 않고 뗐으면 누른 자리로 바로 옮김
  const onPointerUp = (event) => {
    const drag = dragRef.current
    dragRef.current = null
    if (!drag || drag.id !== event.pointerId || drag.active) return
    emitAt(event.clientX)
  }

  // 세로 스크롤로 넘어가면 브라우저가 취소를 보냄
  const onPointerCancel = () => {
    dragRef.current = null
  }

  // 화살표·Home·End·PageUp/Down (화면 읽기·외부 키보드용)
  const onKeyDown = (event) => {
    if (disabled) return
    const moves = {
      ArrowLeft: -step, ArrowDown: -step, ArrowRight: step, ArrowUp: step,
      PageDown: -step * PAGE_STEPS, PageUp: step * PAGE_STEPS,
    }
    let next = null
    if (event.key in moves) next = snap(value + moves[event.key], min, max, step)
    if (event.key === "Home") next = min
    if (event.key === "End") next = max
    if (next === null) return
    event.preventDefault()
    emit(next)
  }

  return {
    trackRef,
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onKeyDown },
  }
}
