# FR Code

**Free Router Code** — a desktop agent client built on [T3 Code](https://github.com/pingdotgg/t3code), driving [Pi Agent](https://github.com/pingdotgg/pi) as its single kernel.

> **This is a fork of T3 Code**, an MIT-licensed project by T3 Tools Inc. The upstream
> `LICENSE` is unmodified and still reads `Copyright (c) 2026 T3 Tools Inc.` All
> original work — the T3 orchestration engine, the Electron shell, the React UI, the
> provider adapters — remains theirs. See [Attribution](#attribution) for what is
> ours and what is theirs.

---

## What this fork changes

T3 Code is a control plane for many coding agents (Claude Code, Codex, Cursor, Grok,
OpenCode, Antigravity, plus an ACP registry). FR Code keeps that engine and UI intact
and changes two things: the identity, and the kernel.

### 1. Rebrand

| | Upstream | FR Code |
|---|---|---|
| Display name | T3 Code | FR Code |
| macOS bundle id | `com.t3tools.t3code` | `com.frcode.app` |
| URL scheme | `t3code://` | `frcode://` |
| Artifact name | `T3-Code-*.dmg` | `FR-Code-*.dmg` |

The bundle id change is what lets FR Code install alongside the official app instead of
replacing it. Verified: both run at once, on separate loopback ports.

Roughly 600 user-visible strings across `apps/web`, `apps/server` and `packages/*` were
renamed. Icon, UI wordmark, favicons, Icon Composer projects and the DMG artwork were
redrawn as well.

### 2. One kernel: Pi

`apps/server/src/provider/builtInDrivers.ts` registers exactly one driver:

```ts
export const BUILT_IN_DRIVERS: ReadonlyArray<AnyProviderDriver<BuiltInDriversEnv>> = [
  PiDriver,
];
```

`PiDriver` drives the user's own `pi` CLI over `--mode rpc` (line-delimited JSON on
stdio). It spawns an external process rather than importing a library, so **FR Code does
not pin a Pi version** — `pi update --self` is picked up on the next run.

This was deliberate on T3's part, and it carries over: the adapter spawns `pi` with no
`--no-*` flags, so your extensions, skills, prompt templates and context files load
exactly as they do in the Pi TUI, and sessions stay in your own `~/.pi/agent/sessions/`.

Verified against Pi 1.0.4: the RPC commands the adapter sends (`get_state`,
`get_available_models`, `prompt`, …) are all accepted.

The removed drivers' UI stays in the tree and degrades to the documented `"unavailable"`
shadow snapshot rather than crashing.

### Also

- `T3_PI_FIXTURE_MODEL` env override for the Pi replay fixtures, whose pinned
  `openrouter/...` slug only resolves for a Pi install configured against OpenRouter.
- The Linux/Windows packaging identity (binary name, `StartupWMClass`, AppStream and
  doc paths) was carried over from the rebrand so those targets stay consistent.

287 files changed, +673 / −669 across 7 commits on top of upstream `f4f148eb`.

---

## Build

T3 Code uses a Bun-style workspace with pnpm and Vite+ (`vp`) for orchestration.

```bash
pnpm install
curl -fsSL https://vite.plus | bash   # required: the global `vp` CLI
pnpm exec vp run dev:desktop         # run against a source checkout
pnpm exec vp run dist:desktop:dmg    # package a .dmg
```

Node `^22.16 || ^23.11 || >=24.10`.

### Two environment notes

Both of these bite on a fresh machine and neither is discoverable from the failure:

```bash
# 1. pnpm runs out of heap on this workspace (2200+ packages) and is killed
#    mid-install with "Ineffective mark-compacts near heap limit".
NODE_OPTIONS="--max-old-space-size=6144" pnpm install

# 2. electron-builder pulls a ~100 MB Electron dist straight from GitHub.
#    Behind a slow link that measured 192 KB/s — a 3 hour build that looks hung.
#    It is I/O bound, so 0% CPU with no output is the symptom, not a deadlock.
export ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
export ELECTRON_BUILDER_BINARIES_MIRROR="https://npmmirror.com/mirrors/electron-builder-binaries/"
```

On the mirror above the same download runs at 6.7 MB/s.

---

## Requirements at runtime

- macOS (the packaging identity was verified on arm64; the shell and UI are upstream's
  and are cross-platform, but only macOS was exercised here)
- Node 24 as an Electron runtime host is not needed — the app ships its own
- **Pi on `PATH`.** FR Code spawns `pi`, it does not bundle it:
  ```bash
  npm install -g @earendil-works/pi-coding-agent
  ```

---

## Known gaps

- **Unsigned.** No Developer ID signature or notarization. Gatekeeper will quarantine the
  DMG on another machine; `xattr -dr com.apple.quarantine` or right-click → Open works.
- **Shares `~/.t3` with an installed T3 Code.** Threads, projects and settings are
  shared, which is convenient but means the two can interfere. Set `T3CODE_HOME` to
  isolate.
- **`apps/mobile/` and `apps/marketing/` are unbranded.** They do not ship in the
  desktop build.
- **Filenames still say `t3`** (`assets/prod/t3-black-web-favicon-32x32.png`). Content is
  FR Code's; the names are referenced from `scripts/lib/brand-assets.ts` and were left
  alone to keep the fork mergeable.

---

## Attribution

**T3 Code** — Copyright (c) 2026 T3 Tools Inc. — MIT License. <https://github.com/pingdotgg/t3code>

The bulk of this repository is theirs: `apps/server` (274k lines, the orchestration
engine), `apps/web` (the UI), `apps/desktop` (the Electron shell), and `packages/*`
(74k lines of shared contracts and runtime). FR Code is a rebrand and a reduction of
the provider surface, not a fork of an idea.

**Pi Agent** — <https://github.com/pingdotgg/pi> — invoked as an external process over
its `--mode rpc` stdio protocol. No Pi source is vendored here.

**Claude/Free Router naming.** "Free Router Code" and "FR Code" are this fork's own
product name and have no relationship to T3 Tools Inc.

MIT permits all of this. Retain the upstream `LICENSE` file if you redistribute.

---

## Upstream

`origin` still points at `pingdotgg/t3code`, so upstream changes remain easy to pull:

```bash
git remote add upstream https://github.com/pingdotgg/t3code.git
git fetch upstream && git rebase upstream/main
```

The rebrand is deliberately mechanical (literal string replacement plus five identity
constants) and the provider change is confined to one file, so the fork has stayed easy
to rebase — but artwork binaries and the regenerated wordmark will conflict.