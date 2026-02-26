// Pi runtime adapter for overstory's AgentRuntime interface.
// Implements the AgentRuntime contract for the `pi` CLI (Mario Zechner's Pi coding agent).

import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { ResolvedModel } from "../types.ts";
import { generatePiGuardExtension } from "./pi-guards.ts";
import type {
	AgentRuntime,
	HooksDef,
	OverlayContent,
	ReadyState,
	SpawnOpts,
	TranscriptSummary,
} from "./types.ts";

/**
 * Pi runtime adapter.
 *
 * Implements AgentRuntime for the `pi` CLI (Mario Zechner's Pi coding agent).
 * Security is enforced via Pi guard extensions rather than permission-mode flags —
 * Pi has no --permission-mode equivalent.
 */
export class PiRuntime implements AgentRuntime {
	/** Unique identifier for this runtime. */
	readonly id = "pi";

	/** Relative path to the instruction file within a worktree. Pi reads .claude/CLAUDE.md natively. */
	readonly instructionPath = ".claude/CLAUDE.md";

	/**
	 * Build the shell command string to spawn an interactive Pi agent.
	 *
	 * Maps SpawnOpts to the `pi` CLI flags:
	 * - `model` → `--model <model>`
	 * - `permissionMode` is accepted but NOT mapped — Pi has no permission-mode flag.
	 *   Security is enforced via guard extensions deployed by deployConfig().
	 * - `appendSystemPrompt` → `--append-system-prompt '<escaped>'` (POSIX single-quote escaping)
	 *
	 * The `cwd` and `env` fields are handled by the tmux session creator, not embedded here.
	 *
	 * @param opts - Spawn options (model, appendSystemPrompt; permissionMode is ignored)
	 * @returns Shell command string suitable for tmux new-session -c
	 */
	buildSpawnCommand(opts: SpawnOpts): string {
		let cmd = `pi --model ${opts.model}`;

		if (opts.appendSystemPrompt) {
			// POSIX single-quote escape: end quote, backslash-quote, start quote.
			const escaped = opts.appendSystemPrompt.replace(/'/g, "'\\''");
			cmd += ` --append-system-prompt '${escaped}'`;
		}

		return cmd;
	}

	/**
	 * Build the argv array for a headless one-shot Pi invocation.
	 *
	 * Returns an argv array suitable for `Bun.spawn()`. The `--print` flag causes Pi
	 * to run the prompt and exit. Unlike Claude Code, the prompt is a positional argument
	 * (last), not passed via `-p`.
	 *
	 * @param prompt - The prompt to pass as a positional argument
	 * @param model - Optional model override
	 * @returns Argv array for Bun.spawn
	 */
	buildPrintCommand(prompt: string, model?: string): string[] {
		const cmd = ["pi", "--print"];
		if (model !== undefined) {
			cmd.push("--model", model);
		}
		cmd.push(prompt);
		return cmd;
	}

	/**
	 * Deploy per-agent instructions and guards to a worktree.
	 *
	 * Writes up to three files:
	 * 1. `.claude/CLAUDE.md` — agent's task-specific overlay. Skipped when overlay is undefined.
	 * 2. `.pi/extensions/overstory-guard.ts` — Pi guard extension (always deployed).
	 * 3. `.pi/settings.json` — Pi settings enabling the extensions directory (always deployed).
	 *
	 * @param worktreePath - Absolute path to the agent's git worktree
	 * @param overlay - Overlay content to write as CLAUDE.md, or undefined for guard-only deployment
	 * @param hooks - Agent identity, capability, worktree path, and optional quality gates
	 */
	async deployConfig(
		worktreePath: string,
		overlay: OverlayContent | undefined,
		hooks: HooksDef,
	): Promise<void> {
		if (overlay) {
			const claudeDir = join(worktreePath, ".claude");
			await mkdir(claudeDir, { recursive: true });
			await Bun.write(join(claudeDir, "CLAUDE.md"), overlay.content);
		}

		// Always deploy Pi guard extension.
		const piExtDir = join(worktreePath, ".pi", "extensions");
		await mkdir(piExtDir, { recursive: true });
		await Bun.write(join(piExtDir, "overstory-guard.ts"), generatePiGuardExtension(hooks));

		// Always deploy Pi settings pointing at the extensions directory.
		const piDir = join(worktreePath, ".pi");
		const settings = { extensions: ["./extensions"] };
		await Bun.write(join(piDir, "settings.json"), `${JSON.stringify(settings, null, "\t")}\n`);
	}

	/**
	 * Detect Pi TUI readiness from a tmux pane content snapshot.
	 *
	 * Pi shows a header containing "pi" and "model:" when the TUI has fully rendered.
	 * Pi has no trust dialog phase.
	 *
	 * @param paneContent - Captured tmux pane content to analyze
	 * @returns Current readiness phase
	 */
	detectReady(paneContent: string): ReadyState {
		if (paneContent.includes("pi") && paneContent.includes("model:")) {
			return { phase: "ready" };
		}
		return { phase: "loading" };
	}

	/**
	 * Parse a Pi transcript JSONL file into normalized token usage.
	 *
	 * Pi JSONL format differs from Claude Code:
	 * - Token counts are in `message_end` events with TOP-LEVEL `inputTokens` / `outputTokens`
	 *   (not nested under message.usage)
	 * - Model identity comes from `model_change` events with a `model` field
	 *
	 * Returns null if the file does not exist or cannot be parsed.
	 *
	 * @param path - Absolute path to the Pi transcript JSONL file
	 * @returns Aggregated token usage, or null if unavailable
	 */
	async parseTranscript(path: string): Promise<TranscriptSummary | null> {
		const file = Bun.file(path);
		if (!(await file.exists())) {
			return null;
		}

		try {
			const text = await file.text();
			const lines = text.split("\n").filter((l) => l.trim().length > 0);

			let inputTokens = 0;
			let outputTokens = 0;
			let model = "";

			for (const line of lines) {
				let entry: Record<string, unknown>;
				try {
					entry = JSON.parse(line) as Record<string, unknown>;
				} catch {
					// Skip malformed lines — Pi transcripts may have partial writes.
					continue;
				}

				if (entry.type === "message_end") {
					// Pi top-level token fields (not nested under message.usage).
					if (typeof entry.inputTokens === "number") {
						inputTokens += entry.inputTokens;
					}
					if (typeof entry.outputTokens === "number") {
						outputTokens += entry.outputTokens;
					}
				} else if (entry.type === "model_change") {
					if (typeof entry.model === "string") {
						model = entry.model;
					}
				}
			}

			return { inputTokens, outputTokens, model };
		} catch {
			return null;
		}
	}

	/**
	 * Build runtime-specific environment variables for model/provider routing.
	 *
	 * Returns the provider environment variables from the resolved model, or an empty
	 * object if none are set.
	 *
	 * @param model - Resolved model with optional provider env vars
	 * @returns Environment variable map (may be empty)
	 */
	buildEnv(model: ResolvedModel): Record<string, string> {
		return model.env ?? {};
	}
}

/** Singleton instance for use in callers that do not need DI. */
export const piRuntime = new PiRuntime();
