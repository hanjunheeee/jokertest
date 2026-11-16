// PC 판 카드 자리표와 가운데 채팅 창 자리 셈 시험: 채팅 창 위 카드 이름판 아랫변 < 채팅 창 윗변, 채팅 창 아래 카드 이름판 윗변 > 채팅 창 아랫변
// 목록 A02-F-215~221 (docs/게임_의도_2026-11-15/시험목록/A02-판시작-역할.md), 브라우저 A02-E-109~114·094 "맨 위 카드 이름이 채팅 창 뒤에 가려짐"
// 자리표·카드 폭·이름판 자리·채팅 창 폭·높이·기울기는 화면 상수에서 읽고, 카드 틀 비율은 그림 파일 머리에서 읽음 (jsdom은 자리를 못 재서 셈으로 봄)
import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const board = await import("../../src/domains/game/ingame/constants/board/ingamePlayerBoard.js")
const { INGAME_PLAYER_ALIVE_FRAME_VARIANTS, INGAME_PLAYER_NAMEPLATE_INSET } = await import("../../src/domains/game/ingame/constants/board/ingamePlayerAssets.js")
const chat = await import("../../src/domains/game/ingame/constants/chat/ingameChatBoardLayout.js")
const { FRAME_ASPECT } = await import("../../src/domains/game/ingame/constants/chat/ingameChatAssets.js")

const PUBLIC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../public")
// 창 크기: PC 시험 기준 1280×800, 낮은 창 1280×720·1366×768, 높은 창 1920×1080
const VIEWS = [[1280, 800], [1280, 720], [1366, 768], [1920, 1080]]
const REM = 16
// 셈 오차(카드 원근 무시 등) 몫 여유
const MARGIN_PX = 2

// "clamp(6.2rem, 13.65cqw, 9.75rem)" → 창 폭 W에서 px (판엔 크기 칸이 없어 cqw = 창 폭 1%)
function clampPx(expr, W) {
  const m = expr.match(/clamp\(([\d.]+)rem,\s*([\d.]+)cqw,\s*([\d.]+)rem\)/)
  return Math.min(Math.max(Number(m[1]) * REM, (Number(m[2]) * W) / 100), Number(m[3]) * REM)
}
// webp 그림 세로/가로 (VP8X 머리)
function webpRatio(publicPath) {
  const b = fs.readFileSync(path.join(PUBLIC_DIR, publicPath))
  return (1 + b.readUIntLE(27, 3)) / (1 + b.readUIntLE(24, 3))
}
const pct = (value) => parseFloat(value) / 100
// 카드 틀 그림 중 가장 긴 것 (길수록 이름판이 아래로 내려감)
const FRAME_RATIO = Math.max(...INGAME_PLAYER_ALIVE_FRAME_VARIANTS.map(webpRatio))
const CHAT_TOP_PCT = Number(chat.PANEL_POSITION_CLASS.match(/top-\[([\d.]+)%\]/)[1])
const BOARD_PERSPECTIVE = Number(board.POSITION_CLASS.match(/perspective:(\d+)px/)[1])

// 카드 한 장의 이름판 네 모서리 화면 자리 (translate(-50%,-50%) scale rotate rotateX, 기준점 transformOrigin, 판 원근)
function nameplateOf(preset, W, H) {
  const w = clampPx(board.buildSlotStyle(preset).width, W)
  const h = w * FRAME_RATIO
  const cx = (preset.left / 100) * W
  const cy = (preset.top / 100) * H
  const [oxText, oyText] = (preset.transformOrigin === "center center" ? "50% 50%" : preset.transformOrigin).split(" ")
  const ox = pct(oxText) * w
  const oy = pct(oyText) * h
  const rz = (preset.rotate * Math.PI) / 180
  const rx = ((preset.rotateX ?? 0) * Math.PI) / 180
  // 카드 칸 안 (lx, ly) → 화면 (x, y)
  const toScreen = (lx, ly) => {
    let x = lx - ox
    let y = (ly - oy) * Math.cos(rx)
    const z = (ly - oy) * Math.sin(rx)
    ;[x, y] = [x * Math.cos(rz) - y * Math.sin(rz), x * Math.sin(rz) + y * Math.cos(rz)]
    x = x * preset.scale + cx - w / 2 + ox
    y = y * preset.scale + cy - h / 2 + oy
    const k = BOARD_PERSPECTIVE / (BOARD_PERSPECTIVE - z)
    return [W / 2 + (x - W / 2) * k, H / 2 + (y - H / 2) * k]
  }
  const left = pct(INGAME_PLAYER_NAMEPLATE_INSET.left) * w
  const right = w - pct(INGAME_PLAYER_NAMEPLATE_INSET.right) * w
  const bottom = h - pct(INGAME_PLAYER_NAMEPLATE_INSET.bottom) * h
  const top = bottom - pct(INGAME_PLAYER_NAMEPLATE_INSET.height) * h
  const corners = [toScreen(left, top), toScreen(right, top), toScreen(left, bottom), toScreen(right, bottom)]
  const xs = corners.map((c) => c[0])
  const ys = corners.map((c) => c[1])
  return { top: Math.min(...ys), bottom: Math.max(...ys), left: Math.min(...xs), right: Math.max(...xs), cy }
}

