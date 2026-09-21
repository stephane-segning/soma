# Plan 10: Multi-Platform Production Readiness

Status of the push to make Soma shippable on **desktop, mobile, and web**, and what is left.

Written after a full audit + implementation pass. Every claim below was verified against the
code or a real command run, not inferred from docs — several long-standing `AGENTS.md` claims
turned out to be false (see "Documentation drift" at the end).

## Platform decisions (settled)

| Target | Decision |
|---|---|
| Desktop | **Tauri V2 only.** Electron stays deleted (#142, #151). |
| Mobile | **Tauri V2 iOS/Android**, not React Native. Reuses the same renderer, `@soma/ui`, and Rust host. |
| Web | **Thin client over REST + WebSocket** to `desktop-bff`. The browser is never a libp2p peer. |

Mobile was chosen on evidence, not preference: `soma-daemon` (libp2p + SQLite + rustls)
cross-compiles clean for `aarch64-apple-ios` and `aarch64-linux-android`, and `src-tauri` was
already in mobile-template shape (`crate-type = ["staticlib","cdylib","rlib"]`, desktop-only
plugins already `cfg`-gated, `#[cfg_attr(mobile, tauri::mobile_entry_point)]` already present).
React Native would have meant rewriting ~50 DOM components and replacing the Tiptap/ProseMirror
editor outright, since ProseMirror needs `contentEditable` and RN has none.

## The pattern behind most of what was broken

Nearly every gap had the same shape: **the Rust backend was complete and correct, and the
renderer never called it.** Page creation, blob upload, search, `/practice`, `discoverSpaces`
and the bot capability surface were all fully implemented down to SQL and unreachable from the
UI. When picking up any remaining item below, check the backend first — it is usually already
there.

## Done in this pass

- **Security: remote membership-forgery vulnerability fixed.** Capability verification proved
  internal self-consistency only — it never bound a claimed issuer to ground truth. Any peer
  that could connect and knew a `space_id` could push one unsolicited `/soma/join-decision/1`
  granting itself OWNER, silently overwriting the victim's own membership row. Fixed with a
  `TrustAnchor` + `PeerKeyResolver`, an outgoing-request correlation gate, an authority-gated
  membership upsert, real `IssuerCapability` signature verification at all three consumption
  points, a gated `revoke_space`, and a fail-closed scope default. Validated by mutation
  testing (disable each check, confirm exactly the intended test fails).
- **p2p filesystem made actually peer-to-peer.** `PeerCommand::FetchBlob` previously had zero
  callers. Added a candidate-peer resolver with single-flight + timeouts, network fallback in
  `read_blob`, a `/soma/blob-announce/1` protocol, mirror-bot fetch-on-announce, SQL
  reconciliation for fetched blobs, a network-receive size cap, and a structurally cache-only
  `FsBlobStore` role for bots.
- **Web backend.** `desktop-bff` is authenticated (bearer, constant-time, fails closed
  unconditionally), SSE replaced by WebSocket, all three event sources unified onto one stream,
  browser-loadable blob GET route, per-session upload staging.
- **Mobile.** iOS builds and **runs on simulator** with a live libp2p peer; Android builds to a
  valid APK. Responsive shell per ADR-0005 tiers.
- **UX.** A real shortcut registry (portable core, Tauri menu bridge isolated) with ⌘N/⌘⇧N/⌘K/⌘/
  working via keyboard, palette and native menu; real page + space creation; editor blob uploads
  and page links.
- **CI.** clippy `-D warnings`, renderer typecheck/lint/build, `@soma/sdk` tests, specta bindings
  drift gate, cargo-deny. 9 real advisories cleared by a surgical dependency update.
- **Deployment.** Compose and the Helm chart both actually work — the chart previously rendered
  **zero** Kubernetes objects (values were at the wrong nesting level for the `app-template`
  subchart; `helm lint` passed anyway because it only checks syntax).

## Remaining work, highest value first

### 1. AI provider config per space — not started
No AI settings UI exists at all, global or per-space. Config is a single global blob in
`tauri-plugin-store`; `AgentRuntimeConfig.workspaces` already keys by `space_id` but only carries
model names, and nothing writes to it. `ChatPanel` reads `spaceId` from `useParams()` while
rendered *outside* the `Outlet` chain, so it is structurally always `null` — fix that first or
nothing per-space can ever take effect. Design already exists: ADR-0005 §3/§5 and
`prd/ui-revamp-v0-refs-assistant-bots.md`.

**API keys are stored in plaintext** in `soma-data.json` and round-tripped to the renderer on
every `settings.all()`. Worth its own track regardless of the per-space work.

### 2. Invite UX — absent end to end
No invite link, no QR, no paste-a-peer-ID form. `soma://` deep links are forwarded to the
renderer as raw strings and `console.info`'d — there is no path parsing or route table. The proto
already models `InviteState`/`InviteProof` with a comment about embedding them in a `soma://`
link; both have zero references outside generated code. Today the only way to join a space is
calling the SDK directly with an out-of-band peer ID and multiaddr.

### 3. Space settings screen
`spaces/:spaceId/members` and `/info` are `Empty` placeholders; there is no
`spaces/:spaceId/settings` route. ADR-0005 §3 specifies the IA (General · Members · Assistant ·
Bots · Sharing · Danger, auto-save on blur, no global Save). Items 1, 2 and the bots UI all land
here.

### 4. Shell hardening
- **No error boundary anywhere** — a render throw blanks the whole app.
- A complete toast system exists in `@soma/ui` and is **never mounted**; failures go to `console`.
- `/practice` route was dropped in the Electron→Tauri rewrite and never restored, though its
  entire backend was ported (4 commands, SDK surface, BFF routes).
- Window title is permanently "Soma" regardless of the open page.
- No focus trap in any overlay.
- Command palette advertises "Search docs, spaces, commands…" but only ever shows commands; the
  `search` backend command has zero call sites (and returns `[]` — it is a stub).

### 5. `desktop-services` Tauri decoupling → `somad` role
The web API cannot be a `somad` subcommand today: `desktop-bff` pulls the full native webview
stack (`wry`, `tao`, `objc2-web-kit`; GTK/WebKit on Linux) through `desktop-services` → `tauri`,
and `somad` ships as a distroless static MUSL binary. `desktop-daemon` has already been
decoupled; the remaining hop needs a feature gate on `desktop-services` plus a trait-based
`ConfigStore` (Tauri-store impl + plain-file impl).

### 6. Realtime collaboration
Documents are plain ProseMirror JSON with a 500ms debounced last-write-wins upsert and **no
conflict handling** — concurrent writers silently stomp each other. A correct Yjs merge primitive
exists (`agentd/src/handle/drift.rs`, real `yrs`) and is fully RPC-wired but orphaned: zero
callers, and unconnected to the `documents` table. This is Phase B of plan-02.

### 7. Smaller, well-scoped
- Mobile CI/release — needs Apple provisioning + Android keystore secrets that don't exist yet.
- `hickory-proto` (via `libp2p-mdns`) and `quick-xml` (via `plist`) advisories need root
  `Cargo.toml` bumps; documented in `deny.toml`'s ignore list.
- Renderer bundle is a single 1.68MB chunk — no route-level code splitting.
- Three resolver/helper duplications from parallel-agent file-ownership boundaries; consolidate.
- `somad`'s default `--db-url` of `./botd.db` is a bare path, which `connect_any()` cannot
  dispatch (no URL scheme; `normalize_sqlite_url` only runs on the `DbFactory::sqlite()` path).
- Decorative `placehold.co` editor nodes (`textRotate`, `carousel`, `accordion`) are removed from
  the add-menu but still in the schema — full removal needs confirmation that no stored document
  uses them.

### 8. Residual security risk (accepted, documented)
`SpaceGenesisArtifact` is created, owner-signed, stored and correctly verifiable — but **never
transmitted**, so first contact for a space is TOFU: it trusts whichever peer the local user's
own `JoinSpace` targeted. Closing this means shipping genesis over the wire so "who owns this
space" is independently checkable. Every decision *after* first contact is correctly anchored.

## Documentation drift found (AGENTS.md)

Treat `AGENTS.md` as a lead, not a source of truth, until these are fixed:

- **"Yoopta" throughout** (§164, 255, 262, 272, 274, 284, 291, 293, 337) — the editor is Tiptap
  3.18. Also `backend/crates/storage/src/documents.rs:6` and the documents migration comment.
- **`@soma/ui/yoopta` subpath export** (§164) does not exist.
- **CrateStack / `.cstack`** (§139-148, §327-344) is entirely unimplemented — no `.cstack` file
  anywhere, zero `cratestack` entries in `Cargo.toml` or `Cargo.lock`. Storage is SQLx with ten
  conventional migrations. The *relational shape* described is accurate (all 11 tables match);
  the *mechanism* has not been started.
- **Provider kinds** (§184) claims `agentd` + `openai-compatible`; only `openai-compatible`
  exists, and `soma-agentd` explicitly refuses model RPCs by design.
- **Port tables contradict each other**: the "Docker (server)" table is correct; the
  per-subcommand "Default listen addrs" lines (§226, §233) are stale.
- **Flags that don't exist**: `--db-path` (§14, §219) is `--db-url`; `--listen-addr` is
  `--listen-addrs`; `--data-dir` (§15-16) does not exist on `relay`/`rendezvous` — the data dir
  comes from `SOMA_DATA_DIR` only.
- **`somad bot` routes** (§213): `POST /v1/space/revoke` does not exist; the issuer paths are
  `/v1/spaces/issuer-capability/{issue,import}`.

## Note for whoever picks this up

`AGENTS.md` says "when this document says 'today', treat it as the *intended* behavior — verify
against the code if you need to make a load-bearing decision." That instruction is load-bearing
itself. Every false claim above was found by verifying; none by reading.

## Addendum: verification snapshot at end of this pass

Run from a clean tree, all commands real:

| Check | Result |
|---|---|
| `cargo check --workspace --all-targets` | 0 errors |
| `cargo clippy --workspace --all-targets -- -D warnings` | 0 errors (the new CI gate) |
| `cargo test --workspace` | 162 passing, 0 failing |
| `@soma/ui` / `@soma/editor` / `@soma/sdk` / `@soma/desktop-app` vitest | 77 / 41 / 32 / 42 — 192 passing |
| `typecheck` + `lint` (sdk, desktop-app) | clean |
| `build` (Tauri) + `build:web` | both succeed |
| `cargo check -p desktop-app --target aarch64-apple-ios` | ok |
| `cargo check -p desktop-app --target aarch64-linux-android` | ok |
| `docker compose -f compose.yml config` | exit 0 |
| `helm lint` + `helm template` | 15 objects render (was 0) |

Note on the clippy gate: enabling it surfaced violations in waves. Fixing `soma-core` let clippy
reach crates it had never linted (`soma-relay`, `soma-rendezvous`), and fixing those let it reach
`desktop-agent`, `desktop-daemon`, `soma-daemon`, and finally `desktop-app`. If you add a lint gate
to a workspace that never had one, expect to iterate — a clean run only proves the crates that
actually compiled.

One more gotcha worth remembering: `cargo check -p <crate>` and `cargo check --workspace` are
different oracles. `desktop-commands` had never compiled standalone — it uses `#[specta::specta]`
but declared plain `specta = { workspace = true }`, and only built because `tauri-specta` elsewhere
in the graph unified the `function` feature on. Now fixed, but worth checking members individually.
