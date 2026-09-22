# F-33 기능 설계도 — 이모티콘(상점 판매·기본 지급, 마이페이지 팔레트, 인게임 표현)

> F-33을 나눈 **모든 조각(E-1·E-2·E-3)** 의 계획·계획 검증에 같이 붙는다. 조각은 자기 몫만 구현한다.
> 여기 확정된 경로·필드·담당은 **계약**이다 — 조각의 계획은 이것을 바꾸지 않고, 부족한 점은 고치지 말고 `unsure`에 근거와 함께 남긴다.
> 작성 2026-09-22. 원천: 디자이너 가이드 `frontend_20260921_이모티콘 파트 가이드.pdf`(한준희) + 레이아웃 PNG 2장(`이모지 관련 리소스들+가이드.zip`, 운영자 제공). 가이드가 정한 것은 그대로 따르고, 가이드에 없는 것(가격·저장 위치·서버 계약)은 §5 상태표에 "제안"으로 표시한다.
> **운영자 지시(2026-09-19, F-32와 같음): 가격은 임시값** — 시험 데이터·시드로만 두고 최종 상품표로 확정하지 않는다.
> 관련: F-34(플레이어 카드 메뉴)는 카드 **좌클릭**을 쓴다. F-33 팔레트는 **본인 카드 우클릭**이다(가이드 p.4).

## 0. 자산 (이미 커밋됨 — e2c55733, 조각이 옮기거나 이름을 바꾸지 않는다)

가이드 p.2의 폴더 그대로, 파일명만 ASCII로 바꿨다(URL·시험 안정성). 한국어 제목은 상품명으로 쓴다.

| 프레임 | 경로 | 크기 |
|---|---|---|
| 팔레트 프레임(8칸 방사형) | `/frame/emoji/palette-frame.png` | 769×738 |
| 말풍선 | `/frame/emoji/speech-bubble.png` | 179×189 |
| 플레이트(목록 칸) | `/frame/emoji/plate.png` | 158×158 |

| 구분 | 제목(상품명) | 파일 | **itemId** (서버·프런트 공통) |
|---|---|---|---|
| basic | 거절 | `/shopItem/basic/emoji/reject.png` | emoji-basic-reject |
| basic | 눈물 | `/shopItem/basic/emoji/tears.png` | emoji-basic-tears |
| basic | 분노 | `/shopItem/basic/emoji/anger.png` | emoji-basic-anger |
| basic | 사랑 | `/shopItem/basic/emoji/love.png` | emoji-basic-love |
| basic | 씨익 | `/shopItem/basic/emoji/grin.png` | emoji-basic-grin |
| basic | 안녕 | `/shopItem/basic/emoji/hello.png` | emoji-basic-hello |
| basic | 항복 | `/shopItem/basic/emoji/surrender.png` | emoji-basic-surrender |
| basic | 헤롱 | `/shopItem/basic/emoji/dizzy.png` | emoji-basic-dizzy |
| shop | 가시박힌 심장 | `/shopItem/emoji/thorned-heart.png` | emoji-thorned-heart |
| shop | 결투를 신청한다 | `/shopItem/emoji/duel-challenge.png` | emoji-duel-challenge |
| shop | 기분나쁜 조롱 | `/shopItem/emoji/nasty-mock.png` | emoji-nasty-mock |
| shop | 깜짝 | `/shopItem/emoji/startled.png` | emoji-startled |
| shop | 나 울고있어 | `/shopItem/emoji/im-crying.png` | emoji-im-crying |
| shop | 범인 색출 | `/shopItem/emoji/find-culprit.png` | emoji-find-culprit |
| shop | 불 탈 준비됐어 | `/shopItem/emoji/ready-to-burn.png` | emoji-ready-to-burn |
| shop | 쉿 조용히 | `/shopItem/emoji/shush.png` | emoji-shush |
| shop | 어떤 약이었지 | `/shopItem/emoji/which-potion.png` | emoji-which-potion |
| shop | 어리둥절 | `/shopItem/emoji/puzzled.png` | emoji-puzzled |
| shop | 우아한 건배 | `/shopItem/emoji/elegant-toast.png` | emoji-elegant-toast |
| shop | 의미심장 | `/shopItem/emoji/meaningful.png` | emoji-meaningful |
| shop | 정조준 | `/shopItem/emoji/take-aim.png` | emoji-take-aim |
| shop | 죽은자의 영혼 | `/shopItem/emoji/dead-soul.png` | emoji-dead-soul |
| shop | 투표할 시간이야 | `/shopItem/emoji/vote-time.png` | emoji-vote-time |

