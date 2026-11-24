// 로그인·계정관리 공통 양피지 틀(403×625) border-image — 폭(cqw) 기준으로 장식 비율 유지
import { LOGIN_ASSETS } from "@/shared/constants/loginAssets.js"
import { publicAsset } from "@/shared/utils/publicAsset.js"

export const LOGIN_PARCHMENT_SLICE = { top: 140, side: 40, bottom: 46 }

export const LOGIN_PARCHMENT_FRAME_W = 403
export const LOGIN_PARCHMENT_FRAME_H = 625

const at = (px) => `calc(100cqw * ${px} / ${LOGIN_PARCHMENT_FRAME_W})`

// 로그인 aspect-[403/625]와 같은 최소 높이 — 내용만 줄여도 틀 장식 크기 유지
export const LOGIN_PARCHMENT_FRAME_BOX_CLASS = `w-full min-h-[calc(100cqw*${LOGIN_PARCHMENT_FRAME_H}/${LOGIN_PARCHMENT_FRAME_W})]`

export function buildLoginParchmentFrameStyle({
  paddingTop = 124,
  paddingX = 34,
  paddingBottom = 40,
} = {}) {
  const { top, side, bottom } = LOGIN_PARCHMENT_SLICE

  return {
    borderStyle: "solid",
    borderWidth: 0,
    borderImageSource: `url("${publicAsset(LOGIN_ASSETS.frame)}")`,
    borderImageSlice: `${top} ${side} ${bottom} fill`,
    borderImageWidth: `${at(top)} ${at(side)} ${at(bottom)}`,
    borderImageRepeat: "stretch",
    padding: `${at(paddingTop)} ${at(paddingX)} ${at(paddingBottom)}`,
  }
}
