import { SKIN_STORE_ITEMS } from "../../../store/constants/storeItems.js"
import { INVITED_GUESTS_JOB_SPREAD_META } from "../../../library/content/invitedGuests/jobSpreadMeta.js"

const BASIC_STANDING_DIR = "/shopItem/basic/jobs-standing"
const BASIC_CLOSEUP_DIR = "/shopItem/basic/jobs-closeup"
const PLAYER_CARD_ALIVE_DIR = "/shopItem/player-card/playerframe-alive"

/** @typedef {'skin' | 'card'} SkinCardWearItemType */
/** @typedef {'basic' | 'premium' | 'card'} SkinCardWearItemSource */

/**
 * @typedef {Object} SkinCardWearCatalogItem
 * @property {string} id
 * @property {SkinCardWearItemType} itemType
 * @property {SkinCardWearItemSource} source
 * @property {string | null} jobId
 * @property {string} name
 * @property {string} listIcon
 * @property {string} [standingSrc]
 * @property {string} [closeupSrc]
 * @property {string} [frameSrc]
 */

const JOB_GRADE_TO_ID = {
  귀족: "noble",
  광대: "clown",
  주치의: "doctor",
  경비원: "guard",
  마녀사냥꾼: "witchHunter",
}

const BASIC_SKIN_STEMS = [
  "귀족1",
  "귀족2",
  "귀족3",
  "광대1",
  "광대2",
  "경비원1",
  "경비원2",
  "주치의",
  "마녀사냥꾼",
]

const PLAYER_CARD_VARIANTS = [
  "베이스",
  "가고일",
  "가면",
  "그레이",
  "모래시계",
  "보석",
  "사슬",
  "악마",
  "왕관",
]

/** @param {string} stem */
function resolveBasicJobId(stem) {
  if (stem.startsWith("귀족")) return "noble"
  if (stem.startsWith("광대")) return "clown"
  if (stem.startsWith("경비원")) return "guard"
  if (stem.startsWith("주치의")) return "doctor"
  if (stem.startsWith("마녀")) return "witchHunter"
  return null
}

/** @param {string} stem */
function resolveBasicCloseupSrc(stem) {
  return `${BASIC_CLOSEUP_DIR}/${stem}_클로즈업.png`.normalize("NFD")
}

/** @param {string} stem @returns {SkinCardWearCatalogItem} */
function createBasicSkinItem(stem) {
  const standingSrc = `${BASIC_STANDING_DIR}/${stem}.png`.normalize("NFD")
  const closeupSrc = resolveBasicCloseupSrc(stem)

  return {
    id: `basic-skin-${stem}`,
    itemType: "skin",
    source: "basic",
    jobId: resolveBasicJobId(stem),
    name: stem,
    listIcon: closeupSrc,
    standingSrc,
    closeupSrc,
  }
}

/** @param {import("../../../store/constants/storeItems.js").StoreItem} item @returns {SkinCardWearCatalogItem} */
function mapPremiumSkinItem(item) {
  return {
    id: item.id,
    itemType: "skin",
    source: "premium",
    jobId: JOB_GRADE_TO_ID[item.grade] ?? null,
    name: item.name,
    listIcon: item.icon,
    standingSrc: item.iconZoom ?? item.icon,
    closeupSrc: item.icon,
  }
}

/** @param {string} variant @returns {SkinCardWearCatalogItem} */
function createPlayerCardItem(variant) {
  const frameSrc =
    `${PLAYER_CARD_ALIVE_DIR}/인게임-플레이어프레임(${variant}).png`.normalize("NFD")

  return {
    id: `player-card-${variant}`,
    itemType: "card",
    source: "card",
    jobId: null,
    name: variant,
    listIcon: frameSrc,
    frameSrc,
  }
}

export const SKIN_CARD_WEAR_JOB_TABS = INVITED_GUESTS_JOB_SPREAD_META.map(({ jobKey, jobLabel }) => ({
  id: jobKey,
  jobLabel,
}))

