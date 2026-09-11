# F14 external Chrome acceptance evidence

Date: 2026-09-12 KST. Actual external Chrome UI at localhost:5183 and AY backend at localhost:4183. Only the authorized isolated MySQL database was used. Purchases, saves, logins and game actions used production handlers. Five fixture accounts joined over real Socket.IO; their payloads are integration evidence, not five independently viewed browser windows.

## Observed behavior

- 01–02: veteran bought blood noble skin and crown card with actual ledger funds, equipped both through UI, then fresh navigation showed both equipped. Screenshots visually checked.
- 03–04: logout and rookie login; veteran premium skin/card unavailable and disabled, rookie defaults selected. No account cache bleed observed.
- 05: veteran relogin restored equipped blood skin.
- 06–07: intentionally stopped only QA API during save. UI retained old applied selection, showed uncertain outcome and retry. Restarted same API, actual retry saved noble2. Blood was subsequently re-equipped for game verification.
- 08: retained FAILED initial browser evidence on f83c7575. Game snapshot mapping dropped account card and own skin fields; default images appeared despite correct server payload. This is not passing evidence.
- 09: successful same-game reconnect after fixes 9d7621b4 and 64b4a43b. The first fix copied fields; the second accepted normal null cards of unequipped participants. Before each correction, regression tests failed. After corrections, snapshot and production equipment integration tests: 80 pass, 0 fail, 0 skip.
- 10: NEW six-player game on frontend64b4a43b, game83924005-6076-4bb7-bc13-cc7b9df36b32. Browser veteran is CITIZEN; actual role modal renders purchased blood standing image. Five fixture peers acknowledged their own role through normal socket events. The game reached day1.
- 11: full navigation reload of /ingame during DAY_DISCUSSION rejoined the same six-player roster and retained blood standing image plus crown card. Screenshot visually checked. Asset manifests verify images completed loading with nonzero natural widths.
- 12: role modal closed; actual game board displays veteran card. The discussion timer progressed to DAY_VOTE during capture; this is normal ongoing game state, not injected UI state.
- verified-peer-0..4-game-start.json: five actual game_started recipients each see exactly one public crown card on veteran. Their public players contain no role, accountSkinId or accountSkinsByJob. Each self receives only that recipient's private role information.

## Limits and remaining gates

Earlier 01–08 were recorded on f83c7575; 09–12 exercise snapshot corrections through64b4a43b. No ownership/save implementation changed between those commits. This evidence does not replace final full frontend/backend tests, build or independent Claude/Codex review. Previous full backend had three password-session test failures; focused rerun passed but cause was not established. Full raw failure logging is enabled for the next normal run.

Native Chrome confirm control timed out during prior-game exit. The old game was verified still in ROLE_REVEAL and ended using a real fixture participant's normal leave_game_session request, guarded by the exact old QA game ID. New game was also ended by a normal peer leave acknowledgement. No DB reset or session-map edits. All QA processes were identified by actual command line and stopped before normal full verification.
