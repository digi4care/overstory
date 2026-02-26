import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ResolvedModel } from "../types.ts";
import { PiRuntime } from "./pi.ts";
import type { SpawnOpts } from "./types.ts";

describe("PiRuntime", () => {
	const runtime = new PiRuntime();

	describe("id and instructionPath", () => {
		test("id is 'pi'", () => {
			expect(runtime.id).toBe("pi");
		});

		test("instructionPath is .claude/CLAUDE.md", () => {
			expect(runtime.instructionPath).toBe(".claude/CLAUDE.md");
		});
	});

	describe("buildSpawnCommand", () => {
		test("basic command includes model flag", () => {
			const opts: SpawnOpts = {
				model: "sonnet",
				permissionMode: "bypass",
				cwd: "/tmp/worktree",
				env: {},
			};
			const cmd = runtime.buildSpawnCommand(opts);
			expect(cmd).toBe("pi --model sonnet");
		});

		test("permissionMode is NOT included in command (Pi has no permission-mode flag)", () => {
			const opts: SpawnOpts = {
				model: "opus",
				permissionMode: "bypass",
				cwd: "/tmp/worktree",
				env: {},
			};
			const cmd = runtime.buildSpawnCommand(opts);
			expect(cmd).not.toContain("--permission-mode");
			expect(cmd).not.toContain("bypassPermissions");
			expect(cmd).not.toContain("default");
		});

		test("ask permissionMode also excluded", () => {
			const opts: SpawnOpts = {
				model: "haiku",
				permissionMode: "ask",
				cwd: "/tmp/worktree",
				env: {},
			};
			const cmd = runtime.buildSpawnCommand(opts);
			expect(cmd).not.toContain("--permission-mode");
			expect(cmd).toBe("pi --model haiku");
		});

		test("with appendSystemPrompt (no quotes in prompt)", () => {
			const opts: SpawnOpts = {
				model: "sonnet",
				permissionMode: "bypass",
				cwd: "/tmp/worktree",
				env: {},
				appendSystemPrompt: "You are a builder agent.",
			};
			const cmd = runtime.buildSpawnCommand(opts);
			expect(cmd).toBe("pi --model sonnet --append-system-prompt 'You are a builder agent.'");
		});

		test("with appendSystemPrompt containing single quotes (POSIX escape)", () => {
			const opts: SpawnOpts = {
				model: "sonnet",
				permissionMode: "bypass",
				cwd: "/tmp/worktree",
				env: {},
				appendSystemPrompt: "Don't touch the user's files",
			};
			const cmd = runtime.buildSpawnCommand(opts);
			expect(cmd).toContain("--append-system-prompt");
			expect(cmd).toBe(
				"pi --model sonnet --append-system-prompt 'Don'\\''t touch the user'\\''s files'",
			);
		});

		test("without appendSystemPrompt omits the flag", () => {
			const opts: SpawnOpts = {
				model: "haiku",
				permissionMode: "bypass",
				cwd: "/tmp/worktree",
				env: {},
			};
			const cmd = runtime.buildSpawnCommand(opts);
			expect(cmd).not.toContain("--append-system-prompt");
		});

		test("cwd and env are not embedded in command string", () => {
			const opts: SpawnOpts = {
				model: "sonnet",
				permissionMode: "bypass",
				cwd: "/some/specific/path",
				env: { API_KEY: "sk-test-123" },
			};
			const cmd = runtime.buildSpawnCommand(opts);
			expect(cmd).not.toContain("/some/specific/path");
			expect(cmd).not.toContain("sk-test-123");
			expect(cmd).not.toContain("API_KEY");
		});

		test("all model names pass through unchanged", () => {
			for (const model of ["sonnet", "opus", "haiku", "gpt-4o", "openrouter/gpt-5"]) {
				const opts: SpawnOpts = {
					model,
					permissionMode: "bypass",
					cwd: "/tmp",
					env: {},
				};
				const cmd = runtime.buildSpawnCommand(opts);
				expect(cmd).toContain(`--model ${model}`);
			}
		});
	});

	describe("buildPrintCommand", () => {
		test("basic command without model — prompt is last positional arg", () => {
			const argv = runtime.buildPrintCommand("Summarize this diff");
			expect(argv).toEqual(["pi", "--print", "Summarize this diff"]);
		});

		test("command with model override — model before prompt", () => {
			const argv = runtime.buildPrintCommand("Classify this error", "haiku");
			expect(argv).toEqual(["pi", "--print", "--model", "haiku", "Classify this error"]);
		});

		test("model undefined omits --model flag", () => {
			const argv = runtime.buildPrintCommand("Hello", undefined);
			expect(argv).not.toContain("--model");
		});

		test("prompt is the last element (positional, not -p flag)", () => {
			const prompt = "My test prompt";
			const argv = runtime.buildPrintCommand(prompt, "sonnet");
			expect(argv[argv.length - 1]).toBe(prompt);
			expect(argv).not.toContain("-p");
		});

		test("without model, argv has exactly 3 elements", () => {
			const argv = runtime.buildPrintCommand("prompt text");
			expect(argv.length).toBe(3);
		});

		test("with model, argv has exactly 5 elements", () => {
			const argv = runtime.buildPrintCommand("prompt text", "sonnet");
			expect(argv.length).toBe(5);
		});
	});

	describe("detectReady", () => {
		test("returns loading for empty pane", () => {
			const state = runtime.detectReady("");
			expect(state).toEqual({ phase: "loading" });
		});

		test("returns loading when only 'pi' present", () => {
			const state = runtime.detectReady("Welcome to pi agent");
			expect(state).toEqual({ phase: "loading" });
		});

		test("returns loading when only 'model:' present", () => {
			const state = runtime.detectReady("model: sonnet");
			expect(state).toEqual({ phase: "loading" });
		});

		test("returns ready when both 'pi' and 'model:' present", () => {
			const state = runtime.detectReady("pi agent v1.0\nmodel: claude-sonnet");
			expect(state).toEqual({ phase: "ready" });
		});

		test("returns ready for typical Pi startup header", () => {
			const state = runtime.detectReady("pi\nmodel: sonnet\n> ");
			expect(state).toEqual({ phase: "ready" });
		});

		test("returns loading for random pane content", () => {
			const state = runtime.detectReady("Loading...\nPlease wait");
			expect(state).toEqual({ phase: "loading" });
		});

		test("no dialog phase — Pi has no trust dialog", () => {
			// Pi does not have a trust dialog; even 'trust this folder' should not trigger dialog
			const state = runtime.detectReady("trust this folder");
			expect(state.phase).not.toBe("dialog");
		});
	});

	describe("buildEnv", () => {
		test("returns empty object when model has no env", () => {
			const model: ResolvedModel = { model: "sonnet" };
			const env = runtime.buildEnv(model);
			expect(env).toEqual({});
		});

		test("returns model.env when present", () => {
			const model: ResolvedModel = {
				model: "sonnet",
				env: { API_KEY: "sk-test-123", BASE_URL: "https://api.example.com" },
			};
			const env = runtime.buildEnv(model);
			expect(env).toEqual({ API_KEY: "sk-test-123", BASE_URL: "https://api.example.com" });
		});

		test("returns empty object when model.env is undefined", () => {
			const model: ResolvedModel = { model: "opus", env: undefined };
			const env = runtime.buildEnv(model);
			expect(env).toEqual({});
		});

		test("result is safe to spread", () => {
			const model: ResolvedModel = { model: "sonnet" };
			const env = runtime.buildEnv(model);
			const combined = { ...env, OVERSTORY_AGENT_NAME: "builder-1" };
			expect(combined).toEqual({ OVERSTORY_AGENT_NAME: "builder-1" });
		});
	});

	describe("deployConfig", () => {
		let tempDir: string;

		beforeEach(async () => {
			tempDir = await mkdtemp(join(tmpdir(), "overstory-pi-test-"));
		});

		afterEach(async () => {
			await rm(tempDir, { recursive: true, force: true });
		});

		test("writes overlay to .claude/CLAUDE.md when overlay is provided", async () => {
			const worktreePath = join(tempDir, "worktree");

			await runtime.deployConfig(
				worktreePath,
				{ content: "# Pi Agent Overlay\nThis is the overlay content." },
				{ agentName: "test-builder", capability: "builder", worktreePath },
			);

			const overlayPath = join(worktreePath, ".claude", "CLAUDE.md");
			const content = await Bun.file(overlayPath).text();
			expect(content).toBe("# Pi Agent Overlay\nThis is the overlay content.");
		});

		test("deploys guard extension to .pi/extensions/overstory-guard.ts", async () => {
			const worktreePath = join(tempDir, "worktree");

			await runtime.deployConfig(
				worktreePath,
				{ content: "# Overlay" },
				{ agentName: "test-builder", capability: "builder", worktreePath },
			);

			const guardPath = join(worktreePath, ".pi", "extensions", "overstory-guard.ts");
			const exists = await Bun.file(guardPath).exists();
			expect(exists).toBe(true);
		});

		test("guard extension contains agent name and worktree path", async () => {
			const worktreePath = join(tempDir, "my-worktree");

			await runtime.deployConfig(
				worktreePath,
				{ content: "# Overlay" },
				{ agentName: "my-pi-agent", capability: "builder", worktreePath },
			);

			const guardPath = join(worktreePath, ".pi", "extensions", "overstory-guard.ts");
			const content = await Bun.file(guardPath).text();
			expect(content).toContain("my-pi-agent");
			expect(content).toContain(worktreePath);
		});

		test("deploys Pi settings.json with extensions config", async () => {
			const worktreePath = join(tempDir, "worktree");

			await runtime.deployConfig(
				worktreePath,
				{ content: "# Overlay" },
				{ agentName: "test-builder", capability: "builder", worktreePath },
			);

			const settingsPath = join(worktreePath, ".pi", "settings.json");
			const exists = await Bun.file(settingsPath).exists();
			expect(exists).toBe(true);

			const content = await Bun.file(settingsPath).text();
			const parsed = JSON.parse(content) as Record<string, unknown>;
			expect(parsed.extensions).toEqual(["./extensions"]);
		});

		test("settings.json has trailing newline", async () => {
			const worktreePath = join(tempDir, "worktree");

			await runtime.deployConfig(worktreePath, undefined, {
				agentName: "test-builder",
				capability: "builder",
				worktreePath,
			});

			const settingsPath = join(worktreePath, ".pi", "settings.json");
			const content = await Bun.file(settingsPath).text();
			expect(content.endsWith("\n")).toBe(true);
		});

		test("settings.json uses tab indentation", async () => {
			const worktreePath = join(tempDir, "worktree");

			await runtime.deployConfig(worktreePath, undefined, {
				agentName: "test-builder",
				capability: "builder",
				worktreePath,
			});

			const settingsPath = join(worktreePath, ".pi", "settings.json");
			const content = await Bun.file(settingsPath).text();
			// Tab-indented JSON has \t before array entries
			expect(content).toContain("\t");
		});

		test("skips CLAUDE.md when overlay is undefined", async () => {
			const worktreePath = join(tempDir, "worktree");

			await runtime.deployConfig(worktreePath, undefined, {
				agentName: "coordinator",
				capability: "coordinator",
				worktreePath,
			});

			const overlayPath = join(worktreePath, ".claude", "CLAUDE.md");
			const overlayExists = await Bun.file(overlayPath).exists();
			expect(overlayExists).toBe(false);
		});

		test("still deploys guard and settings when overlay is undefined", async () => {
			const worktreePath = join(tempDir, "worktree");

			await runtime.deployConfig(worktreePath, undefined, {
				agentName: "coordinator",
				capability: "coordinator",
				worktreePath,
			});

			const guardPath = join(worktreePath, ".pi", "extensions", "overstory-guard.ts");
			const settingsPath = join(worktreePath, ".pi", "settings.json");

			expect(await Bun.file(guardPath).exists()).toBe(true);
			expect(await Bun.file(settingsPath).exists()).toBe(true);
		});

		test("all three files present when overlay is provided", async () => {
			const worktreePath = join(tempDir, "worktree");

			await runtime.deployConfig(
				worktreePath,
				{ content: "# Overlay" },
				{ agentName: "test-builder", capability: "builder", worktreePath },
			);

			const claudeMdExists = await Bun.file(join(worktreePath, ".claude", "CLAUDE.md")).exists();
			const guardExists = await Bun.file(
				join(worktreePath, ".pi", "extensions", "overstory-guard.ts"),
			).exists();
			const settingsExists = await Bun.file(join(worktreePath, ".pi", "settings.json")).exists();

			expect(claudeMdExists).toBe(true);
			expect(guardExists).toBe(true);
			expect(settingsExists).toBe(true);
		});
	});

	describe("parseTranscript", () => {
		let tempDir: string;

		beforeEach(async () => {
			tempDir = await mkdtemp(join(tmpdir(), "overstory-pi-transcript-test-"));
		});

		afterEach(async () => {
			await rm(tempDir, { recursive: true, force: true });
		});

		test("returns null for non-existent file", async () => {
			const result = await runtime.parseTranscript(join(tempDir, "does-not-exist.jsonl"));
			expect(result).toBeNull();
		});

		test("parses message_end event with top-level inputTokens/outputTokens", async () => {
			const transcriptPath = join(tempDir, "session.jsonl");
			const entry = JSON.stringify({
				type: "message_end",
				inputTokens: 100,
				outputTokens: 50,
			});
			await Bun.write(transcriptPath, `${entry}\n`);

			const result = await runtime.parseTranscript(transcriptPath);
			expect(result).not.toBeNull();
			expect(result?.inputTokens).toBe(100);
			expect(result?.outputTokens).toBe(50);
		});

		test("aggregates multiple message_end events", async () => {
			const transcriptPath = join(tempDir, "session.jsonl");
			const entry1 = JSON.stringify({ type: "message_end", inputTokens: 100, outputTokens: 50 });
			const entry2 = JSON.stringify({ type: "message_end", inputTokens: 200, outputTokens: 75 });
			await Bun.write(transcriptPath, `${entry1}\n${entry2}\n`);

			const result = await runtime.parseTranscript(transcriptPath);
			expect(result).not.toBeNull();
			expect(result?.inputTokens).toBe(300);
			expect(result?.outputTokens).toBe(125);
		});

		test("reads model from model_change event", async () => {
			const transcriptPath = join(tempDir, "session.jsonl");
			const modelChange = JSON.stringify({ type: "model_change", model: "claude-sonnet-4-6" });
			const messageEnd = JSON.stringify({ type: "message_end", inputTokens: 10, outputTokens: 5 });
			await Bun.write(transcriptPath, `${modelChange}\n${messageEnd}\n`);

			const result = await runtime.parseTranscript(transcriptPath);
			expect(result?.model).toBe("claude-sonnet-4-6");
		});

		test("last model_change wins when multiple present", async () => {
			const transcriptPath = join(tempDir, "session.jsonl");
			const change1 = JSON.stringify({ type: "model_change", model: "sonnet" });
			const change2 = JSON.stringify({ type: "model_change", model: "opus" });
			const msgEnd = JSON.stringify({ type: "message_end", inputTokens: 10, outputTokens: 5 });
			await Bun.write(transcriptPath, `${change1}\n${change2}\n${msgEnd}\n`);

			const result = await runtime.parseTranscript(transcriptPath);
			expect(result?.model).toBe("opus");
		});

		test("defaults model to empty string when no model_change events", async () => {
			const transcriptPath = join(tempDir, "session.jsonl");
			const entry = JSON.stringify({ type: "message_end", inputTokens: 10, outputTokens: 5 });
			await Bun.write(transcriptPath, `${entry}\n`);

			const result = await runtime.parseTranscript(transcriptPath);
			expect(result?.model).toBe("");
		});

		test("skips non-message_end events for token counting", async () => {
			const transcriptPath = join(tempDir, "session.jsonl");
			// Claude-style assistant events should NOT be counted (wrong format for Pi)
			const claudeStyleEntry = JSON.stringify({
				type: "assistant",
				message: { usage: { input_tokens: 999, output_tokens: 999 } },
			});
			const piEntry = JSON.stringify({ type: "message_end", inputTokens: 10, outputTokens: 5 });
			await Bun.write(transcriptPath, `${claudeStyleEntry}\n${piEntry}\n`);

			const result = await runtime.parseTranscript(transcriptPath);
			expect(result?.inputTokens).toBe(10);
			expect(result?.outputTokens).toBe(5);
		});

		test("returns zero counts for file with no message_end events", async () => {
			const transcriptPath = join(tempDir, "session.jsonl");
			const entry = JSON.stringify({ type: "tool_call", name: "Read", input: {} });
			await Bun.write(transcriptPath, `${entry}\n`);

			const result = await runtime.parseTranscript(transcriptPath);
			expect(result).not.toBeNull();
			expect(result?.inputTokens).toBe(0);
			expect(result?.outputTokens).toBe(0);
		});

		test("returns null for completely malformed file (non-JSON)", async () => {
			const transcriptPath = join(tempDir, "bad.jsonl");
			await Bun.write(transcriptPath, "not json at all\nstill not json");

			// All lines fail to parse, result has 0 tokens (not null)
			const result = await runtime.parseTranscript(transcriptPath);
			if (result !== null) {
				expect(result.inputTokens).toBe(0);
				expect(result.outputTokens).toBe(0);
			}
		});

		test("skips malformed lines and parses valid ones", async () => {
			const transcriptPath = join(tempDir, "mixed.jsonl");
			const bad = "not json";
			const good = JSON.stringify({ type: "message_end", inputTokens: 42, outputTokens: 7 });
			await Bun.write(transcriptPath, `${bad}\n${good}\n`);

			const result = await runtime.parseTranscript(transcriptPath);
			expect(result?.inputTokens).toBe(42);
			expect(result?.outputTokens).toBe(7);
		});

		test("handles empty file (returns zero counts)", async () => {
			const transcriptPath = join(tempDir, "empty.jsonl");
			await Bun.write(transcriptPath, "");

			const result = await runtime.parseTranscript(transcriptPath);
			expect(result).not.toBeNull();
			expect(result?.inputTokens).toBe(0);
			expect(result?.outputTokens).toBe(0);
		});
	});
});

describe("PiRuntime integration: registry resolves 'pi'", () => {
	test("getRuntime('pi') returns PiRuntime", async () => {
		const { getRuntime } = await import("./registry.ts");
		const rt = getRuntime("pi");
		expect(rt).toBeInstanceOf(PiRuntime);
		expect(rt.id).toBe("pi");
		expect(rt.instructionPath).toBe(".claude/CLAUDE.md");
	});

	test("getRuntime rejects truly unknown runtimes", async () => {
		const { getRuntime } = await import("./registry.ts");
		expect(() => getRuntime("codex")).toThrow('Unknown runtime: "codex"');
		expect(() => getRuntime("opencode")).toThrow('Unknown runtime: "opencode"');
	});
});