가이드 p.3의 나머지 UI 자산(검색 입력창, upper/lower 꺽쇠, 빈 스크롤바, 스크롤 롤러, 수락/취소 버튼)은 이미 `frontend/public/button`, `frontend/public/frame`에 있는 것을 쓴다(마이페이지·친구목록이 쓰는 것과 같은 파일).

## 1. 이미 있는 것 (소비만 한다 — 계약을 바꾸지 않는다)

| 무엇 | 어디 | 핵심 |
|---|---|---|
| 카탈로그 | `backend/economy/catalog.js` — 항목 `{id, type, priceGold, defaultGrant, purchasable}`, `ITEM_TYPES.EMOTICON` :15-21 이미 있음, **표시용 4종** `emoticon-웃음/울음/화남/박수` :116-122(`purchasable:false`), `listDefaultGrantItems` :132 | E-1이 4종을 **삭제**하고 23종으로 바꾼다. 4종은 기본 지급·구매 모두 불가였으므로 소유 행이 없다(원장에 흔적 없음) |
| 기본 지급 | `backend/service/economy.service.js` `ensureDefaultEntitlements(userId, db, {transaction})` :378-398 — `listDefaultGrantItems()`를 돌며 `referenceEventId = default-grant:${userId}:${item.id}`로 멱등 지급(`ITEM_ALREADY_OWNED` 무시). 호출 경로 3곳(:366-377): 지갑·장착 lazy, 가입, 기존 계정 backfill `backend/db/backfillEconomy.js` | **`defaultGrant:true`로 등록만 하면 기존 계정도 다음 지갑 조회에서 받는다** — E-1은 새 지급 코드를 쓰지 않는다 |
| 소유 | `backend/models/economy/economy.model.js` `EconomyEntitlement` :99 → `economy_entitlements(user_id, item_id, item_type, source, acquired_at)`; `getWalletSummary` :402 → `entitlements:[{itemId, itemType, source, acquiredAt}]` | 프런트는 지갑 요약의 `entitlements`로 소유를 안다(추가 조회 없음) |
| 구매 | `purchaseItems`(:499), `POST /economy/purchases/bulk`(`economy.routes.js:124`), 결과 `GET /economy/purchases/:referenceEventId`(:153), 프런트 `purchaseController.js`·`storePurchase.store.js` | 이모티콘도 같은 경로. 새 구매 API 없음 |
| 로드아웃(선례) | `EconomyLoadout` :134 → `economy_loadouts(... revision STRING(36))`, `POST /economy/equip`(:215, `expectedRevision` CAS 필수), 허용 필드 목록 방식 :63-75("무시는 거부가 아니다" — 모르는 필드는 400) | 팔레트 저장 API의 본보기 |
| 마이그레이션 | 최고 `backend/db/migrations/0018-add-currency-products-topup-orders.js`; `backend/scripts/migrate-db.js:19-60` `MIGRATIONS` 배열에 등록 | E-2는 **0019** |
| 사용자 라우트 | `backend/routes/user.routes.js`(23줄, `verifyToken` → 컨트롤러, 본인은 `req.user.uuid`), 본보기 `backend/controller/profile.controller.js` `getMyProfile` :9 | 팔레트 API는 여기에 두 줄 추가 |
| 소켓 수신 본보기 | `backend/socket/gameSession.js` 등록 :5236-5258(`socket.on('submit_game_chat_message', (payload, callback) => …)`), 핸들러 `handleSubmitGameChatMessage` :3361-3420(콜백 검사 → `isCurrentSocketForUuid` → 페이로드 검사 → game-core `prepare` → 수신자 → commit+emit; 거부는 `{ok:false, code, message}`) | E-3가 그대로 따른다 |
| 송신 경계 | **`emitToGameChannel(io, session, event, payload, endContext)`** :461-481 — 유일한 방송 경계(`io.to` 직접 사용 금지), 수신 자격 :324-345 | E-3는 이것만 쓴다 |
| 속도 제한 | `backend/game-core/gameSession.js` `CHAT_MIN_INTERVAL_MS` :90, 세션 객체의 채널별 맵 :142-152(`getChatRateLimitMap`), 검사 :4214-4218 / 확정 :4223-4237, 세션 정리 :950-953 | 이모지도 같은 형태의 세션 맵 `emojiRateLimit` |
| 프런트 소켓 | `frontend/src/domains/game/ingame/hooks/useGameSessionSocketEvents.js` 등록 :583-597 / 해제 :599-614, 청취기 본보기 `utils/attachGameChatListener.js:18-37`, 송신 `socket.emitWithAck(...)`(`useInGameGameChatSession.js:234`) | |
| 사건 잠금 시험 | `frontend/src/domains/game/ingame/__tests__/InGamePage.deadParticipant.integration.test.js` — `BACKEND_SOCKET_ON_EVENTS_LOCK` :757, `SERVER_EMIT_EVENTS_LOCK` :986, **`SERVER_INDIRECT_EMIT_SITES_LOCK` :1009(file:line)**, `CLIENT_EMIT_EVENTS_LOCK` :1382, `CLIENT_SUBSCRIBE_EVENTS_LOCK` :1399, `INDIRECT_EVENT_SITES_LOCK` :1422(file:line), `ROUTE_WIRING_LOCK` :1263, `INGAME_MOUNT_LOCK` :1528 | 새 사건·컴포넌트·라우트는 **잠금 목록을 갱신**한다(단언 삭제 아님). file:line 목록은 위쪽 줄 삽입으로도 깨진다 — 조각이 갱신한다 |
| 상점 프런트 | `frontend/src/domains/store/constants/storeItems.js:151-156` `EMOTICON_STORE_ITEMS`(더미 4종, 카드 아이콘 차용) → `STORE_ITEMS` :158; `components/panel/StorePanel.jsx:35-37` `NON_PURCHASABLE_CATEGORIES = {"인게임 재화","이모티콘"}`; `StoreSelectedItemDetail.jsx:110` 이모티콘이면 "표시 전용 · 준비중"; 카테고리 `storeFilterOptions.js` | |
| f09 시험 | `backend/tests/db/f09-store-purchases.integration.test.js` :584-606 "표시용 이모티콘 개별 구매는 거부되고 부작용이 없다", :608-627 "이모티콘이 섞인 일괄 구매…" | E-1이 **계약 변경**: "구매 가능, 잔액 차감, 소유 생성"으로 고쳐 쓴다(위조 요청 거부 시험은 존재하지 않는 itemId로 유지) |
| 마이페이지 | `frontend/src/domains/user/components/MyPageLayout.jsx:42` `<EmoticonEntryButton />`(props 없음), `MyPageLayout/EmoticonEntryButton.jsx`(8줄, no-op), 시험 `MyPageLayout/__tests__/emoticonEntry.test.js`(기능 **부재**를 6개 시험으로 고정 — 의도된 걸림돌) | E-2가 계약 변경으로 다시 쓴다. 라우트 `frontend/src/app/routes/index.jsx:42` `/mypage` |
| 카드 | `.../ingame/components/board/InGamePlayerCard.jsx`(:26-36 props, 클릭 없음), `InGamePlayerBoard.jsx:21-25` 래퍼, 오버레이 선례 `status/InGamePlayerStatusOverlay.jsx` | `onContextMenu`는 코드 어디에도 없다 — E-3가 처음 단다 |
| 자산 경로 | `frontend/src/shared/utils/publicAsset.js` `publicAsset(path)`(NFC·encodeURI), 컴포넌트 `shared/ui/PublicAsset` | |

