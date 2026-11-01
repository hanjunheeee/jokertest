import {
  INGAME_PLAYER_LAYOUT_10,
  LAYOUTS_BY_COUNT,
} from "./ingamePlayerLayouts.js"

export {
  INGAME_PLAYER_LAYOUT_10,
  LAYOUTS_BY_COUNT,
} from "./ingamePlayerLayouts.js"

export const INGAME_PREVIEW_PLAYER_COUNT = 10

export const POSITION_CLASS =
  "absolute inset-0 z-10 pointer-events-none [perspective:1800px]"

export const SLOT_BASE_WIDTH =
  "clamp(6.2rem, 13.65cqw, 9.75rem)"

export const SLOT_ZONES = {
  top: {
    transformOrigin: "50% 100%",
    scale: 0.94,
    zIndex: 10,
    skewX: 0,
    skewY: 0,
  },
  side: {
    rotateX: 0,
    transformOrigin: "center center",
    scale: 1,
    zIndex: 15,
    skewX: 0,
    skewY: 0,
  },
  bottom: {
    rotateX: 0,
    transformOrigin: "center center",
    scale: 1.02,
    zIndex: 15,
    skewX: 0,
    skewY: 0,
  },
  bottomCenter: {
    rotateX: 0,
    transformOrigin: "center center",
    scale: 1.04,
    zIndex: 15,
    skewX: 0,
    skewY: 0,
  },
}

function deriveSlotTransform(zone, left) {
  if (zone === "top") {
    const derived = {}
    if (Math.abs(left - 50) >= 28) {
      derived.rotateX = -5
    } else {
      derived.rotateX = -6
    }
    return derived
  }
  return {}
}

export function resolveSlotPreset(slot) {
  const { zone, left, top, ...overrides } = slot
  const profile = SLOT_ZONES[zone] ?? SLOT_ZONES.bottom
  const derived = deriveSlotTransform(zone, left)

  return {
    left,
    top,
    rotate: 0,
    rotateX: 0,
    ...profile,
    ...derived,
    ...overrides,
  }
}

export const SLOT_PRESETS_10 =
  INGAME_PLAYER_LAYOUT_10.map(resolveSlotPreset)

export function getSlotPresets(
  playerCount = INGAME_PREVIEW_PLAYER_COUNT,
) {
  const layout =
    LAYOUTS_BY_COUNT[playerCount] ??
    INGAME_PLAYER_LAYOUT_10.slice(0, playerCount)

  return layout.map(resolveSlotPreset)
}

export function buildSlotStyle(preset) {
  const {
    left,
    top,
    scale,
    rotate,
    rotateX = 0,
    skewX = 0,
    skewY = 0,
    transformOrigin = "center center",
    zIndex = 10,
  } = preset

  return {
    left: `${left}%`,
    top: `${top}%`,
    zIndex,
    width: SLOT_BASE_WIDTH,
    transform: `translate(-50%, -50%) scale(${scale}) rotate(${rotate}deg) rotateX(${rotateX}deg) skew(${skewX}deg, ${skewY}deg)`,
    transformOrigin,
    transformStyle: "preserve-3d",
  }
}
