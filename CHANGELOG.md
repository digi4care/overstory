# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.7.0] - 2026-02-25

### Added

#### AgentRuntime Abstraction Layer
- **`src/runtimes/types.ts`** — `AgentRuntime` interface defining the contract for multi-provider agent support: `buildSpawnCommand()`, `buildPrintCommand()`, `deployConfig()`, `detectReady()`, `parseTranscript()`, `buildEnv()`, plus supporting types (`SpawnOpts`, `ReadyState`, `OverlayContent`, `HooksDef`, `TranscriptSummary`)
- **`src/runtimes/claude.ts`** — `ClaudeRuntime` adapter implementing `AgentRuntime` for Claude Code CLI — delegates to existing subsystems (hooks-deployer, transcript parser) without new behavior
- **`src/runtimes/registry.ts`** — Runtime registry with `getRuntime()` factory — lookup by name, config default, or hardcoded "claude" fallback
- **`docs/runtime-abstraction.md`** — Design document covering coupling inventory, phased migration plan, and adapter contract rationale
- **`--runtime <name>` flag** on `ov sling` — allows per-agent runtime override (defaults to config or "claude")
- **`runtime.default` config field** — new optional `OverstoryConfig.runtime.default` property for setting the default runtime adapter

#### Testing
- **`src/runtimes/claude.test.ts`** — 616-line test suite for ClaudeRuntime adapter covering all 7 interface methods
- **`src/runtimes/registry.test.ts`** — Registry tests for name lookup, config default fallback, and unknown runtime errors
- **`src/commands/sling.test.ts`** — Additional sling tests for runtime integration
- **`src/agents/overlay.test.ts`** — Tests for parameterized `instructionPath` in `writeOverlay()`
- 2357 tests across 81 files (5857 `expect()` calls)

### Changed

#### Runtime Rewiring (Phase 2)
- **`src/commands/sling.ts`** — Rewired to use `AgentRuntime.buildSpawnCommand()` and `detectReady()` instead of hardcoded `claude` CLI construction and TUI heuristics
- **`src/commands/coordinator.ts`** — Rewired to use `AgentRuntime` for spawn command building, env construction, and TUI readiness detection
- **`src/commands/supervisor.ts`** — Rewired to use `AgentRuntime` for spawn command building and TUI readiness detection
- **`src/commands/monitor.ts`** — Rewired to use `AgentRuntime` for spawn command building and env construction
- **`src/worktree/tmux.ts`** — `waitForTuiReady()` now accepts a `detectReady` callback instead of hardcoded Claude Code TUI heuristics, making it runtime-agnostic
- **`src/agents/overlay.ts`** — `writeOverlay()` now accepts an optional `instructionPath` parameter (default: `.claude/CLAUDE.md`), enabling runtime-specific instruction file paths

#### Branding
- README.md: replaced ASCII ecosystem diagram with os-eco logo image

## [0.6.12] - 2026-02-25

### Added

#### Shared Visual Primitives
- **`src/logging/theme.ts`** — canonical visual theme for CLI output: agent state colors/icons, event type labels (compact + full), agent color palette for multi-agent displays, separator characters, and header/sub-header rendering helpers
- **`src/logging/format.ts`** — shared formatting utilities: duration formatting (`formatDuration`), absolute/relative/date timestamp formatting, event detail builder (`buildEventDetail`), agent color mapping (`buildAgentColorMap`/`extendAgentColorMap`), status color helpers for merge/priority/log-level

#### Theme/Format Adoption Across Observability Commands
- Dashboard, status, inspect, metrics, run, and costs commands refactored to use shared theme/format primitives — eliminates duplicated color maps, duration formatters, and separator rendering across 6 commands
- Errors, feed, logs, replay, and trace commands refactored to use shared theme/format primitives — eliminates duplicated event label rendering, timestamp formatting, and agent color assignment across 5 commands
- Net code reduction: ~826 lines removed, replaced by ~214+132 lines of shared primitives

#### Mulch Programmatic API Migration
- `MulchClient.record()`, `search()`, and `query()` migrated from `Bun.spawn` CLI wrappers to `@os-eco/mulch-cli` programmatic API — eliminates subprocess overhead for high-frequency expertise operations
- **`@os-eco/mulch-cli` added as runtime dependency** (^0.6.2) — first programmatic API dependency in the ecosystem
- Variable-based dynamic import pattern (`const MULCH_PKG = "..."; import(MULCH_PKG)`) prevents tsc from statically resolving into mulch's raw `.ts` source files
- Local `MulchExpertiseRecord` and `MulchProgrammaticApi` type definitions avoid cross-project `noUncheckedIndexedAccess` conflicts

#### MetricsStore Improvements
- **`countSessions()`** method — returns total session count without the `LIMIT` cap that `getRecentSessions()` applies, fixing accurate session count reporting in metrics views

#### Lead Agent Workflow Improvements
- **`WORKTREE_ISSUE_CREATE` failure mode** — prevents leads from running `{{TRACKER_CLI}} create` in worktrees, where issues are lost on cleanup
- Lead workflow updated to **mail coordinator for issue creation** instead of direct tracker CLI calls — coordinator creates issues on main branch
- Scout/builder/reviewer spawning simplified with `--skip-task-check` — removes the pattern of creating separate tracker issues for each sub-agent
- `{{TRACKER_CLI}} create` removed from lead capabilities list

#### Testing
- Test suite grew from 2283 to 2288 tests across 79 files (5744 expect() calls)

### Changed
- 12 observability commands consolidated onto shared `theme.ts` + `format.ts` primitives — reduces per-command boilerplate and ensures visual consistency across all CLI output
- `@types/js-yaml` added as dev dependency (^4.0.9)

### Fixed
- Static imports of `theme.ts`/`format.ts` replaced with variable-based dynamic pattern to fix typecheck errors when tsc follows into mulch's raw `.ts` source files
- `getRecentSessions()` limit cap no longer affects session count reporting — dedicated `countSessions()` method provides uncapped counts

## [0.6.11] - 2026-02-25

### Added

#### Per-Lead Agent Budget Ceiling
- **`agents.maxAgentsPerLead` config** (default: 5) — limits how many active children a single lead agent can spawn; set to 0 for unlimited
- **`--max-agents <n>` flag on `ov sling`** — CLI override for the per-lead ceiling when spawning under a parent
- **`checkParentAgentLimit()`** — pure-function guard that counts active children per parent and blocks spawns at the limit

#### Dispatch-Level Overrides
- **`--skip-review` flag on `ov sling`** — instructs a lead agent to skip Phase 3 review and self-verify instead (reads builder diff + runs quality gates)
- **`--dispatch-max-agents <n>` flag on `ov sling`** — per-lead agent ceiling override injected into the overlay so the lead knows its budget
- **`formatDispatchOverrides()`** in overlay system — generates a `## Dispatch Overrides` section in lead overlays when `skipReview` or `maxAgentsOverride` are set
- **`dispatch-overrides` section in `agents/lead.md`** — documents the override protocol so leads know to check their overlay before following the default three-phase workflow
- **`DispatchPayload` extended** with `skipScouts`, `skipReview`, and `maxAgents` optional fields

#### Duplicate Lead Prevention
- **`checkDuplicateLead()`** — prevents two lead agents from concurrently working the same task ID, avoiding the duplicate work stream anti-pattern (overstory-gktc postmortem)

#### Mail Refactoring
- **`shouldAutoNudge()` and `isDispatchNudge()`** exported from mail.ts for testability — previously inlined logic now unit-testable
- **`AUTO_NUDGE_TYPES`** exported as `ReadonlySet` for direct test assertions

#### Testing
- **`sling.test.ts`** — expanded (201 lines added) covering `checkDuplicateLead`, `checkParentAgentLimit`, per-lead budget ceiling enforcement, and dispatch override validation
- **`overlay.test.ts`** — expanded (236 lines added) covering `formatDispatchOverrides`, skip-review overlay, max-agents overlay, and combined overrides
- **`mail.test.ts`** — expanded (64 lines added) covering `shouldAutoNudge`, `isDispatchNudge`, and dispatch nudge behavior
- **`hooks-deployer.test.ts`** — new test file (105 lines) covering hooks deployment and configurable safe prefix extraction
- **`config.test.ts`** — expanded (22 lines added) covering `maxAgentsPerLead` validation

