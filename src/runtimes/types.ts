// Runtime abstraction types for multi-provider agent support.
// See docs/runtime-abstraction.md for design rationale and coupling inventory.

import type { QualityGate, ResolvedModel } from "../types.ts";

// === Spawn ===

/** Options for spawning an interactive agent process. */
export interface SpawnOpts {
	/** Model ref (alias or provider-qualified, e.g. "sonnet" or "openrouter/gpt-5"). */
	model: string;
	/** Permission mode: bypass for trusted builders, ask for interactive agents. */
	permissionMode: "bypass" | "ask";
	/** Optional system prompt prefix injected before the agent's base instructions. */
	systemPrompt?: string;
	/** Optional system prompt suffix appended after the base instructions. */
	appendSystemPrompt?: string;
	/** Working directory for the spawned process. */
	cwd: string;
	/** Additional environment variables to pass to the spawned process. */
	env: Record<string, string>;
}

// === Readiness ===

/**
 * Discrete phases of agent TUI readiness, detected from tmux pane content.
 * Headless runtimes (codex exec, pi --mode rpc) always return { phase: "ready" }.
 */
export type ReadyState =
	| { phase: "loading" }
	| { phase: "dialog"; action: string }
	| { phase: "ready" };

// === Config Deployment ===

/** Runtime-agnostic overlay content to write into a worktree. */
export interface OverlayContent {
	/** Full markdown text to write as the agent's instruction file. */
	content: string;
}

/**
 * Runtime-agnostic hook/guard configuration for deployment to a worktree.
 * Each runtime adapter translates this into its native guard mechanism
 * (e.g., settings.local.json hooks for Claude Code, guard extensions for Pi).
 */
export interface HooksDef {
	/** Agent name injected into hook commands. */
	agentName: string;
	/** Agent capability (builder, scout, reviewer, lead, etc.). */
	capability: string;
	/** Absolute path to the agent's worktree for path-boundary enforcement. */
	worktreePath: string;
	/** Quality gates agents must pass before reporting completion. */
	qualityGates?: QualityGate[];
}

// === Transcripts ===

/** Normalized token usage extracted from any runtime's session transcript. */
export interface TranscriptSummary {
	inputTokens: number;
	outputTokens: number;
	/** Model identifier as reported by the runtime (e.g. "claude-sonnet-4-6"). */
	model: string;
}

// === Runtime Interface ===

/**
 * Contract that all agent runtime adapters must implement.
 *
 * Each runtime (Claude Code, Codex, Pi, OpenCode, ...) provides a ~200-400 line
 * adapter file implementing this interface. The orchestration engine calls only
 * these methods — never the runtime's CLI directly.
 */
export interface AgentRuntime {
	/** Unique runtime identifier (e.g. "claude", "codex", "pi"). */
	id: string;

	/** Build the shell command string to spawn an interactive agent in a tmux pane. */
	buildSpawnCommand(opts: SpawnOpts): string;

	/**
	 * Build the argv array for a headless one-shot AI call.
	 * Used by merge/resolver.ts and watchdog/triage.ts for AI-assisted operations.
	 */
	buildPrintCommand(prompt: string, model?: string): string[];

	/**
	 * Deploy per-agent instructions and guards to a worktree.
	 * Claude Code writes .claude/CLAUDE.md + settings.local.json hooks.
	 * Codex writes AGENTS.md (no hook deployment needed).
	 * Pi writes .claude/CLAUDE.md + a guard extension in .pi/extensions/.
	 */
	deployConfig(worktreePath: string, overlay: OverlayContent, hooks: HooksDef): Promise<void>;

	/**
	 * Detect agent readiness from tmux pane content.
	 * Headless runtimes that exit when done should return { phase: "ready" } unconditionally.
	 */
	detectReady(paneContent: string): ReadyState;

	/**
	 * Parse a session transcript file into normalized token usage.
	 * Returns null if the transcript does not exist or cannot be parsed.
	 */
	parseTranscript(path: string): Promise<TranscriptSummary | null>;

	/**
	 * Build runtime-specific environment variables for model/provider routing.
	 * Claude Code uses ANTHROPIC_API_KEY; Codex uses OPENAI_API_KEY; Pi passes
	 * the provider's authTokenEnv directly.
	 */
	buildEnv(model: ResolvedModel): Record<string, string>;
}