## 2. F-33이 확정하는 계약

### 2-1. 카탈로그·상점 (E-1)
- `catalog.js`: 표시용 4종 삭제 → §0의 23종. 기본 8종 `{type: EMOTICON, priceGold: 0, defaultGrant: true, purchasable: false}`, 상점 15종 `{type: EMOTICON, priceGold: 500 /* 임시 */, defaultGrant: false, purchasable: true}`. 임시 가격은 상수 `EMOTICON_PRICE_GOLD_PLACEHOLDER = 500` 하나로 모아 나중에 바꾼다.
- 기존 계정 지급은 `ensureDefaultEntitlements`의 기존 경로로 자동(등록만). backfill 스크립트는 건드리지 않는다.
- 프런트 `storeItems.js`: `EMOTICON_STORE_ITEMS`를 23종으로(id = itemId, `category:"이모티콘"`, `name`=제목, `icon`=§0 파일, 기본 8종은 `tag:"기본 지급"`·가격 0·구매 버튼 없음(이미 소유), 상점 15종은 `priceAmount: 500`). `NON_PURCHASABLE_CATEGORIES`에서 "이모티콘" 제거, `StoreSelectedItemDetail.jsx:110` 분기 제거 → 일반 구매 버튼·일괄 구매에 포함. 소유한 것은 기존 "보유" 표시 규칙을 따른다.
- 서버 응답 형태(`getWalletSummary`·구매 API)는 바뀌지 않는다.