### Changed

- **Terminology normalization** — replaced "beads" with "task" throughout CLI copy and generic code: `checkBeadLock` → `checkTaskLock`, `{{BEAD_ID}}` → `{{TASK_ID}}` in overlay template, error messages updated ("Bead is already being worked" → "Task is already being worked")
- **README unified** to canonical os-eco template — shortened, restructured with table-based CLI reference, consistent badge style
- **`agents/lead.md`** — added `dispatch-overrides` section documenting SKIP REVIEW and MAX AGENTS override protocol
- **Default tracker name** changed from `"beads"` to `"seeds"` in overlay fallback

### Fixed

- **`ov trace` description** — changed from "agent/bead" to "agent or task" for consistency with terminology normalization

### Testing
- 2283 tests across 79 files (5749 `expect()` calls)

## [0.6.10] - 2026-02-25

### Added

#### New CLI Commands
- **`ov ecosystem`** — dashboard showing all installed os-eco tools (overstory, mulch, seeds, canopy) with version info, update status (current vs latest from npm), and overstory doctor health summary; supports `--json` output
- **`ov upgrade`** — upgrade overstory (or all ecosystem tools with `--all`) to their latest npm versions via `bun install -g`; `--check` flag compares versions without installing; supports `--json` output

#### `ov doctor` Enhancements
- **`--fix` flag** — auto-fix capability for doctor checks; fixable checks now include repair closures that are executed when `--fix` is passed, with human-readable action summaries
- **Fix closures added to all check modules** — structure, databases, merge-queue, and ecosystem checks now return fix functions that can recreate missing directories, reinitialize databases, and reinstall tools
- **`ecosystem` check category** — new 10th doctor category validating that os-eco CLI tools (ml, sd, cn) are on PATH and report valid semver versions; fix closures reinstall via `bun install -g`

#### Global CLI Flag
- **`--timing` flag** — prints command execution time to stderr after any command completes (e.g., `Done in 42ms`)

#### Configurable Quality Gates
- **Quality gate placeholders in agent prompts** — agent base definitions (builder, merger, reviewer, lead) now use `{{QUALITY_GATE_*}}` placeholders instead of hardcoded `bun test`/`bun run lint`/`bun run typecheck` commands, driven by `project.qualityGates` config
- **4 quality gate formatter functions** — `formatQualityGatesInline`, `formatQualityGateSteps`, `formatQualityGateBash`, `formatQualityGateCapabilities` added to overlay system for flexible placeholder resolution
- **Configurable safe command prefixes** — `SAFE_BASH_PREFIXES` in hooks-deployer now dynamically extracted from quality gate config via `extractQualityGatePrefixes()`, replacing hardcoded `bun test`/`bun run lint`/`bun run typecheck` entries
- **Config-driven hooks deployment** — `sling.ts` now passes `config.project.qualityGates` through to `deployHooks()` so non-implementation agents can run project-specific quality gate commands

#### Testing
- **`ecosystem.test.ts`** — new test file (307 lines) covering ecosystem command output, JSON mode, and tool detection
- **`upgrade.test.ts`** — new test file (46 lines) covering upgrade command registration and option parsing
- **`databases.test.ts`** — new test file (38 lines) covering database health check fix closures
- **`merge-queue.test.ts`** — new test file (98 lines) covering merge queue health check and fix closures
- **`structure.test.ts`** — expanded (131 lines added) covering structure check fix closures for missing directories
- **`overlay.test.ts`** — expanded (157 lines added) covering quality gate formatters and placeholder resolution
- **`hooks-deployer.test.ts`** — expanded (52 lines added) covering configurable safe prefix extraction

### Changed

- **Agent base definitions updated** — builder, merger, reviewer, and lead `.md` files now use `{{QUALITY_GATE_*}}` template placeholders instead of hardcoded bun commands
- **`DEFAULT_QUALITY_GATES` consolidated** — removed duplicate definition from `overlay.ts`, now imported from `config.ts` as single source of truth

### Fixed

- **`DoctorCheck.fix` return type** — changed from `void` to `string[]` so fix closures can report what actions were taken
- **Feed follow-mode `--json` output** — now uses `jsonOutput` envelope instead of raw `JSON.stringify`
- **`--timing` preAction** — correctly reads `opts.timing` from global options instead of hardcoded check
- **`process.exit(1)` in completions.ts** — replaced with `process.exitCode = 1; return` to avoid abrupt process termination

### Testing
- 2241 tests across 79 files (5694 `expect()` calls)

## [0.6.9] - 2026-02-25

### Added

