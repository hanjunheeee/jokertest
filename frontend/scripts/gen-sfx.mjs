import { createHash } from "node:crypto"
import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")
const OUT_DIR = join(ROOT, "public", "sfx")
const TABLE_FILE = join(ROOT, "src", "shared", "audio", "sfxGeneratedAssets.js")
const SAMPLE_RATE = 22050

const n = (at, ms, wave, freq, gain = 0.5, decay = 0.12) => ({ at, ms, wave, freq, gain, decay })
const SPECS = {
  "ui-click":               [n(0, 60, "tri", 1400, 0.35, 0.3)],
  "ui-confirm":             [n(0, 90, "sine", 880, 0.4, 0.4), n(70, 160, "sine", 1320, 0.4, 0.25)],
  "ui-cancel":              [n(0, 90, "sine", 660, 0.4, 0.4), n(70, 160, "sine", 440, 0.4, 0.25)],
  "friend-request-received":[n(0, 120, "sine", 988, 0.4, 0.5), n(130, 220, "sine", 1319, 0.4, 0.3)],
  "friend-request-accepted":[n(0, 100, "sine", 784, 0.4, 0.5), n(100, 100, "sine", 988, 0.4, 0.5), n(200, 260, "sine", 1319, 0.4, 0.3)],
  "friend-request-declined":[n(0, 140, "tri", 523, 0.4, 0.5), n(150, 260, "tri", 392, 0.4, 0.3)],
  "achievement-granted":    [n(0, 110, "sine", 659, 0.35, 0.6), n(110, 110, "sine", 830, 0.35, 0.6), n(220, 110, "sine", 988, 0.35, 0.6), n(330, 420, "sine", 1319, 0.4, 0.3)],
  "system-notification":    [n(0, 140, "sine", 1047, 0.35, 0.4), n(180, 220, "sine", 1047, 0.35, 0.3)],
  "game-invite":            [n(0, 120, "sine", 740, 0.4, 0.5), n(120, 120, "sine", 932, 0.4, 0.5), n(240, 300, "sine", 1109, 0.4, 0.3)],
  "room-ready-changed":     [n(0, 70, "tri", 1175, 0.3, 0.35)],
  "game-started":           [n(0, 160, "square", 262, 0.18, 0.6), n(160, 160, "square", 330, 0.18, 0.6), n(320, 160, "square", 392, 0.18, 0.6), n(480, 520, "square", 523, 0.2, 0.3)],
  "game-phase-changed":     [n(0, 200, "sine", 330, 0.4, 0.5), n(200, 400, "sine", 262, 0.4, 0.3)],
  "day-phase-changed":      [n(0, 120, "sine", 523, 0.35, 0.5), n(130, 120, "sine", 659, 0.35, 0.5), n(260, 320, "sine", 784, 0.35, 0.3)],
  "night-turn-started":     [n(0, 260, "sine", 196, 0.45, 0.5), n(240, 500, "sine", 147, 0.4, 0.3)],
  "day-vote-submitted":     [n(0, 50, "noise", 0, 0.25, 0.2), n(20, 120, "tri", 880, 0.3, 0.3)],
  "tribunal-vote-submitted":[n(0, 50, "noise", 0, 0.25, 0.2), n(20, 120, "tri", 740, 0.3, 0.3)],
  "day-vote-resolved":      [n(0, 180, "square", 392, 0.16, 0.6), n(180, 420, "square", 494, 0.18, 0.3)],
  "tribunal-vote-resolved": [n(0, 180, "square", 349, 0.16, 0.6), n(180, 460, "square", 262, 0.18, 0.3)],
  "night-private-result":   [n(0, 140, "sine", 587, 0.35, 0.5), n(150, 260, "sine", 880, 0.35, 0.3)],
  "night-private-failure":  [n(0, 140, "tri", 440, 0.35, 0.5), n(150, 300, "tri", 311, 0.35, 0.3)],
  "player-eliminated":      [n(0, 40, "noise", 0, 0.5, 0.15), n(0, 360, "sine", 110, 0.5, 0.35), n(60, 600, "sine", 82, 0.45, 0.3)],
  "game-result":            [n(0, 150, "sine", 523, 0.35, 0.7), n(150, 150, "sine", 659, 0.35, 0.7), n(300, 150, "sine", 784, 0.35, 0.7), n(450, 700, "sine", 1047, 0.4, 0.3)],
}

