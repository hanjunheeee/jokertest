import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import {
  INGAME_PLAYER_ALIVE_FRAME_VARIANTS,
  INGAME_PLAYER_ASSETS,
  INGAME_PLAYER_DEAD_FRAME_VARIANTS,
} from "../../../../../../src/domains/game/ingame/constants/board/ingamePlayerAssets.js"

const HERE = path.dirname(fileURLToPath(import.meta.url))
const PUBLIC_DIR = path.resolve(HERE, "../../../../../..", "public")

function describeDirectory(dir) {
  if (!fs.existsSync(dir)) return `(디렉터리 없음: ${dir})`
  return fs
    .readdirSync(dir)
    .map((name) => `${name} [${[...name].map((c) => c.codePointAt(0).toString(16)).join(" ")}]`)
    .join("\n")
}

function assertPublicAssetExists(assetPath) {
  assert.ok(assetPath.startsWith("/"), `public 에셋 경로는 /로 시작해야 한다: ${assetPath}`)

  const absolute = path.join(PUBLIC_DIR, assetPath)
  assert.ok(
    fs.existsSync(absolute),
    `public 에셋이 없다: ${assetPath}\n찾은 위치: ${absolute}\n같은 폴더의 실제 파일:\n${describeDirectory(path.dirname(absolute))}`,
  )
  assert.ok(fs.statSync(absolute).isFile(), `public 에셋이 파일이 아니다: ${assetPath}`)
}

test("frontend/public 디렉터리를 찾는다", () => {
  assert.ok(fs.existsSync(PUBLIC_DIR), `public 디렉터리가 없다: ${PUBLIC_DIR}`)
})

test("alive 프레임 경로 상수가 가리키는 파일이 모두 존재한다", () => {
  assert.ok(INGAME_PLAYER_ALIVE_FRAME_VARIANTS.length > 0)
  for (const assetPath of INGAME_PLAYER_ALIVE_FRAME_VARIANTS) assertPublicAssetExists(assetPath)
})

test("dead 프레임 경로 상수가 가리키는 파일이 모두 존재한다", () => {
  assert.equal(
    INGAME_PLAYER_DEAD_FRAME_VARIANTS.length,
    INGAME_PLAYER_ALIVE_FRAME_VARIANTS.length,
    "dead 프레임은 alive와 같은 순서·개수여야 한다",
  )
  for (const assetPath of INGAME_PLAYER_DEAD_FRAME_VARIANTS) assertPublicAssetExists(assetPath)
})

test("INGAME_PLAYER_ASSETS의 모든 경로가 가리키는 파일이 존재한다", () => {
  const values = Object.values(INGAME_PLAYER_ASSETS)
  assert.ok(values.length > 0)
  for (const assetPath of values) assertPublicAssetExists(assetPath)
})
