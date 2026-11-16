// 받은 채팅이 보이는 표 시험(jsdom, 인게임 화면 전체) — 나 5 × 낮/밤마다 낮·죽은 사람·의사·광대 글이 하나씩 왔을 때 판 위 채팅 칸에 보이는 줄
// 목록 A06-판중-채팅.md 화면 PC 번호 A06-F-179~188
import test from "node:test"
import assert from "node:assert/strict"
import { openTable, resetTable } from "./a06Kit.mjs"

test.afterEach(resetTable)

// 8명 판 직접 구성: 0·1번 광대, 2·3번 의사, 4~7번 시민, 6번은 처음부터 죽음
// 보내는 사람: 낮 글 7번, 죽은 사람 글 6번, 의사 글 3번, 광대 글 1번
const ROLES = { 0: "JOKER", 1: "JOKER", 2: "DOCTOR", 3: "DOCTOR" }
const ME = [
  { key: "산 시민", seat: 4, role: "CITIZEN", dead: false },
  { key: "산 의사", seat: 2, role: "DOCTOR", dead: false },
  { key: "산 광대", seat: 0, role: "JOKER", dead: false },
  { key: "죽은 시민", seat: 5, role: "CITIZEN", dead: true },
  { key: "죽은 광대", seat: 0, role: "JOKER", dead: true },
]
const EXPECTED = {
  "산 시민": { DAY: ["낮글"], NIGHT: [] },
  "산 의사": { DAY: ["낮글"], NIGHT: ["의사글"] },
  "산 광대": { DAY: ["낮글"], NIGHT: ["광대글"] },
  "죽은 시민": { DAY: ["낮글", "죽은글"], NIGHT: ["죽은글"] },
  "죽은 광대": { DAY: ["낮글", "죽은글"], NIGHT: ["광대글", "죽은글"] },
}
const WORDS = ["낮글", "죽은글", "의사글", "광대글"]

// 판 위 채팅 칸에 보이는 글 (보낸 순서 그대로)
const visible = (t) => t.rows("board").map((row) => WORDS.find((w) => row.includes(w)) ?? row)

let number = 179
for (const me of ME) {
  for (const phase of ["DAY", "NIGHT"]) {
    const id = `A06-F-${String(number).padStart(3, "0")}`
    number += 1
    const expected = EXPECTED[me.key][phase]
    const phaseLabel = phase === "DAY" ? "낮" : "밤"
    test(`${id} 받은 글이 보이는 표: ${phaseLabel} × ${me.key} → ${expected.length ? expected.join(" + ") : "줄 0"}`, async () => {
      const t = await openTable({
        n: 8, me: me.seat, myRole: me.role, roles: ROLES,
        dead: me.dead ? [6, me.seat] : [6], phase, view: "page",
      })
      // 낮엔 넷 다 넣음 (같은 직업 글은 서버가 안 보내지만 와도 안 그리는지)
      // 밤엔 낮 글 없음 (밤엔 아무도 낮 채팅을 못 씀)
      // 같은 직업 글 알림엔 채널 칸이 없어 화면은 받은 것을 내 직업 것으로 봄 → 의사·광대에겐 서버가 보내는 자기 직업 글만, 시민에겐 둘 다(잘못 온 것)
      if (phase === "DAY") {
        await t.dayChat(7, "낮글", { sentAt: 1_000 })
        await t.deadChat(6, "죽은글", { sentAt: 2_000 })
        await t.roleChat(3, "의사글", { sentAt: 3_000 })
        await t.roleChat(1, "광대글", { sentAt: 4_000 })
      } else {
        const citizen = me.role === "CITIZEN"
        if (citizen || me.role === "DOCTOR") await t.roleChat(3, "의사글", { sentAt: 1_000 })
        if (citizen || me.role === "JOKER") await t.roleChat(1, "광대글", { sentAt: 2_000 })
        await t.deadChat(6, "죽은글", { sentAt: 3_000 })
      }
      assert.deepEqual(visible(t), expected)
    })
  }
}