### 2-2. 팔레트 저장 (E-2)
- 마이그레이션 `0019-add-emoji-palettes.js`: 테이블 `economy_emoji_palettes` — `user_id`(UUID PK, users FK) · `slot_1..slot_8`(STRING(120) NULL, itemId) · `revision`(STRING(36)) · 시각. 모델 `EconomyEmojiPalette`를 `economy.model.js`에 추가. 행이 없으면 **기본 8종을 §0 순서(거절·눈물·분노·사랑·씨익·안녕·항복·헤롱)** 로 채운 것으로 본다(읽기 때 findOrCreate).
- HTTP(둘 다 `verifyToken`, 본인 = `req.user.uuid`, `user.routes.js`):
  | 메서드·경로 | 요청 | 응답 |
  |---|---|---|
  | `GET /user/me/emoji-palette` | — | `{ok:true, slots:[itemId|null ×8], revision, owned:[itemId…]}` — `owned`는 `economy_entitlements`의 EMOTICON 소유 목록(상점 화면과 같은 값) |
  | `PUT /user/me/emoji-palette` | `{slots:[8], expectedRevision}` — 허용 필드 이 둘뿐(모르는 필드 400, 로드아웃과 같은 규칙) | `{ok:true, slots, revision}` / `INVALID_SLOTS`(길이≠8, 중복, 형식) · `NOT_OWNED`(소유하지 않은 itemId — 어떤 슬롯이든) · `REVISION_MISMATCH`(409, 현재 값 동봉) |
  - 저장은 한 트랜잭션에서 소유 검증(`economy_entitlements` 조회) → 조건부 UPDATE(revision CAS) → 새 revision. 빈 슬롯(null) 허용.