function makeNoise(seed) {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return (s / 4294967296) * 2 - 1
  }
}

function render(notes) {
  const totalMs = Math.max(...notes.map((x) => x.at + x.ms)) + 30
  const length = Math.ceil((totalMs / 1000) * SAMPLE_RATE)
  const buf = new Float64Array(length)
  notes.forEach((note, index) => {
    const noise = makeNoise(7919 * (index + 1))
    const start = Math.floor((note.at / 1000) * SAMPLE_RATE)
    const count = Math.floor((note.ms / 1000) * SAMPLE_RATE)
    const attack = Math.max(1, Math.floor(SAMPLE_RATE * 0.004))
    for (let i = 0; i < count && start + i < length; i++) {
      const t = i / SAMPLE_RATE
      const progress = i / count
      const env = (i < attack ? i / attack : 1) * Math.exp(-progress * (3 / Math.max(note.decay, 0.05)))
      let v
      const phase = 2 * Math.PI * note.freq * t
      if (note.wave === "sine") v = Math.sin(phase)
      else if (note.wave === "tri") v = (2 / Math.PI) * Math.asin(Math.sin(phase))
      else if (note.wave === "square") v = Math.sign(Math.sin(phase)) || 1
      else v = noise()
      buf[start + i] += v * note.gain * env
    }
  })
  let peak = 0
  for (const v of buf) peak = Math.max(peak, Math.abs(v))
  const scale = peak > 0.9 ? 0.9 / peak : 1
  const pcm = Buffer.alloc(length * 2)
  for (let i = 0; i < length; i++) pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, buf[i] * scale)) * 32767), i * 2)
  return { pcm, durationMs: Math.round((length / SAMPLE_RATE) * 1000) }
}

function wav(pcm) {
  const header = Buffer.alloc(44)
  header.write("RIFF", 0); header.writeUInt32LE(36 + pcm.length, 4); header.write("WAVE", 8)
  header.write("fmt ", 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22)
  header.writeUInt32LE(SAMPLE_RATE, 24); header.writeUInt32LE(SAMPLE_RATE * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34)
  header.write("data", 36); header.writeUInt32LE(pcm.length, 40)
  return Buffer.concat([header, pcm])
}

mkdirSync(OUT_DIR, { recursive: true })
const table = {}
for (const [kind, notes] of Object.entries(SPECS)) {
  const { pcm, durationMs } = render(notes)
  const bytes = wav(pcm)
  const file = join(OUT_DIR, `${kind}.wav`)
  writeFileSync(file, bytes)
  table[kind] = { src: `/sfx/${kind}.wav`, sha256: createHash("sha256").update(bytes).digest("hex"), durationMs }
  if (durationMs > 2000) throw new Error(`${kind}: ${durationMs}ms — 별도 효과음 상한(2000ms)을 넘는다`)
}
const lines = Object.entries(table).map(([kind, v]) => `  ${JSON.stringify(kind)}: { src: ${JSON.stringify(v.src)}, sha256: ${JSON.stringify(v.sha256)}, durationMs: ${v.durationMs} },`)
writeFileSync(TABLE_FILE, `// 생성 파일 — 직접 고치지 말 것. scripts/gen-sfx.mjs가 frontend/public/sfx/*.wav와 함께 만든다.
// 각 항목의 sha256은 그 파일의 실제 바이트 해시다(sfxManifest가 로드 시 대조한다).
export const SFX_GENERATED_ASSETS = Object.freeze({
${lines.join("\n")}
})
`)
console.log(`효과음 ${Object.keys(table).length}종 생성 → ${OUT_DIR}`)
for (const [kind, v] of Object.entries(table)) console.log(`  ${kind.padEnd(26)} ${String(v.durationMs).padStart(5)}ms ${v.sha256.slice(0, 12)}`)
