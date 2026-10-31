import test from "node:test"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"

const { createSfxAssetLoader, toHex } = await import("../loadSfxAsset.js")

const nodeDigest = async (bytes) => {
  const hash = createHash("sha256")
  hash.update(Buffer.from(new Uint8Array(bytes)))
  return hash.digest().buffer
}

const bytesOf = (text) => new TextEncoder().encode(text).buffer

const sha256Of = (text) => createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex")

const APPROVED_BYTES = "approved-click-sound-bytes"
const TAMPERED_BYTES = "tampered-different-bytes"

function makeLoader({ body = APPROVED_BYTES, ok = true } = {}) {
  const revoked = []
  const created = []
  let fetched = 0
  const loader = createSfxAssetLoader({
    fetchImpl: async () => {
      fetched += 1
      return { ok, arrayBuffer: async () => bytesOf(body) }
    },
    digest: nodeDigest,
    createBlob: (bytes, type) => ({ bytes, type }),
    createObjectUrl: (blob) => {
      const url = `blob:fixture/${created.length}`
      created.push({ url, blob })
      return url
    },
    revokeObjectUrl: (url) => revoked.push(url),
    timeoutMs: 3000,
  })
  return { loader, revoked, created, fetchCount: () => fetched }
}

const entry = {
  src: "/fixture/approved.wav",
  sha256: sha256Of(APPROVED_BYTES),
  mimeType: "audio/wav",
}

const alive = { isCancelled: () => false }

test("AC-02 검토 해시와 실제 바이트가 일치하면 그 바이트로 만든 소스만 돌려준다", async () => {
  const { loader, created } = makeLoader()

  const loaded = await loader(entry, alive)

  assert.equal(loaded.sha256, entry.sha256)
  assert.equal(loaded.src, "blob:fixture/0")
  assert.deepEqual(new Uint8Array(created[0].blob.bytes), new Uint8Array(bytesOf(APPROVED_BYTES)))
  assert.equal(created[0].blob.type, "audio/wav")
})

test("AC-02 실제 바이트가 다르면 매체 소스를 아예 만들지 않는다", async () => {
  const { loader, created } = makeLoader({ body: TAMPERED_BYTES })

  const loaded = await loader(entry, alive)

  assert.notEqual(loaded.sha256, entry.sha256)
  assert.equal(loaded.sha256, sha256Of(TAMPERED_BYTES))
  assert.equal(loaded.src, null)
  assert.equal(created.length, 0)
})

test("AC-02 release()는 blob URL을 정확히 한 번 해제한다", async () => {
  const { loader, revoked } = makeLoader()

  const loaded = await loader(entry, alive)
  loaded.release()
  loaded.release()

  assert.deepEqual(revoked, ["blob:fixture/0"])
})

test("AC-04 범위가 이미 바뀐 뒤에는 네트워크 요청조차 시작하지 않는다", async () => {
  const { loader, fetchCount } = makeLoader()

  await assert.rejects(() => loader(entry, { isCancelled: () => true }), /cancelled/)
  assert.equal(fetchCount(), 0)
})

test("AC-04 받아오는 도중 범위가 바뀌면 blob URL을 만들지 않는다", async () => {
  const { loader, created } = makeLoader()
  let calls = 0
  const control = {
    isCancelled: () => {
      calls += 1
      return calls > 1
    },
  }

  await assert.rejects(() => loader(entry, control), /cancelled/)
  assert.equal(created.length, 0)
})

test("AC-06 HTTP 실패·해시 없음·경로 없음은 던지고 소스를 만들지 않는다", async () => {
  const httpFail = makeLoader({ ok: false })
  await assert.rejects(() => httpFail.loader(entry, alive), /http-error/)
  assert.equal(httpFail.created.length, 0)

  const { loader } = makeLoader()
  await assert.rejects(() => loader({ src: "/x.wav" }, alive), /hash-missing/)
  await assert.rejects(() => loader({ sha256: "abc" }, alive), /src-missing/)
  await assert.rejects(() => loader(null, alive), /entry-invalid/)
})

test("toHex는 소문자 hex로 검토 기록과 같은 표기를 만든다", () => {
  assert.equal(toHex(new Uint8Array([0, 15, 16, 255]).buffer), "000f10ff")
})