- 컨트롤러 `backend/controller/emojiPalette.controller.js`, 서비스 함수는 `economy.service.js`에 `getEmojiPalette(userId)` / `saveEmojiPalette(userId, {slots, expectedRevision})`.
- 프런트: 라우트 **`/mypage/emoticons`**(`routes/index.jsx` ProtectedRoute 안, `ROUTE_WIRING_LOCK` 갱신), 페이지 `frontend/src/domains/user/pages/EmoticonPalettePage.jsx`. 레이아웃은 PNG 그대로: 왼쪽 소유 목록(검색 입력 + "전체/기본/상점" 드롭다운, 3열 플레이트 격자, 스크롤바), 오른쪽 8칸 방사형 팔레트(`palette-frame.png`), 아래 저장/취소. 조작: 팔레트 슬롯 클릭 → 선택 상태 → 왼쪽 목록 클릭으로 교체(가이드 p.3 "특정 슬롯을 클릭하면 교체"). 저장 전엔 로컬 상태, 저장은 PUT, 취소는 서버 값으로 복원. API 모듈 `frontend/src/domains/user/api/emojiPalette.api.js`, 상태 `frontend/src/domains/user/store/emojiPalette.store.js`(zustand, `identityGeneration` 경계 규칙은 economy.store와 같게).
- `EmoticonEntryButton`은 `navigate("/mypage/emoticons")`. `emoticonEntry.test.js`는 "이동한다"로 다시 쓴다(계약 변경 기록).

### 2-3. 인게임 표현 (E-3)
- 클라 → 서버 **`send_emoji`** `{gameId, itemId}` (emitWithAck). 서버 검사 순서: 콜백 → `isCurrentSocketForUuid` → 페이로드 형식 → 세션·참가자(죽은 참가자 **허용**, 관전 이탈자 불허 — `isEligibleSessionRecipient`와 같은 기준) → 게임 종료 아님 → 속도 제한(`EMOJI_MIN_INTERVAL_MS = 1000`, 세션 맵 `emojiRateLimit`, 정리 :950 옆) → **소유 + 팔레트 포함** 검증(`getEmojiPalette(uuid)`의 slots에 itemId가 있어야 함; 팔레트에 없으면 `NOT_IN_PALETTE`, 미소유 `NOT_OWNED`). 거부 코드: `STALE_SOCKET`·`INVALID_PAYLOAD`·`NOT_PARTICIPANT`·`GAME_ENDED`·`RATE_LIMITED`·`NOT_OWNED`·`NOT_IN_PALETTE`. ack `{ok:true, sentAt}`.
- 서버 → 전원 **`emoji_shown`** `{gameId, uuid, itemId, sentAt}` — `emitToGameChannel`로만. 서버는 저장하지 않는다(스냅샷에 없음, 재접속하면 사라짐).
- 팔레트 조회는 게임 세션 시작 때 참가자 전원 것을 한 번 읽어 세션에 캐시(`session.emojiPaletteByUuid`)하고, 마이페이지에서 바꾼 것은 **다음 게임**부터 반영한다(게임 중 재조회 없음 — 단순·결정적).
- 프런트: 본인 카드 래퍼 `onContextMenu`(preventDefault) → 방사형 팔레트 `InGameEmojiPalette.jsx`(`palette-frame.png`, 8칸, 호버 강조는 레퍼런스처럼 칸 밝기 + 확대) → 칸 위에서 마우스 놓기(가이드 "우클릭 드래그하면서 호버") 또는 클릭 → `send_emoji`. 성공 ack나 `emoji_shown` 수신 시 해당 uuid 카드 위에 말풍선 `InGameEmojiBubble.jsx`(`speech-bubble.png` + 이모지) **3초** 표시, 같은 사람이 다시 보내면 교체. 팔레트 데이터는 `GET /user/me/emoji-palette`를 인게임 진입 때 한 번 읽는다(`emojiPalette.store.js` 공유). 죽은 참가자도 보낼 수 있다. 좌클릭은 F-34 몫이라 건드리지 않는다.
- 잠금 갱신: `BACKEND_SOCKET_ON_EVENTS_LOCK`(+`send_emoji`), `SERVER_EMIT_EVENTS_LOCK`(+`emoji_shown`), `SERVER_INDIRECT_EMIT_SITES_LOCK`(줄 이동), `CLIENT_EMIT_EVENTS_LOCK`·`CLIENT_SUBSCRIBE_EVENTS_LOCK`, `INGAME_MOUNT_LOCK`(+`InGameEmojiPalette`, `InGameEmojiBubble`).