// 채팅 창 윗변·아랫변 높이와 그 사이 높이의 좌우 끝 (뒤로 눕힌 사다리꼴)
function chatPanelOf(W, H) {
  const style = chat.getPanelStyle()
  const w = clampPx(style.width, W)
  const h = w / FRAME_ASPECT
  const p = Number(style.transform.match(/perspective\(([\d.]+)px\)/)[1])
  const rx = (Number(style.transform.match(/rotateX\(([-\d.]+)deg\)/)[1]) * Math.PI) / 180
  const cy = (CHAT_TOP_PCT / 100) * H
  const edge = (sign) => {
    const k = p / (p - sign * (h / 2) * Math.sin(rx))
    return { y: cy + sign * (h / 2) * Math.cos(rx) * k, half: (w / 2) * k }
  }
  const top = edge(-1)
  const bottom = edge(1)
  const halfAt = (y) => top.half + (bottom.half - top.half) * Math.min(1, Math.max(0, (y - top.y) / (bottom.y - top.y)))
  return { top: top.y, bottom: bottom.y, middle: (top.y + bottom.y) / 2, left: (y) => W / 2 - halfAt(y), right: (y) => W / 2 + halfAt(y) }
}

// 인원·창 크기마다 채팅 창과 가로로 겹치는 카드 → { above: [틈 px], below: [틈 px] }
function gapsFor(count, W, H) {
  const panel = chatPanelOf(W, H)
  const above = []
  const below = []
  for (const preset of board.getSlotPresets(count)) {
    const plate = nameplateOf(preset, W, H)
    const isAbove = plate.cy < panel.middle
    const y = isAbove ? Math.max(plate.bottom, panel.top) : Math.min(plate.top, panel.bottom)
    if (plate.right <= panel.left(y) || plate.left >= panel.right(y)) continue
    if (isAbove) above.push(panel.top - plate.bottom)
    else below.push(plate.top - panel.bottom)
  }
  return { above, below }
}

for (const count of [5, 6, 7, 8, 9, 10]) {
  test(`A02-F-${210 + count} ${count}명 판 → 창 4가지 크기 모두 채팅 창 위 카드 이름판 아랫변이 채팅 창 윗변보다 위`, () => {
    for (const [W, H] of VIEWS) {
      const { above } = gapsFor(count, W, H)
      assert.ok(above.length > 0, `${W}×${H} 채팅 창 위 카드가 없음 (셈 잘못)`)
      for (const gap of above) assert.ok(gap >= MARGIN_PX, `${W}×${H} 이름판이 채팅 창 윗변 아래로 ${(-gap).toFixed(1)}px 들어감`)
    }
  })
}

test("A02-F-221 5~10명 판 → 창 4가지 크기 모두 채팅 창 아래 카드 이름판 윗변이 채팅 창 아랫변보다 아래", () => {
  for (const count of [5, 6, 7, 8, 9, 10]) {
    for (const [W, H] of VIEWS) {
      for (const gap of gapsFor(count, W, H).below) assert.ok(gap >= MARGIN_PX, `${count}명 ${W}×${H} 아래 카드 이름판이 채팅 창에 ${(-gap).toFixed(1)}px 덮임`)
    }
  }
})