export const SKIN_CARD_WEAR_CATALOG = [
  ...BASIC_SKIN_STEMS.map(createBasicSkinItem),
  ...SKIN_STORE_ITEMS.map(mapPremiumSkinItem),
  ...PLAYER_CARD_VARIANTS.map(createPlayerCardItem),
]

export const SKIN_CARD_WEAR_DEFAULT_CARD_FRAME_ID = "player-card-베이스"

/** @param {string} id @returns {SkinCardWearCatalogItem | undefined} */
export function getSkinCardWearItemById(id) {
  return SKIN_CARD_WEAR_CATALOG.find((item) => item.id === id)
}

/** @param {string} jobId @returns {SkinCardWearCatalogItem[]} */
export function getSkinItemsForJob(jobId) {
  return SKIN_CARD_WEAR_CATALOG.filter(
    (item) => item.itemType === "skin" && item.jobId === jobId,
  )
}

/** @returns {SkinCardWearCatalogItem[]} */
export function getPlayerCardItems() {
  return SKIN_CARD_WEAR_CATALOG.filter((item) => item.itemType === "card")
}

/** @param {string} jobId @returns {string | undefined} */
export function getDefaultSkinIdForJob(jobId) {
  return SKIN_CARD_WEAR_CATALOG.find(
    (item) => item.itemType === "skin" && item.source === "basic" && item.jobId === jobId,
  )?.id
}

/** @returns {Record<string, string>} */
export function buildDefaultSkinsByJob() {
  return Object.fromEntries(
    SKIN_CARD_WEAR_JOB_TABS.flatMap(({ id }) => {
      const skinId = getDefaultSkinIdForJob(id)
      return skinId ? [[id, skinId]] : []
    }),
  )
}

/**
 * @param {Object} params
 * @param {SkinCardWearCatalogItem | undefined} params.selectedItem
 * @param {string} params.activeJobId
 * @param {'skin' | 'card'} params.previewMode
 * @param {Record<string, string>} params.draftSkinsByJob
 * @param {string} params.draftCardFrameId
 */
export function resolveSkinCardWearPreview({
  selectedItem,
  activeJobId,
  previewMode,
  draftSkinsByJob,
  draftCardFrameId,
}) {
  const fallbackSkinId = getDefaultSkinIdForJob(activeJobId)
  const draftSkinId = draftSkinsByJob[activeJobId] ?? fallbackSkinId
  const draftSkin = getSkinCardWearItemById(draftSkinId)
  const draftCard = getSkinCardWearItemById(draftCardFrameId)
  const defaultCard = getSkinCardWearItemById(SKIN_CARD_WEAR_DEFAULT_CARD_FRAME_ID)

  if (previewMode === "skin") {
    const skin =
      selectedItem?.itemType === "skin" && selectedItem.jobId === activeJobId
        ? selectedItem
        : draftSkin

    return {
      mode: "skin",
      standingSrc: skin?.standingSrc ?? null,
    }
  }

  const skin =
    selectedItem?.itemType === "skin" && selectedItem.jobId === activeJobId
      ? selectedItem
      : draftSkin
  const card =
    selectedItem?.itemType === "card" ? selectedItem : draftCard ?? defaultCard

  return {
    mode: "card",
    portraitSrc: skin?.closeupSrc ?? skin?.standingSrc ?? null,
    frameSrc: card?.frameSrc ?? defaultCard?.frameSrc ?? null,
  }
}

/**
 * @param {Record<string, string>} draftSkinsByJob
 * @param {string} draftCardFrameId
 */

/** @param {SkinCardWearCatalogItem} item */
export function isSkinCardWearItemEquipped(item, appliedSkinsByJob, appliedCardFrameId) {
  if (item.itemType === "card") return appliedCardFrameId === item.id
  if (item.itemType === "skin" && item.jobId) return appliedSkinsByJob[item.jobId] === item.id
  return false
}