## 3. 조각 나누기와 담당

| 조각 | 범위 | 파일(생산) | 시험 |
|---|---|---|---|
| **E-1** | §2-1 카탈로그 23종·기본 지급·상점 구매 허용 | `backend/economy/catalog.js`, `frontend/.../store/constants/storeItems.js`, `StorePanel.jsx`, `StoreSelectedItemDetail.jsx` | f09 시험 계약 변경(구매 성공·소유·일괄 포함, 존재하지 않는 id 거부 유지), 기본 지급 시험(신규 계정·기존 계정 backfill 경로에 8종), 상점 패널 시험(이모티콘 탭 구매 버튼) |
| **E-2** | §2-2 팔레트 테이블·API·마이페이지 화면 | `0019-add-emoji-palettes.js`, `migrate-db.js`, `economy.model.js`, `economy.service.js`, `emojiPalette.controller.js`, `user.routes.js`, `EmoticonPalettePage.jsx`, `emojiPalette.api.js`, `emojiPalette.store.js`, `EmoticonEntryButton.jsx`, `routes/index.jsx` | API 시험(기본값·CAS·미소유 거부·모르는 필드 400), 페이지 시험(슬롯 선택→교체→저장 PUT 본문, 취소 복원), `emoticonEntry.test.js`·`ROUTE_WIRING_LOCK` 갱신. **12개 파일** — F-32 §2-5a 규칙대로 기능·시험을 빼지 않는다; 계획 검증이 분할을 요구하면 E-2a(서버)·E-2b(화면)로 나눈다 |
| **E-3** | §2-3 소켓 사건·팔레트·말풍선 | `backend/socket/gameSession.js`, `backend/game-core/gameSession.js`(속도 제한·캐시), `useGameSessionSocketEvents.js`, `InGamePlayerBoard.jsx`, `InGameEmojiPalette.jsx`, `InGameEmojiBubble.jsx`, `InGamePage.jsx` | 서버 시험(검사 순서별 거부 코드·1초 제한·전원 방송·죽은 참가자 허용), 프런트 시험(우클릭→팔레트→송신 페이로드, `emoji_shown`→말풍선 3초→소멸·교체), 잠금 6곳 갱신 |

- 순서: E-1 → E-2 → E-3(E-3는 E-2의 `getEmojiPalette`에 의존). F-34 V-1과 E-3는 같은 `InGamePlayerBoard.jsx`를 건드린다 — **E-3를 V-1 뒤**에 둔다(배치 순서 E-1, E-2, V-1, V-2, S-1, E-3).

## 4. 범위 밖
- 이모지 애니메이션·소리, 채팅창 안 이모지, 모바일 길게 누르기, 상점 카테고리별 할인·묶음, 팔레트 9칸 이상, 게임 중 팔레트 즉시 반영.

## 5. 상태표
| 항목 | 상태 | 근거 |
|---|---|---|
| 자산 위치·23종·기본 8/상점 15 | 확정 | 가이드 p.2, zip 내용 |
| 마이페이지 화면 구성·슬롯 클릭 교체 | 확정 | 가이드 p.3 + 레이아웃 PNG |
| 인게임 우클릭 팔레트·말풍선 | 확정 | 가이드 p.4 + 레이아웃 PNG |
| 상점 카테고리·상품 등록 | 확정 | 가이드 p.5 |
| **가격 500골드** | 임시값(운영자 확정 필요) | F-32와 같은 임시값 정책 |
| 팔레트 저장 위치(새 테이블·CAS API) | 제안(운영자 확인 필요) | 로드아웃 선례 |
| 사건 이름 `send_emoji`/`emoji_shown`, 1초 제한, 3초 말풍선, 팔레트는 다음 게임부터 반영 | 제안(운영자 확인 필요) | 채팅 속도 제한 선례 |
| 죽은 참가자 송신 허용 | 제안(운영자 확인 필요) | 죽은 참가자 채팅이 허용되는 것과 같은 기준 |