#### `ov init` Enhancements
- **`--yes` / `-y` flag** — skip interactive confirmation prompts for scripted/automated initialization (contributed by @lucabarak via PR #37)
- **`--name <name>` flag** — explicitly set the project name instead of auto-detecting from git remote or directory name

#### Standardized JSON Output Across All Commands
- **JSON envelope applied to all remaining commands** — four batches (A, B, C, D) migrated every `--json` code path to use the `jsonOutput()`/`jsonError()` envelope format (`{ success, command, ...data }`), completing the ecosystem-wide standardization started in 0.6.8

#### Accented ID Formatting
- **`accent()` applied to IDs in human-readable output** — agent names, mail IDs, group IDs, run IDs, and task IDs now render with accent color formatting across status, dashboard, inspect, agents, mail, merge, group, run, trace, and errors commands

#### Testing
- **`hooks-deployer.test.ts`** — new test file (180 lines) covering hooks deployment to worktrees
- **`init.test.ts`** — new test file (104 lines) covering `--yes` and `--name` flag behavior

### Changed

#### Print Helper Adoption
- **Completions, prime, and watch commands migrated to print helpers** — remaining commands that used raw `console.log`/`console.error` now use `printSuccess`/`printWarning`/`printError`/`printHint` for consistent output formatting

### Fixed

- **PATH prefix for hook commands** — deployed hooks now include `~/.bun/bin` in the PATH prefix, fixing resolution failures when bun-installed CLIs (like `ov` itself) weren't found by hook subprocesses
- **Reinit messaging for `--yes` flag** — corrected output messages when re-initializing an existing `.overstory/` directory with the `--yes` flag

### Testing
- 2186 tests across 77 files (5535 `expect()` calls)

## [0.6.8] - 2026-02-25

### Added

#### Standardized CLI Output Helpers
- **`jsonOutput()` / `jsonError()` helpers** (`src/json.ts`) — standard JSON envelope format (`{ success, command, ...data }`) matching the ecosystem convention used by mulch, seeds, and canopy
- **`printSuccess()` / `printWarning()` / `printError()` / `printHint()` helpers** (`src/logging/color.ts`) — branded message formatters with consistent color/icon treatment (brand checkmark, yellow `!`, red cross, dim indent)

#### Enhanced CLI Help & Error Experience
- **Custom branded help screen** — `ov --help` now shows a styled layout with colored command names, dim arguments, and version header instead of Commander.js defaults
- **`--version --json` flag** — `ov -v --json` outputs machine-readable JSON (`{ name, version, runtime, platform }`)
- **Unknown command fuzzy matching** — typos like `ov stauts` now suggest the closest match via Levenshtein edit distance ("Did you mean 'status'?")

#### TUI Trust Dialog Handling
- **Auto-confirm workspace trust dialog** — `waitForTuiReady` now detects "trust this folder" prompts and sends Enter automatically, preventing agents from stalling on first-time workspace access

### Changed

#### Consistent Message Formatting Across All Commands
- **All 30 commands migrated to message helpers** — three batches (A, B, C) updated every command to use `printSuccess`/`printWarning`/`printError`/`printHint` instead of ad-hoc `console.log`/`console.error` calls, ensuring uniform output style
- **Global error handler uses `jsonError()`** — top-level catch in `index.ts` now outputs structured JSON envelopes when `--json` is passed, instead of raw `console.error`

#### TUI Readiness Detection
- **Two-phase readiness check** — `waitForTuiReady` now requires both a prompt indicator (`❯` or `Try "`) AND status bar text (`bypass permissions` or `shift+tab`) before declaring the TUI ready, preventing premature beacon submission

#### Agent Definition Cleanup
- **Slash-command prompts moved to `.claude/commands/`** — `issue-reviews.md`, `pr-reviews.md`, `prioritize.md`, and `release.md` removed from `agents/` directory (they are skill definitions, not agent base definitions)
- **Agent definition wording updates** — minor reference fixes across coordinator, lead, merger, reviewer, scout, and supervisor base definitions

### Fixed

- **`color.test.ts` mocking** — tests now mock `process.stdout.write`/`process.stderr.write` instead of `console.log`/`console.error` to match actual implementation
- **`mulch client test`** updated for auto-create domain behavior
- **`mulch` → `ml` alias in tests** — test files migrated to use the `ml` short alias consistently

### Testing
- 2167 tests across 77 files (5465 `expect()` calls)

## [0.6.7] - 2026-02-25

### Fixed

#### Permission Flag Migration
- **Replace `--dangerously-skip-permissions` with `--permission-mode bypassPermissions`** across all agent spawn paths (coordinator, supervisor, sling, monitor) — adapts to updated Claude Code CLI flag naming

#### Status Output
- **Remove remaining emoji from `ov status` output** — section headers (Agents, Worktrees, Mail, Merge queue, Sessions recorded) and deprecation warning now use plain text; alive markers use colored `>`/`x` instead of `●`/`○`

### Changed

#### Agent Spawn Reliability
- **Increase TUI readiness timeout from 15s to 30s** — `waitForTuiReady` now waits longer for Claude Code TUI to initialize, reducing false-negative timeouts on slower machines
- **Smarter TUI readiness detection** — `waitForTuiReady` now checks for actual TUI markers (`❯` prompt or `Try "` text) instead of any pane content, preventing premature readiness signals
- **Extend follow-up Enter delays** — beacon submission retries expanded from `[1s, 2s]` to `[1s, 2s, 3s, 5s]` in sling, coordinator, and supervisor, improving reliability when Claude Code TUI initializes slowly

### Testing
- 2151 tests across 76 files (5424 `expect()` calls)

## [0.6.6] - 2026-02-24

### Changed

#### CLI Alias Migration
- **`overstory` → `ov` across all CLI-facing text** — every user-facing string, error message, help text, and command comment across all `src/commands/*.ts` files now references `ov` instead of `overstory`
- **`mulch` → `ml` in agent definitions and overlay** — all 8 base agent definitions (`agents/*.md`), overlay template (`templates/overlay.md.tmpl`), and overlay generator (`src/agents/overlay.ts`) updated to use the `ml` short alias
- **Templates and hooks updated** — `templates/CLAUDE.md.tmpl`, `templates/hooks.json.tmpl`, and deployed agent defs all reference `ov`/`ml` aliases
- **Canopy prompts re-emitted** — all canopy-managed prompts regenerated with alias-aware content

#### Emoji-Free CLI Output (Set D Icons)
- **Status icons replaced with ASCII Set D** — dashboard, status, and sling output now use `>` (working), `-` (booting), `!` (stalled), `x` (zombie/completed), `?` (unknown) instead of Unicode circles and checkmarks
- **All emoji removed from CLI output** — warning prefixes, launch messages, and status indicators no longer use emoji characters, improving compatibility with terminals that lack Unicode support

### Added

#### Sling Reliability
- **Auto-dispatch mail before tmux session** — `buildAutoDispatch()` sends dispatch mail to the agent's mailbox before creating the tmux session, eliminating the race where coordinator dispatch arrives after the agent boots and sits idle
- **Beacon verification loop** — after beacon send, sling polls the tmux pane up to 5 times (2s intervals) to detect if the agent is still on the welcome screen; if so, resends the beacon automatically (fixes overstory-3271)
- **`capturePaneContent()` exported from tmux.ts** — new helper for reading tmux pane text, used by beacon verification

#### Binary Detection
- **`detectOverstoryBinDir()` tries both `ov` and `overstory`** — loops through both command names when resolving the binary directory, ensuring compatibility regardless of how the tool was installed

#### Claude Code Skills
- **`/release` skill** — prepares releases by analyzing changes, bumping versions, updating CHANGELOG/README/CLAUDE.md
- **`/issue-reviews` skill** — reviews GitHub issues from within Claude Code
- **`/pr-reviews` skill** — reviews GitHub pull requests from within Claude Code

#### Testing
- Test suite: 2151 tests across 76 files (5424 expect() calls)

### Fixed
- **Mail dispatch race for newly slung agents** — dispatch mail is now written to SQLite before tmux session creation, ensuring it exists when the agent's SessionStart hook fires `ov mail check`
- **`process.exit(1)` replaced with `process.exitCode = 1`** — CLI entry point no longer calls `process.exit()` directly, allowing Bun to clean up gracefully (async handlers, open file descriptors)
- **Remaining `beadId` → `taskId` references** — completed rename in `trace.ts`, `trace.test.ts`, `spec.ts`, `worktree.test.ts`, and canopy prompts for coordinator/supervisor
- **Post-merge quality gate failures** — fixed lint and type errors introduced during multi-agent merge sessions
- **Mail test assertions** — updated to match lowercase Warning/Note output after emoji removal

## [0.6.5] - 2026-02-24

### Added

#### Seeds Preservation for Lead Branches
- **`preserveSeedsChanges()` in worktree manager** — extracts `.seeds/` diffs from lead agent branches and applies them to the canonical branch via patch before worktree cleanup, preventing loss of issue files created by leads whose branches are never merged through the normal merge pipeline
- Integrated into `overstory worktree clean` — automatically preserves seeds changes before removing completed worktrees

#### Merge Union Gitattribute Support
- **`resolveConflictsUnion()` in merge resolver** — new auto-resolve strategy for files with `merge=union` gitattribute that keeps all lines from both sides (canonical + incoming), relying on dedup-on-read to handle duplicates
- **`checkMergeUnion()` helper** — queries `git check-attr merge` to detect union merge strategy per file
- Auto-resolve tier now checks gitattributes before choosing between keep-incoming and union resolution strategies

#### Sling Preflight
- **`ensureTmuxAvailable()` preflight in sling command** — verifies tmux is available before attempting session creation, providing a clear error instead of cryptic spawn failures

#### Testing
- Test suite: 2145 tests across 76 files (5410 expect() calls)

### Changed
- **`beadId` → `taskId` rename across all TypeScript source** — comprehensive rename of the `beadId` field to `taskId` in all source files, types, interfaces, and tests, completing the tracker abstraction naming migration started in v0.6.0
- **`gatherStatus()` uses `evaluateHealth()`** — status command now applies the full health evaluation from the watchdog module for agent state reconciliation, matching dashboard and watchdog behavior (handles tmux-dead→zombie, persistent capability booting→working, and time-based stale/zombie detection)

### Fixed
- **Single quote escaping in blockGuard shell commands** — fixed shell escaping in blockGuard patterns that could cause guard failures when arguments contained single quotes
- **Dashboard version from package.json** — dashboard now reads version dynamically from `package.json` instead of a hardcoded value
- **Seeds config project name** — renamed project from "seeds" to "overstory" in `.seeds/config.yaml` and fixed 71 misnamed issue IDs

## [0.6.4] - 2026-02-24

### Added

#### Commander.js CLI Framework
- **Full CLI migration to Commander.js** — all 30+ commands migrated from custom `args` array parsing to Commander.js with typed options, subcommand hierarchy, and auto-generated `--help`; migration completed in 6 incremental commits covering core workflow, nudge, mail, observability, infrastructure, and final cleanup
- **Shell completions via Commander** — `createCompletionsCommand()` now uses Commander's built-in completion infrastructure

#### Chalk v5 Color System
- **Chalk-based color module** — `src/logging/color.ts` rewritten from custom ANSI escape code strings to Chalk v5 wrapper functions with native `NO_COLOR`/`FORCE_COLOR`/`TERM=dumb` support
- **Brand palette** — three named brand colors exported: `brand` (forest green), `accent` (amber), `muted` (stone gray) via `chalk.rgb()`
- **Chainable color API** — `color.bold`, `color.dim`, `color.red`, etc. now delegate to Chalk for composable styling

#### Testing
- Merge queue SQL schema consistency tests added
- Test suite: 2128 tests across 76 files (5360 expect() calls)

### Changed
- **Runtime dependencies** — chalk v5 added as first runtime dependency (previously zero runtime deps); chalk is ESM-only and handles color detection natively
- **CLI parsing** — all commands converted from manual `args` array indexing to Commander.js `.option()` / `.argument()` declarations with automatic type coercion and validation
- **Color module API** — `color` export changed from a record of ANSI string constants to a record of Chalk wrapper functions; consumers call `color.red("text")` (function) instead of `${color.red}text${color.reset}` (string interpolation)
- **`noColor` identity function** — replaces the old `color.white` default for cases where no coloring is needed

### Fixed
- **Merge queue migration** — added missing `bead_id` → `task_id` column migration for `merge-queue.db`, aligning with the schema migration already applied to sessions.db, events.db, and metrics.db in v0.6.0
- **npm publish auth** — fixed authentication issues in publish workflow and cleaned up post-merge artifacts from Commander migration
- **Commander direct parse** — fixed 6 command wrapper functions that incorrectly delegated to Commander instead of using direct `.action()` pattern (metrics, replay, status, trace, supervisor, and others)

## [0.6.3] - 2026-02-24

### Added

#### Interactive Tool Blocking for Agents
- **PreToolUse guards block interactive tools** — `AskUserQuestion`, `EnterPlanMode`, and `EnterWorktree` are now blocked for all overstory agents via hooks-deployer, preventing indefinite hangs in non-interactive tmux sessions; agents must use `overstory mail --type question` to escalate instead

#### Doctor Ecosystem CLI Checks
- **Expanded `overstory doctor` dependency checks** — now validates all ecosystem CLIs (overstory, mulch, seeds, canopy) with alias availability checks (`ov`, `ml`) and install hints (`npm install -g @os-eco/<pkg>`)
- Short alias detection: when a primary tool passes, doctor also checks if its short alias (e.g., `ov` for `overstory`, `ml` for `mulch`) is available, with actionable fix hints

#### CLI Improvements
- **`ov` short alias** — `overstory` CLI is now also available as `ov` via `package.json` bin entry
- **`/prioritize` skill** — new Claude Code command that analyzes open GitHub Issues and Seeds issues, cross-references with codebase health, and recommends the top ~5 issues to tackle next
- **Skill headers** — all Claude Code slash commands now include descriptive headers for better discoverability

#### CI/CD
- **Publish workflow** — replaced `auto-tag.yml` with `publish.yml` that runs quality gates, checks version against npm, publishes with provenance, creates git tags and GitHub releases automatically

#### Performance
- **`SessionStore.count()`** — lightweight `SELECT COUNT(*)` method replacing `getAll().length` pattern in `openSessionStore()` existence checks

#### Testing
- Test suite grew from 2090 to 2137 tests across 76 files (5370 expect() calls)
- SQL schema consistency tests for all four SQLite stores (sessions.db, mail.db, events.db, metrics.db)
- Provider config and model resolution edge case tests
- Sling provider environment variable injection building block tests

### Fixed
- **Tmux dead session detection in `waitForTuiReady()`** — now checks `isSessionAlive()` on each poll iteration and returns early if the session died, preventing 15-second timeout waits on already-dead sessions
- **`ensureTmuxAvailable()` guard** — new pre-flight check throws a clear `AgentError` when tmux is not installed, replacing cryptic spawn failures
- **`package.json` files array** — reformatted for Biome compatibility

### Changed
- **CI workflow**: `auto-tag.yml` replaced by `publish.yml` with npm publish, provenance, and GitHub release creation
- Config field references updated: `beads` → `taskTracker` in remaining locations

## [0.6.2] - 2026-02-24

### Added

#### Sling Guard Improvements
- **`--skip-task-check` flag for `overstory sling`** — skips task existence validation and issue claiming, designed for leads spawning builders with worktree-created issues that don't exist in the canonical tracker yet
- **Bead lock parent bypass** — parent agent can now delegate its own task ID to a child without triggering the concurrent-work lock (sling allows spawn when the lock holder matches `--parent`)
- Lead agent `--skip-task-check` added to default sling template in `agents/lead.md`

#### Lead Agent Spec Writing
- Leads now use `overstory spec write <id> --body "..." --agent $OVERSTORY_AGENT_NAME` instead of Write/Edit tools for creating spec files — enforces read-only tool posture while still enabling spec creation

#### Testing
- Test suite grew from 2087 to 2090 tests across 75 files (5137 expect() calls)

### Fixed
- **Dashboard health evaluation** — dashboard now applies the full `evaluateHealth()` function from the watchdog module instead of only checking tmux liveness; correctly transitions persistent capabilities (coordinator, monitor) from `booting` → `working` when tmux is alive, and detects stale/zombie states using configured thresholds
- **Default tracker resolution to seeds** — `resolveBackend()` now falls back to `"seeds"` when no tracker directory exists (previously defaulted to `"beads"`)
- **Coordinator beacon uses `resolveBackend()`** — properly resolves `"auto"` backend instead of a simple conditional that didn't handle auto-detection
- **Doctor dependency checks use `resolveBackend()`** — properly resolves `"auto"` backend for tracker CLI availability checks instead of assuming beads
- **Hardcoded 'orchestrator' replaced with 'coordinator'** — overlay template default parent address, agent definitions (builder, merger, monitor, scout), and test assertions all updated to use `coordinator` as the default parent/mail recipient

### Changed
- Lead agent definition: Write/Edit tools removed from capabilities, replaced with `overstory spec write` CLI command
- Agent definitions (builder, merger, monitor, scout) updated to reference "coordinator" instead of "orchestrator" in mail examples and constraints

## [0.6.1] - 2026-02-23

### Added

#### Canopy Integration for Agent Prompt Management
- All 8 agent definitions (`agents/*.md`) restructured for Canopy prompt composition — behavioral sections (`propulsion-principle`, `cost-awareness`, `failure-modes`, `overlay`, `constraints`, `communication-protocol`, `completion-protocol`) moved to the top of each file with kebab-case headers, core content sections (`intro`, `role`, `capabilities`, `workflow`) placed after
- Section headers converted from Title Case (`## Role`) to kebab-case (`## role`) across all agent definitions for Canopy schema compatibility

#### Hooks Deployer Merge Behavior
- `deployHooks()` now preserves existing `settings.local.json` content when deploying hooks — merges with non-hooks keys (permissions, env, `$schema`, etc.) instead of overwriting the entire file
- `isOverstoryHookEntry()` exported for detecting overstory-managed hook entries — enables stripping stale overstory hooks while preserving user-defined hooks
- Overstory hooks placed before user hooks per event type so security guards always run first

#### Testing
- Test suite grew from 2075 to 2087 tests across 75 files (5150 expect() calls)

### Changed
- **Dogfooding tracker migrated from beads to seeds** — `.beads/` directory removed, `.seeds/` directory added with all issues migrated
- Biome ignore pattern updated: `.beads/` → `.seeds/`

### Fixed
- `deployHooks()` no longer overwrites existing `settings.local.json` — previously deploying hooks for coordinator/supervisor/monitor agents at the project root would destroy any existing settings (permissions, user hooks, env vars)

## [0.6.0] - 2026-02-23

### Added

#### Tracker Abstraction Layer
- **`src/tracker/` module** — pluggable task tracker backend system replacing the hardcoded beads dependency
  - `TrackerClient` interface with unified API: `ready()`, `show()`, `create()`, `claim()`, `close()`, `list()`, `sync()`
  - `TrackerIssue` type for backend-agnostic issue representation
  - `createTrackerClient()` factory function dispatching to concrete backends
  - `resolveBackend()` auto-detection — probes `.seeds/` then `.beads/` directories when configured as `"auto"`
  - `trackerCliName()` helper returning `"sd"` or `"bd"` based on resolved backend
  - Beads adapter (`src/tracker/beads.ts`) — wraps `bd` CLI with `--json` parsing
  - Seeds adapter (`src/tracker/seeds.ts`) — wraps `sd` CLI with `--json` parsing
  - Factory tests (`src/tracker/factory.test.ts`) — 80 lines covering resolution and client creation

#### Configurable Quality Gates
- `QualityGate` type (`{ name, command, description }`) in `types.ts` — replaces hardcoded `bun test && bun run lint && bun run typecheck`
- `project.qualityGates` config field — projects can now define custom quality gate commands in `config.yaml`
- `DEFAULT_QUALITY_GATES` constant in `config.ts` — preserves the default 3-gate pipeline (Tests, Lint, Typecheck)
- Quality gate validation in `validateConfig()` — ensures each gate has non-empty `name`, `command`, and `description`
- Overlay template renders configured gates dynamically instead of hardcoded commands
- `OverlayConfig.qualityGates` field threads gates from config through to agent overlays

#### Config Migration for Task Tracker
- `taskTracker: { backend, enabled }` config field replaces legacy `beads:` and `seeds:` sections
- Automatic migration: `beads: { enabled: true }` → `taskTracker: { backend: "beads", enabled: true }` (and same for `seeds:`)
- `TaskTrackerBackend` type: `"auto" | "beads" | "seeds"` with `"auto"` as default
- Deprecation warnings emitted when legacy config keys are detected

#### Template & Agent Definition Updates
- `TRACKER_CLI` and `TRACKER_NAME` template variables in overlay.ts — agent defs no longer hardcode `bd`/`beads`
- All 8 agent definitions (`agents/*.md`) updated: `bd` → `TRACKER_CLI`, `beads` → `TRACKER_NAME`
- Coordinator beacon updated with tracker-aware context
- Hooks-deployer safe prefixes updated for tracker CLI commands

#### Hooks Improvements
- `mergeHooksByEventType()` — `overstory hooks install --force` now merges hooks per event type with deduplication instead of wholesale replacement, preserving user-added hooks

#### Testing
- Test suite grew from 2026 to 2075 tests across 75 files (5128 expect() calls)

### Changed
- **beads → taskTracker config**: `config.beads` renamed to `config.taskTracker` with backward-compatible migration
- **bead_id → task_id**: Column renamed across all SQLite schemas (metrics.db, merge-queue.db, sessions.db, events.db) with automatic migration for existing databases
- `group.ts` and `supervisor.ts` now use tracker abstraction instead of direct beads client calls
- `sling.ts` uses `resolveBackend()` and `trackerCliName()` from factory module
- Doctor dependency checks updated to detect the active tracker CLI (`bd` or `sd`)

### Fixed
- `overstory hooks install --force` now merges hooks by event type instead of replacing the entire settings file — preserves non-overstory hooks
- `detectCanonicalBranch()` now accepts any branch name (removed restrictive regex)
- `bead_id` → `task_id` SQLite column migration for existing databases (metrics, merge-queue, sessions, events)
- `config.seeds` → `config.taskTracker` bootstrap path in `sling.ts`
- `group.ts` and `supervisor.ts` now use `resolveBackend()` for proper tracker resolution instead of hardcoded backend
- Seeds adapter validates envelope `success` field before unwrapping response data
- Hooks tests use literal keys instead of string indexing for `noUncheckedIndexedAccess` compliance
- Removed old `src/beads/` directory (replaced by `src/tracker/`)

## [0.5.9] - 2026-02-21

### Added

#### New CLI Commands
- `overstory stop <agent-name>` — explicitly terminate a running agent by killing its tmux session, marking the session as completed in SessionStore, with optional `--clean-worktree` to remove the agent's worktree (17 tests, DI pattern via `StopDeps`)

#### Sling Guard Features
- **Bead lock** — `checkBeadLock()` pure function prevents concurrent agents from working the same bead ID, enforced in `slingCommand` before spawning
- **Run session cap** — `checkRunSessionLimit()` pure function with `maxSessionsPerRun` config field (default 0 = unlimited), enforced in `slingCommand` to limit concurrent agents per run
- **`--skip-scout` flag** — passes through to overlay via `OverlayConfig.skipScout`, renders `SKIP_SCOUT_SECTION` in template for lead agents that want to skip scout phase

#### Agent Pipeline Improvements
- **Complexity-tiered pipeline** in lead agent definition — leads now assess task complexity (simple/moderate/complex) before deciding whether to spawn scouts, builders, and reviewers
- Scouts made optional for simple/moderate tasks (SHOULD vs MUST)
- Reviewers made optional with self-verification path for simple/moderate tasks
- `SCOUT_SKIP` and `REVIEW_SKIP` failure modes softened to warnings
- Scout and reviewer agents simplified: replaced `INSIGHT:` protocol with plain notable findings

#### Testing
- Test suite grew from 1996 to 2026 tests across 74 files (5023 expect() calls)

### Changed
- Lead agent role reframed to reflect that leads can be doers for simple tasks, not just delegators
- Lead propulsion principle updated to assess complexity before acting
- Lead cost awareness section no longer mandates reviewers

### Fixed
- Biome formatting in `stop.test.ts` (pre-existing lint issue)

## [0.5.8] - 2026-02-20

### Added

#### Provider Model Resolution
- `ResolvedModel` type and provider gateway support in `resolveModel()` — resolves `ModelRef` strings (e.g., `openrouter/openai/gpt-5.3`) through configured provider gateways with `baseUrl` and `authTokenEnv`
- Provider and model validation in `validateConfig()` — validates provider types (`native`/`gateway`), required gateway fields (`baseUrl`), and model reference format at config load time
- Provider environment variables now threaded through all agent spawn commands (`sling`, `coordinator`, `supervisor`, `monitor`) — gateway `authTokenEnv` values are passed to spawned agent processes

#### Mulch Integration
- Auto-infer mulch domains from file scope in `overstory sling` — `inferDomainsFromFiles()` maps file paths to domains (e.g., `src/commands/*.ts` → `cli`, `src/agents/*.ts` → `agents`) instead of always using configured defaults
- Outcome flags for `MulchClient.record()` — `--outcome-status`, `--outcome-duration`, `--outcome-test-results`, `--outcome-agent` for structured outcome tracking
- File-scoped search in `MulchClient.search()` — `--file` and `--sort-by-score` options for targeted expertise queries
- PostToolUse Bash hook in hooks template and init — runs `mulch diff` after git commits to auto-detect expertise changes

#### Agent Definition Updates
- Builder completion protocol includes outcome data flags (`--outcome-status success --outcome-agent $OVERSTORY_AGENT_NAME`)
- Lead and supervisor agents get file-scoped mulch search capability (`mulch search <query> --file <path>`)
- Overlay quality gates include outcome flags for mulch recording

#### Dashboard Performance
- `limit` option added to `MailStore.getAll()` — dashboard now fetches only the most recent messages instead of the full mailbox
- Persistent DB connections across dashboard poll ticks — `SessionStore`, `EventStore`, `MailStore`, and `MetricsStore` connections are now opened once and reused, eliminating per-tick open/close overhead

#### Testing
- Test suite grew from 1916 to 1996 tests across 73 files (4960 expect() calls)

### Fixed
- Zombie agent recovery — `updateLastActivity` now recovers agents from "zombie" state when hooks prove they're alive (previously only recovered from "booting")
- Dashboard `.repeat()` crash when negative values were passed — now clamps repeat count to minimum of 0
- Set-based tmux session lookup in `status.ts` replacing O(n) array scans with O(1) Set membership checks
- Subprocess cache in `status.ts` preventing redundant `tmux list-sessions` calls during a single status gather
- Null-runId sessions (coordinator) now included in run-scoped status and dashboard views — previously filtered out when `--all` was not specified
- Sparse file used in logs doctor test to prevent timeout on large log directory scans
- Beacon submission reliability — replaced fixed sleep with poll-based TUI readiness check (PR #19, thanks [@dmfaux](https://github.com/dmfaux)!)
- Biome formatting in hooks-deployer test and sling

## [0.5.7] - 2026-02-19

### Added

#### Provider Types
- `ModelAlias`, `ModelRef`, and `ProviderConfig` types in `types.ts` — foundation for multi-provider model routing (`native` and `gateway` provider types with `baseUrl` and `authTokenEnv` configuration)
- `providers` field in `OverstoryConfig` — `Record<string, ProviderConfig>` for configuring model providers per project
- `resolveModel()` signature updated to accept `ModelRef` (provider-qualified strings like `openrouter/openai/gpt-5.3`) alongside simple `ModelAlias` values

#### Costs Command
- `--self` flag for `overstory costs` — parse the current orchestrator session's Claude Code transcript directly, bypassing metrics.db, useful for real-time cost visibility without agent infrastructure

#### Metrics
- `run_id` column added to `metrics.db` sessions table — enables `overstory costs --run <id>` filtering to work correctly; includes automatic migration for existing databases

#### Watchdog
- Phase-aware `buildCompletionMessage()` in watchdog daemon — generates targeted completion nudge messages based on worker capability composition (single-capability batches get phase-specific messages like "Ready for next phase", mixed batches get a summary with breakdown)

#### Testing
- Test suite grew from 1892 to 1916 tests across 73 files (4866 expect() calls)

## [0.5.6] - 2026-02-18

### Added

#### Safety Guards
- Root-user pre-flight guard on all agent spawn commands (`sling`, `coordinator start`, `supervisor start`, `monitor start`) — blocks spawning when running as UID 0, since the `claude` CLI rejects `--dangerously-skip-permissions` as root causing tmux sessions to die immediately
- Unmerged branch safety check in `overstory worktree clean` — skips worktrees with unmerged branches by default, warns about skipped branches, and requires `--force` to delete them

#### Init Improvements
- `.overstory/README.md` generation during `overstory init` — explains the directory to contributors who encounter `.overstory/` in a project, whitelisted in `.gitignore`

#### Tier 2 Monitor Config Gating
- `overstory monitor start` now gates on `watchdog.tier2Enabled` config flag — throws a clear error when Tier 2 is disabled instead of silently proceeding
- `overstory coordinator start --monitor` respects `tier2Enabled` — skips monitor auto-start with a message when disabled

#### Tmux Error Handling
- `sendKeys` now distinguishes "tmux server not running" from "session not found" — provides actionable error messages for each case (e.g., root-user hint for server-not-running)

#### Documentation
- Lead agent definition (`agents/lead.md`) reframed as coordinator-not-doer — emphasizes the lead's role as a delegation specialist rather than an implementer

#### Testing
- Test suite grew from 1868 to 1892 tests across 73 files (4807 expect() calls)

### Fixed
- Biome formatting in merged builder code

## [0.5.5] - 2026-02-18

### Added

#### Run Scoping
- `overstory status` now scopes to the current run by default with `--all` flag to show all runs — `gatherStatus()` filters sessions by `runId` when present
- `overstory dashboard` now scopes all panels to the current run by default with `--all` flag to show data across all runs

#### Config Local Overrides
- `config.local.yaml` support for machine-specific configuration overrides — values in `config.local.yaml` are deep-merged over `config.yaml`, allowing per-machine settings (model overrides, paths, watchdog intervals) without modifying the tracked config file (PR #9)

#### Universal Push Guard
- PreToolUse hooks template now includes a universal `git push` guard — blocks all `git push` commands for all agents (previously only blocked push to canonical branches)

#### Watchdog Run-Completion Detection
- Watchdog daemon tick now detects when all agents in the current run have completed and auto-reports run completion

#### Lead Agent Streaming
- Lead agents now stream `merge_ready` messages per-builder as each completes, instead of batching all merge signals — enables earlier merge pipeline starts

#### Claude Code Command Skills
- Added `issue-reviews` and `pr-reviews` skills for reviewing GitHub issues and pull requests from within Claude Code

#### Testing
- Test suite grew from 1848 to 1868 tests across 73 files (4771 expect() calls)

### Fixed
- `overstory sling` now uses `resolveModel()` for config-level model overrides — previously ignored `models:` config section when spawning agents
- `overstory doctor` dependency check now detects `bd` CGO/Dolt backend failures — catches cases where `bd` binary exists but crashes due to missing CGO dependencies (PR #11)
- Biome line width formatting in `src/doctor/consistency.ts`

## [0.5.4] - 2026-02-17

### Added

#### Reviewer Coverage Enforcement
- Reviewer-coverage doctor check in `overstory doctor` — warns when leads spawn builders without corresponding reviewers, reports partial coverage ratios per lead
- `merge_ready` reviewer validation in `overstory mail send` — advisory warning when sending `merge_ready` without reviewer sessions for the sender's builders

#### Scout-First Workflow Enforcement
- Scout-before-builder warning in `overstory sling` — warns when a lead spawns a builder without having spawned any scouts first
- `parentHasScouts()` helper exported from sling for testability

#### Run Auto-Completion
- `overstory coordinator stop` now auto-completes the active run (reads `current-run.txt`, marks run completed, cleans up)
- `overstory log session-end` auto-completes the run when the coordinator exits (handles tmux window close without explicit stop)

#### Gitignore Wildcard+Whitelist Model
- `.overstory/.gitignore` flipped from explicit blocklist to wildcard `*` + whitelist pattern — ignore everything, whitelist only tracked files (`config.yaml`, `agent-manifest.json`, `hooks.json`, `groups.json`, `agent-defs/`)
- `overstory prime` auto-heals `.overstory/.gitignore` on each session start — ensures existing projects get the updated gitignore
- `OVERSTORY_GITIGNORE` constant and `writeOverstoryGitignore()` exported from init.ts for reuse

#### Testing
- Test suite grew from 1812 to 1848 tests across 73 files (4726 expect() calls)

### Changed
- Lead agent definition (`agents/lead.md`) — scouts made mandatory (not optional), Phase 3 review made MANDATORY with stronger language, added `SCOUT_SKIP` failure mode, expanded cost awareness section explaining why scouts and reviewers are investments not overhead
- `overstory init` .gitignore now always overwrites (supports `--force` reinit and auto-healing)

### Fixed
- Hooks template (`templates/hooks.json.tmpl`) — removed fragile `read -r INPUT; echo "$INPUT" |` stdin relay pattern; `overstory log` now reads stdin directly via `--stdin` flag
- `readStdinJson()` in log command — reads all stdin chunks for large payloads instead of only the first line
- Doctor gitignore structure check updated for wildcard+whitelist model

## [0.5.3] - 2026-02-17

### Added

#### Configurable Agent Models
- `models:` section in `config.yaml` — override the default model (`sonnet`, `opus`, `haiku`) for any agent role (coordinator, supervisor, monitor, etc.)
- `resolveModel()` helper in agent manifest — resolution chain: config override > manifest default > fallback
- Supervisor and monitor entries added to `agent-manifest.json` with model and capability metadata
- `overstory init` now seeds the default `models:` section in generated `config.yaml`

#### Testing
- Test suite grew from 1805 to 1812 tests across 73 files (4638 expect() calls)

## [0.5.2] - 2026-02-17

### Added

#### New Flags
- `--into <branch>` flag for `overstory merge` — target a specific branch instead of always merging to canonicalBranch

#### Session Branch Tracking
- `overstory prime` now records the orchestrator's starting branch to `.overstory/session-branch.txt` at session start
- `overstory merge` reads `session-branch.txt` as the default merge target when `--into` is not specified — resolution chain: `--into` flag > `session-branch.txt` > config `canonicalBranch`

#### Testing
- Test suite grew from 1793 to 1805 tests across 73 files (4615 expect() calls)

### Changed
- Git push blocking for agents now blocks ALL `git push` commands (previously only blocked push to canonical branches) — agents should use `overstory merge` instead
- Init-deployed hooks now include a PreToolUse Bash guard that blocks `git push` for the orchestrator's project

### Fixed
- Test cwd pollution in agents test afterEach — restored cwd to prevent cross-file pollution

## [0.5.1] - 2026-02-16

### Added

#### New CLI Commands
- `overstory agents discover` — discover and query agents by capability, state, file scope, and parent with `--capability`, `--state`, `--parent` filters and `--json` output

#### New Subsystems
- Session insight analyzer (`src/insights/analyzer.ts`) — analyzes EventStore data from completed sessions to extract structured patterns about tool usage, file edits, and errors for automatic mulch expertise recording
- Conflict history intelligence in merge resolver — tracks past conflict resolution patterns per file to skip historically-failing tiers and enrich AI resolution prompts with successful strategies

#### Agent Improvements
- INSIGHT recording protocol for agent definitions — read-only agents (scout, reviewer) use INSIGHT prefix for structured expertise observations; parent agents (lead, supervisor) record insights to mulch automatically

#### Testing
- Test suite grew from 1749 to 1793 tests across 73 files (4587 expect() calls)

### Changed
- `session-end` hook now calls `mulch record` directly instead of sending `mulch_learn` mail messages — removes mail indirection for expertise recording

### Fixed
- Coordinator tests now always inject fake monitor/watchdog for proper isolation

## [0.5.0] - 2026-02-16

### Added

#### New CLI Commands
- `overstory feed` — unified real-time event stream across all agents with `--follow` mode for continuous polling, agent/run filtering, and JSON output
- `overstory logs` — query NDJSON log files across agents with level filtering (`--level`), time range queries (`--since`/`--until`), and `--follow` tail mode
- `overstory costs --live` — real-time token usage display for active agents

#### New Flags
- `--monitor` flag for `coordinator start/stop/status` — manage the Tier 2 monitor agent alongside the coordinator

#### Agent Improvements
- Mulch recording as required completion gate for all agent types — agents must record learnings before session close
- Mulch learn extraction added to Stop hooks for orchestrator and all agents
- Scout-spawning made default in lead.md Phase 1 with parallel support
- Reviewer spawning made mandatory in lead.md

#### Infrastructure
- Real-time token tracking infrastructure (`src/metrics/store.ts`, `src/commands/costs.ts`) — live session cost monitoring via transcript JSONL parsing

#### Testing
- Test suite grew from 1673 to 1749 tests across 71 files (4460 expect() calls)

### Fixed
- Duplicate `feed` entry in CLI command router and help text

## [0.4.1] - 2026-02-16

### Added

#### New CLI Commands & Flags
- `overstory --completions <shell>` — shell completion generation for bash, zsh, and fish
- `--quiet` / `-q` global flag — suppress non-error output across all commands
- `overstory mail send --to @all` — broadcast messaging with group addresses (`@all`, `@builders`, `@scouts`, `@reviewers`, `@leads`, `@mergers`, etc.)

#### Output Control
- Central `NO_COLOR` convention support (`src/logging/color.ts`) — respects `NO_COLOR`, `FORCE_COLOR`, and `TERM=dumb` environment variables per https://no-color.org
- All ANSI color output now goes through centralized color module instead of inline escape codes

#### Infrastructure
- Merge queue migrated from JSON file to SQLite (`merge-queue.db`) for durability and concurrent access

#### Testing
- Test suite grew from 1612 to 1673 tests across 69 files (4267 expect() calls)

### Fixed
- Freeze duration counter for completed/zombie agents in status and dashboard displays

## [0.4.0] - 2026-02-15

### Added

#### New CLI Commands
- `overstory doctor` — comprehensive health check system with 9 check modules (dependencies, config, structure, databases, consistency, agents, merge-queue, version, logs) and formatted output with pass/warn/fail status
- `overstory inspect <agent>` — deep per-agent inspection aggregating session data, metrics, events, and live tmux capture with `--follow` polling mode

#### New Flags
- `--watchdog` flag for `coordinator start` — auto-starts the watchdog daemon alongside the coordinator
- `--debounce <ms>` flag for `mail check` — prevents excessive mail checking by skipping if called within the debounce window
- PostToolUse hook entry for debounced mail checking

#### Observability Improvements
- Automated failure recording in watchdog via mulch — records failure patterns for future reference
- Mulch learn extraction in `log session-end` — captures session insights automatically
- Mulch health checks in `overstory clean` — validates mulch installation and domain health during cleanup

#### Testing
- Test suite grew from 1435 to 1612 tests across 66 files (3958 expect() calls)

### Fixed

- Wire doctor command into CLI router and update command groups

## [0.3.0] - 2026-02-13

### Added

#### New CLI Commands
- `overstory run` command — orchestration run lifecycle management (`list`, `show`, `complete` subcommands) with RunStore backed by sessions.db
- `overstory trace` command — agent/bead timeline viewing for debugging and post-mortem observability
- `overstory clean` command — cleanup worktrees, sessions, and artifacts with auto-cleanup on agent teardown

#### Observability & Persistence
- Run tracking via `run_id` integrated into sling and clean commands
- `RunStore` in sessions.db for durable run state
- `SessionStore` (SQLite) — migrated from sessions.json for concurrent access and crash safety
- Phase 2 CLI query commands and Phase 3 event persistence for the observability pipeline

#### Agent Improvements
- Project-scoped tmux naming (`overstory-{projectName}-{agentName}`) to prevent cross-project session collisions
- `ENV_GUARD` on all hooks — prevents hooks from firing outside overstory-managed worktrees
- Mulch-informed lead decomposition — leader agents use mulch expertise when breaking down tasks
- Mulch conflict pattern recording — merge resolver records conflict patterns to mulch for future reference

#### MulchClient Expansion
- New commands and flags for the mulch CLI wrapper
- `--json` parsing support with corrected types and flag spread

#### Community & Documentation
- `STEELMAN.md` — comprehensive risk analysis for agent swarm deployments
- Community files: CONTRIBUTING.md, CODE_OF_CONDUCT.md, SECURITY.md
- Package metadata (keywords, repository, homepage) for npm/GitHub presence

#### Testing
- Test suite grew from 912 to 1435 tests across 55 files (3416 expect() calls)

### Fixed

- Fix `isCanonicalRoot` guard blocking all worktree overlays when dogfooding overstory on itself
- Fix auto-nudge tmux corruption and deploy coordinator hooks correctly
- Fix 4 P1 issues: orchestrator nudge routing, bash guard bypass, hook capture isolation, overlay guard
- Fix 4 P1/P2 issues: ENV_GUARD enforcement, persistent agent state, project-scoped tmux kills, auto-nudge coordinator
- Strengthen agent orchestration with additional P1 bug fixes

### Changed

- CLI commands grew from 17 to 20 (added run, trace, clean)

## [0.2.0] - 2026-02-13

### Added

#### Coordinator & Supervisor Agents
- `overstory coordinator` command — persistent orchestrator that runs at project root, decomposes objectives into subtasks, dispatches agents via sling, and tracks batches via task groups
  - `start` / `stop` / `status` subcommands
  - `--attach` / `--no-attach` with TTY-aware auto-detection for tmux sessions
  - Scout-delegated spec generation for complex tasks
- Supervisor agent definition — per-project team lead (depth 1) that receives dispatch mail from coordinator, decomposes into worker-sized subtasks, manages worker lifecycle, and escalates unresolvable issues
- 7 base agent types (added coordinator + supervisor to existing scout, builder, reviewer, lead, merger)

#### Task Groups & Session Lifecycle
- `overstory group` command — batch coordination (`create` / `status` / `add` / `remove` / `list`) with auto-close when all member beads issues complete, mail notification to coordinator on auto-close
- Session checkpoint save/restore for compaction survivability (`prime --compact` restores from checkpoint)
- Handoff orchestration (initiate/resume/complete) for crash recovery

#### Typed Mail Protocol
- 8 protocol message types: `worker_done`, `merge_ready`, `merged`, `merge_failed`, `escalation`, `health_check`, `dispatch`, `assign`
- Type-safe `sendProtocol<T>()` and `parsePayload<T>()` for structured agent coordination
- JSON payload column with schema migration handling 3 upgrade paths

#### Agent Nudging
- `overstory nudge` command with retry (3x), debounce (500ms), and `--force` to skip debounce
- Auto-nudge on urgent/high priority mail send

#### Structural Tool Enforcement
- PreToolUse hooks mechanically block file-modifying tools (Write/Edit/NotebookEdit) for non-implementation agents (scout, reviewer, coordinator, supervisor)
- PreToolUse Bash guards block dangerous git operations (`push`, `reset --hard`, `clean -f`, etc.) for all agents
- Whitelist git add/commit for coordinator/supervisor capabilities while keeping git push blocked
- Block Claude Code native team/task tools (Task, TeamCreate, etc.) for all overstory agents — enforces overstory sling delegation

#### Watchdog Improvements
- ZFC principle: tmux liveness as primary signal, pid check as secondary, sessions.json as tertiary
- Descendant tree walking for process cleanup — `getPanePid()`, `getDescendantPids()`, `killProcessTree()` with SIGTERM → grace → SIGKILL
- Re-check zombies on every tick, handle investigate action
- Stalled state added to zombie reconciliation

#### Worker Self-Propulsion (Phase 3)
- Builder agents send `worker_done` mail on task completion
- Overlay quality gates include worker_done signal step
- Prime activation context injection for bound tasks
- `MISSING_WORKER_DONE` failure mode in builder definition

#### Interactive Agent Mode
- Switch sling from headless (`claude -p`) to interactive mode with tmux sendKeys beacon — hooks now fire, enabling mail, metrics, logs, and lastActivity updates
- Structured `buildBeacon()` with identity context and startup protocol
- Fix beacon sendKeys multiline bug (increase initial sleep, follow-up Enter after 500ms)

#### CLI Improvements
- `--verbose` flag for `overstory status`
- `--json` flag for `overstory sling`
- `--background` flag for `overstory watch`
- Help text for unknown subcommands
- `SUPPORTED_CAPABILITIES` constant and `Capability` type

#### Init & Deployment
- `overstory init` now deploys agent definitions (copies `agents/*.md` to `.overstory/agent-defs/`) via `import.meta.dir` resolution
- E2E lifecycle test validates full init → config → manifest → overlay pipeline on throwaway external projects

#### Testing Improvements
- Colocated tests with source files (moved from `__tests__/` to `src/`)
- Shared test harness: `createTempGitRepo()`, `cleanupTempDir()`, `commitFile()` in `src/test-helpers.ts`
- Replaced `Bun.spawn` mocks with real implementations in 3 test files
- Optimized test harness: 38.1s → 11.7s (-69%)
- Comprehensive metrics command test coverage
- E2E init-sling lifecycle test
- Test suite grew from initial release to 515 tests across 24 files (1286 expect() calls)

### Fixed

- **60+ bugs** resolved across 8 dedicated fix sessions, covering P1 criticals through P4 backlog items:
  - Hooks enforcement: tool guard sed patterns now handle optional space after JSON colons
  - Status display: filter completed sessions from active agent count
  - Session lifecycle: move session recording before beacon send to fix booting → working race condition
  - Stagger delay (`staggerDelayMs`) now actually enforced between agent spawns
  - Hardcoded `main` branch replaced with dynamic branch detection in worktree/manager and merge/resolver
  - Sling headless mode fixes for E2E validation
  - Input validation, environment variable handling, init improvements, cleanup lifecycle
  - `.gitignore` patterns for `.overstory/` artifacts
  - Mail, merge, and worktree subsystem edge cases

### Changed

- Agent propulsion principle: failure modes, cost awareness, and completion protocol added to all agent definitions
- Agent quality gates updated across all base definitions
- Test file paths updated from `__tests__/` convention to colocated `src/**/*.test.ts`

## [0.1.0] - 2026-02-12

### Added

- CLI entry point with command router (`overstory <command>`)
- `overstory init` — initialize `.overstory/` in a target project
- `overstory sling` — spawn worker agents in git worktrees via tmux
- `overstory prime` — load context for orchestrator or agent sessions
- `overstory status` — show active agents, worktrees, and project state
- `overstory mail` — SQLite-based inter-agent messaging (send/check/list/read/reply)
- `overstory merge` — merge agent branches with 4-tier conflict resolution
- `overstory worktree` — manage git worktrees (list/clean)
- `overstory log` — hook event logging (NDJSON + human-readable)
- `overstory watch` — watchdog daemon with health monitoring and AI-assisted triage
- `overstory metrics` — session metrics storage and reporting
- Agent manifest system with 5 base agent types (scout, builder, reviewer, lead, merger)
- Two-layer agent definition: base `.md` files (HOW) + dynamic overlays (WHAT)
- Persistent agent identity and CV system
- Hooks deployer for automatic worktree configuration
- beads (`bd`) CLI wrapper for issue tracking integration
- mulch CLI wrapper for structured expertise management
- Multi-format logging with secret redaction
- SQLite metrics storage for session analytics
- Full test suite using `bun test`
- Biome configuration for formatting and linting
- TypeScript strict mode with `noUncheckedIndexedAccess`

[Unreleased]: https://github.com/jayminwest/overstory/compare/v0.7.0...HEAD
[0.7.0]: https://github.com/jayminwest/overstory/compare/v0.6.12...v0.7.0
[0.6.12]: https://github.com/jayminwest/overstory/compare/v0.6.11...v0.6.12
[0.6.11]: https://github.com/jayminwest/overstory/compare/v0.6.10...v0.6.11
[0.6.10]: https://github.com/jayminwest/overstory/compare/v0.6.9...v0.6.10
[0.6.9]: https://github.com/jayminwest/overstory/compare/v0.6.8...v0.6.9
[0.6.8]: https://github.com/jayminwest/overstory/compare/v0.6.7...v0.6.8
[0.6.7]: https://github.com/jayminwest/overstory/compare/v0.6.6...v0.6.7
[0.6.6]: https://github.com/jayminwest/overstory/compare/v0.6.5...v0.6.6
[0.6.5]: https://github.com/jayminwest/overstory/compare/v0.6.4...v0.6.5
[0.6.4]: https://github.com/jayminwest/overstory/compare/v0.6.3...v0.6.4
[0.6.3]: https://github.com/jayminwest/overstory/compare/v0.6.2...v0.6.3
[0.6.2]: https://github.com/jayminwest/overstory/compare/v0.6.1...v0.6.2
[0.6.1]: https://github.com/jayminwest/overstory/compare/v0.6.0...v0.6.1
[0.6.0]: https://github.com/jayminwest/overstory/compare/v0.5.9...v0.6.0
[0.5.9]: https://github.com/jayminwest/overstory/compare/v0.5.8...v0.5.9
[0.5.8]: https://github.com/jayminwest/overstory/compare/v0.5.7...v0.5.8
[0.5.7]: https://github.com/jayminwest/overstory/compare/v0.5.6...v0.5.7
[0.5.6]: https://github.com/jayminwest/overstory/compare/v0.5.5...v0.5.6
[0.5.5]: https://github.com/jayminwest/overstory/compare/v0.5.4...v0.5.5
[0.5.4]: https://github.com/jayminwest/overstory/compare/v0.5.3...v0.5.4
[0.5.3]: https://github.com/jayminwest/overstory/compare/v0.5.2...v0.5.3
[0.5.2]: https://github.com/jayminwest/overstory/compare/v0.5.1...v0.5.2
[0.5.1]: https://github.com/jayminwest/overstory/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/jayminwest/overstory/compare/v0.4.1...v0.5.0
[0.4.1]: https://github.com/jayminwest/overstory/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/jayminwest/overstory/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/jayminwest/overstory/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/jayminwest/overstory/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/jayminwest/overstory/releases/tag/v0.1.0
