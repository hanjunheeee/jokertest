import assert from "node:assert/strict"
import { readdirSync, statSync } from "node:fs"
import { dirname, join, relative, sep } from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"

import { PLAYER_PROFILE_ASSETS } from "../../../src/shared/constants/playerProfileAssets.js"
import {
  JOB_CLOSEUP_PORTRAITS,
  JOB_STANDING_PORTRAITS,
} from "../../../src/shared/constants/playerPortraitAssets.js"
import { TUTORIAL_GUIDE_ARROW, TUTORIAL_GUIDE_SLIDES } from "../../../src/shared/constants/tutorialAssets.js"
import { PROFILE_BORDER_ZOOM_CLOSE_BUTTON_SRC } from "../../../src/shared/ui/profileBorderZoom/profileBorderZoomLayout.js"

const PUBLIC_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "public",
)

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else out.push(full)
  }
  return out
}

const existingPaths = new Set(
  walk(PUBLIC_DIR).map((file) =>
    `/${relative(PUBLIC_DIR, file).split(sep).join("/")}`.normalize("NFC"),
  ),
)

function assertExists(path) {
  assert.ok(
    existingPaths.has(path.normalize("NFC")),
    `public에 없는 에셋 경로입니다: ${path}`,
  )
}

test("직업 초상 상수의 모든 경로가 public에 존재한다", () => {
  for (const path of [...JOB_STANDING_PORTRAITS, ...JOB_CLOSEUP_PORTRAITS]) {
    assertExists(path)
  }
})

test("standing·closeup 초상 슬롯 수가 같아 index 매핑이 어긋나지 않는다", () => {
  assert.equal(JOB_STANDING_PORTRAITS.length, JOB_CLOSEUP_PORTRAITS.length)
})

test("플레이어 프로필 상수의 모든 경로가 public에 존재한다", () => {
  assertExists(PLAYER_PROFILE_ASSETS.defaultBorder)
  assertExists(PLAYER_PROFILE_ASSETS.defaultPhoto)
  assert.equal(PLAYER_PROFILE_ASSETS.dummyPhotos.length, 5)
  for (const path of PLAYER_PROFILE_ASSETS.dummyPhotos) assertExists(path)
})

test("튜토리얼·프로필 테두리 확대 상수의 경로가 public에 존재한다", () => {
  for (const path of TUTORIAL_GUIDE_SLIDES) assertExists(path)
  assertExists(TUTORIAL_GUIDE_ARROW)
  assertExists(PROFILE_BORDER_ZOOM_CLOSE_BUTTON_SRC)
})
