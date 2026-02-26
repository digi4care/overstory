import { describe, expect, it } from "bun:test";
import type { OverstoryConfig } from "../types.ts";
import { ClaudeRuntime } from "./claude.ts";
import { getRuntime } from "./registry.ts";

describe("getRuntime", () => {
	it("returns a ClaudeRuntime by default (no args)", () => {
		const runtime = getRuntime();
		expect(runtime).toBeInstanceOf(ClaudeRuntime);
		expect(runtime.id).toBe("claude");
	});

	it('returns a ClaudeRuntime when name is "claude"', () => {
		const runtime = getRuntime("claude");
		expect(runtime).toBeInstanceOf(ClaudeRuntime);
		expect(runtime.id).toBe("claude");
	});

	it("throws with a helpful message for an unknown runtime", () => {
		expect(() => getRuntime("unknown-runtime")).toThrow(
			'Unknown runtime: "unknown-runtime". Available: claude',
		);
	});

	it("uses config.runtime.default when name is omitted", () => {
		const config = { runtime: { default: "claude" } } as OverstoryConfig;
		const runtime = getRuntime(undefined, config);
		expect(runtime).toBeInstanceOf(ClaudeRuntime);
		expect(runtime.id).toBe("claude");
	});

	it("explicit name overrides config.runtime.default", () => {
		const config = { runtime: { default: "claude" } } as OverstoryConfig;
		// Both are "claude" here since that's the only registered runtime,
		// but the name arg takes precedence over config.
		const runtime = getRuntime("claude", config);
		expect(runtime).toBeInstanceOf(ClaudeRuntime);
	});

	it("throws for unknown runtime even when config default is set", () => {
		const config = { runtime: { default: "codex" } } as OverstoryConfig;
		// No name arg — falls back to config default "codex" which is unknown.
		expect(() => getRuntime(undefined, config)).toThrow(
			'Unknown runtime: "codex". Available: claude',
		);
	});

	it("returns a new instance on each call (factory pattern)", () => {
		const a = getRuntime();
		const b = getRuntime();
		expect(a).not.toBe(b);
	});
});
