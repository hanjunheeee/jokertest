// 카드 이름판 이름 글 뒤 띠: 이름 색마다 어두운 띠·밝은 띠 중 더 잘 읽히는 쪽 고르기
// PC 카드 이름판·모바일 카드 이름판이 씀, 대비 셈은 시험도 같이 씀

// 이름판 기본 글자색 (INGAME_PLAYER_NAMEPLATE_CLASS의 text-[#3a1a0c]와 같음, 색 없는 카드에 씀)
export const NAMEPLATE_DEFAULT_TEXT_COLOR = "#3a1a0c"

// 띠 두 가지: 밝은 이름(흰·주황·연두 등)은 어두운 띠, 짙은 이름(남색·짙은 초록·짙은 빨강 등)은 밝은 띠
// 한 가지 띠로는 흰색과 남색이 함께 4.5를 못 넘음 → 색마다 고름
// 거의 안 비치게 깔아서 뒤 카드 그림이 흰색이든 검정이든 대비가 지켜짐
export const NAMEPLATE_BANDS = {
  dark: { rgb: [0, 0, 0], alpha: 0.8 },
  light: { rgb: [245, 236, 217], alpha: 0.88 },
}

const WHITE = [255, 255, 255]
const BLACK = [0, 0, 0]

// "#ff7f39" → [255, 127, 57]
function hexToRgb(hex) {
  const value = String(hex).replace("#", "")
  return [0, 2, 4].map((at) => parseInt(value.slice(at, at + 2), 16))
}

// 글자 대비 셈의 밝기 (WCAG 상대 밝기, 0 검정 ~ 1 흰색)
export function relativeLuminance(rgb) {
  const [r, g, b] = rgb.map((channel) => {
    const c = channel / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

// 두 밝기의 대비 (1 ~ 21)
function ratio(lumA, lumB) {
  const [hi, lo] = lumA > lumB ? [lumA, lumB] : [lumB, lumA]
  return (hi + 0.05) / (lo + 0.05)
}

// 비치는 띠를 바탕 위에 얹은 색 (브라우저처럼 0~255 값으로 섞음)
function blend(band, under) {
  return band.rgb.map((c, i) => Math.round(c * band.alpha + under[i] * (1 - band.alpha)))
}

// 띠 위 이름 글의 가장 나쁜 대비: 뒤 그림이 흰색일 때·검정일 때 둘 중 낮은 값
// 이름 밝기가 그 사이에 들면 어딘가에서 같은 밝기가 되니 1
export function worstBandContrast(textHex, band) {
  const text = relativeLuminance(hexToRgb(textHex))
  const overBlack = relativeLuminance(blend(band, BLACK))
  const overWhite = relativeLuminance(blend(band, WHITE))
  if (text >= overBlack && text <= overWhite) return 1
  return Math.min(ratio(text, overBlack), ratio(text, overWhite))
}

// 이름 색에 맞는 띠 이름 ("dark" | "light"), 가장 나쁜 대비가 더 높은 쪽
// 예: "#ffffff" → "dark", "#101e85" → "light"
export function pickNameplateBand(textHex = NAMEPLATE_DEFAULT_TEXT_COLOR) {
  const color = textHex ?? NAMEPLATE_DEFAULT_TEXT_COLOR
  return worstBandContrast(color, NAMEPLATE_BANDS.dark) >= worstBandContrast(color, NAMEPLATE_BANDS.light)
    ? "dark"
    : "light"
}

// 띠 칸 style: 바탕색만, 밝은 띠면 짙은 글 밑 검은 그림자를 끔 (번져 보임)
// 예: "#101e85" → { kind: "light", style: { backgroundColor: "rgba(245, 236, 217, 0.88)", textShadow: "none" } }
export function buildNameplateBand(textHex) {
  const kind = pickNameplateBand(textHex)
  const band = NAMEPLATE_BANDS[kind]
  const style = { backgroundColor: `rgba(${band.rgb.join(", ")}, ${band.alpha})` }
  if (kind === "light") style.textShadow = "none"
  return { kind, style }
}
