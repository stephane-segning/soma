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

### 1. ~~AI provider config per space~~ — DONE

Shipped as a scope-keyed `agent_provider_configs` table (`"default"` or a space id, every
overridable column nullable = inherit), resolved space → default → compiled-in on every agent
call. It lives in the **database, not the Tauri store**, because `desktop-bff` hardcoded
`StaticConfigSource(AgentRuntimeConfig::default())` and could never have read the store — so a
store-based design would have been desktop-only. Both binaries now share one source.

`backend.agent.config.{getDefault,getSpace,setDefault,setSpace,clearDefault,clearSpace,validate}`,
exposed through both presenters. UI at `/settings` → Assistant (default scope) and
`/spaces/:spaceId/settings` → Assistant (per-space), auto-saving on blur with on-blur endpoint
validation, per ADR-0005 §3.

**The API key is write-only.** Reads return `hasApiKey: boolean` and never the value; a test
serializes the whole DTO and scans for the secret. That closes the old finding where
`settings_get_all` handed the key to the renderer in cleartext on every call. It is still stored
in cleartext *at rest* — `AgentConfigRepository::{get, set_api_key}` are the only two methods that
touch it, so an OS-keychain `SecretStore` can replace those two bodies without changing any
caller. Deferred because `keyring` has no Android support and would break the mobile build.

Also shipped alongside: Members and Bots tabs on the same screen, which made the **join-approval
flow reachable for the first time** (`joinRequests`/`decideJoin` had zero UI callers), along with
`revokeMember`, `revokeBot` and real capability issuance against a pasted peer address.

### 2. ~~Invite UX~~ — DONE

Owner-signed `InviteState` encoded as `soma://invite/<base64url CBOR>`, verified **entirely
offline** before any network contact, so the confirmation screen is trustworthy. Single-use by
default with an atomic guarded-UPDATE replay check; a valid invite auto-approves at its own
stated role, matched only against a row the decider itself issued. Deep links now parse into a
typed route table instead of emitting a raw string into a `console.info`.

This also partly closes the TOFU gap: the pinned owner now comes from a signed artifact rather
than from whoever you happened to dial. What remains is (a) trusting the link reached you
untampered, inherent to any invite-link scheme, and (b) the requester's `InviteProof` signature
is not yet verified decider-side, because `PeerKeyResolver` is only populated by a prior Identify
exchange and nothing guarantees that completes before a `JoinRequest` lands.

Needed one proto change: identities here are ECDSA, and ECDSA peer ids do not embed the public
key the way small Ed25519 ones do, so offline verification had nowhere to get it. `CborSigned.
signer_public_key` is populated for `InviteState` only — membership/issuer/genesis signing sites
leave it empty and no existing verifier reads it.

### 3. ~~Space settings screen~~ — DONE (Members · Invites · Bots · Assistant)
`spaces/:spaceId/members` and `/info` are `Empty` placeholders; there is no
`spaces/:spaceId/settings` route. ADR-0005 §3 specifies the IA (General · Members · Assistant ·
Bots · Sharing · Danger, auto-save on blur, no global Save). Items 1, 2 and the bots UI all land
here.

### 4. ~~Shell hardening~~ — DONE (error boundaries, toasts mounted, /practice restored, window title, palette populated)
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

## Addendum 2: bugs found while building the settings screen

**A whole class of dead UI, one root cause.** Five components read the active space with
`useParams()` while being rendered as `AppLayout` *column props* — siblings of `<Outlet />`, not
descendants — so route params never reached them and the hook returned `{}`:

| Component | Consequence |
|---|---|
| `chat-panel` | every chat call lost its space context |
| `nav-panel` | navigation entries for the space never appeared |
| `bots-panel` | **never showed a single bot, for any space** |
| `pages-panel` | **never listed a single page** — permanently "Select a space" |
| `spaces-rail-container` | rail never highlighted the active space |

All five now use `parseActiveSpaceId(useLocation().pathname)`. When adding a component to an
`AppLayout` column, `useParams()` is always wrong; inside a real route component it is correct.

**Every struct-argument command was broken over HTTP.** The SDK calls `t.invoke(cmd, { args })`
because the JSON key must match the Tauri parameter name, but `httpTransport` forwarded that
envelope verbatim while every axum handler expects the struct flat — a 422 on `spaces.update`,
`spaces.create`, `spaces.join`, `spaces.decideJoin`, `spaces.revokeMember`, `agent.rerank`,
`documents.upsertDraft` and the blob staging calls. It went unnoticed because the earlier
end-to-end web test used `spaces_list` (no struct arg) and drove its mutation with raw `curl`,
bypassing the SDK. Fixed once in `httpTransport.invoke` with regression tests.

**`@soma/ui` is never linted by CI** and has 20 accumulated errors (a11y, exhaustive-deps).
Deliberately not bulk-fixed: `biome check --write` would strip `autoFocus` from the command
palette's search input — which is intentional and would break ⌘K — and auto-adding effect
dependencies risks render loops. This needs a deliberate pass, then a CI gate, in that order.
Adding the gate first would just land a red pipeline.

## Addendum 3: the end-to-end verification pass

Everything above was verified by running the app, not only by tests.

**Web** — built the bundle against a real `desktop-bff` and drove it in a browser: token
handshake and URL strip, page create → type → reload with content restored from SQLite, deep URL
surviving reload, window title tracking, the Members roster and join-approval queue, invite
create/copy/revoke, and both redemption paths. A link whose role was rewritten to Owner without
re-signing renders "signature doesn't verify", shows the claimed values under an explicit
"CLAIMED BY THE LINK — NOT VERIFIED" header, and offers no Join control at all.

**Per-space AI config** — proved at runtime rather than by inspection: one running process routed
`agent_list_models` to the space's own base URL when given a `spaceId`, and to the default scope's
when not.

**iOS** — create page → editor → typing, on device.

### What the run found that tests did not

- The daemon never started on iOS, from a comment-only edit to an already-applied migration. Tests
  all passed; a checksum mismatch only bites a database that already ran the old bytes.
- Every struct-argument command 422'd over HTTP (`{args}` envelope vs a flat body). The earlier
  "end-to-end web test" missed it by using a no-struct-arg command and driving its mutation with
  curl, bypassing the SDK.
- Five components read the active space with `useParams()` while rendered as `AppLayout` column
  props — siblings of `<Outlet />` — so `pages-panel` had never listed a page and `bots-panel` had
  never shown a bot.
- On the phone, the chip bar rendered on top of body copy, and the settings tab strip pushed tabs
  off-screen with no way to reach them.

None of these were catchable from test output. The common thread is that they live in the seams —
between transports, between a component and where it is mounted, between a file's bytes and a
checksum taken earlier.

## Still open

- **Android runtime is unverified.** It builds a valid APK (`aapt2` confirms arm64-v8a and the
  mDNS permissions) but no emulator was available to run it.
- **`@soma/ui` is never linted by CI** and carries ~20 accumulated errors. Deliberately not
  bulk-fixed: `biome check --write` would strip intentional `autoFocus` from the command palette
  and auto-add effect dependencies. Needs a deliberate pass, then a gate — in that order.
- **`CommandPalette` still self-binds `mod+k`** in addition to the app's shortcut registry.
  Harmless today only because `onOpen` is never passed; a latent double-fire if anyone passes it.
  The registry should be the single owner.
- **Page titles stay "Untitled"** regardless of the first heading — the plan-02 follow-up.
- **iOS header scrolls above the status bar** when the keyboard opens.
- `backend.search` is still a stub returning `[]`; the palette deliberately does not call it.
