import { describe, expect, test } from "bun:test";
import { INTERACTIVE_TOOLS, NATIVE_TEAM_TOOLS } from "../agents/guard-rules.ts";
import { generatePiGuardExtension } from "./pi-guards.ts";
import type { HooksDef } from "./types.ts";

const WORKTREE = "/project/.overstory/worktrees/test-agent";

function builderHooks(name = "test-builder"): HooksDef {
	return { agentName: name, capability: "builder", worktreePath: WORKTREE };
}

function scoutHooks(name = "test-scout"): HooksDef {
	return { agentName: name, capability: "scout", worktreePath: WORKTREE };
}

function coordinatorHooks(name = "test-coordinator"): HooksDef {
	return { agentName: name, capability: "coordinator", worktreePath: WORKTREE };
}

describe("generatePiGuardExtension", () => {
	describe("header and identity", () => {
		test("embeds agent name in generated code", () => {
			const generated = generatePiGuardExtension(builderHooks("my-builder"));
			expect(generated).toContain('const AGENT_NAME = "my-builder";');
		});

		test("embeds worktree path in generated code", () => {
			const generated = generatePiGuardExtension(builderHooks());
			expect(generated).toContain(`const WORKTREE_PATH = "${WORKTREE}";`);
		});

		test("embeds capability in file header comment", () => {
			const generated = generatePiGuardExtension(builderHooks());
			expect(generated).toContain("Capability: builder");
		});

		test("imports Pi Extension type", () => {
			const generated = generatePiGuardExtension(builderHooks());
			expect(generated).toContain(
				'import type { Extension } from "@mariozechner/pi-coding-agent";',
			);
		});

		test("exports a default Pi Extension factory", () => {
			const generated = generatePiGuardExtension(builderHooks());
			expect(generated).toContain("export default (): Extension => ({");
			expect(generated).toContain("tool_call: async (event) => {");
		});
	});

	describe("BLOCKED_TOOLS — native team tools and interactive tools (all capabilities)", () => {
		test("all NATIVE_TEAM_TOOLS appear in BLOCKED_TOOLS for builder", () => {
			const generated = generatePiGuardExtension(builderHooks());
			const blockedSection = extractBlockedToolsSection(generated);
			for (const tool of NATIVE_TEAM_TOOLS) {
				expect(blockedSection).toContain(`"${tool}"`);
			}
		});

		test("all INTERACTIVE_TOOLS appear in BLOCKED_TOOLS for builder", () => {
			const generated = generatePiGuardExtension(builderHooks());
			const blockedSection = extractBlockedToolsSection(generated);
			for (const tool of INTERACTIVE_TOOLS) {
				expect(blockedSection).toContain(`"${tool}"`);
			}
		});

		test("BLOCKED_TOOLS check uses has() for efficiency", () => {
			const generated = generatePiGuardExtension(builderHooks());
			expect(generated).toContain("BLOCKED_TOOLS.has(event.name)");
		});
	});

	describe("Builder — implementation capability", () => {
		test("write tools are NOT in BLOCKED_TOOLS for builder", () => {
			const generated = generatePiGuardExtension(builderHooks());
			const blockedSection = extractBlockedToolsSection(generated);
			expect(blockedSection).not.toContain('"Write"');
			expect(blockedSection).not.toContain('"Edit"');
			expect(blockedSection).not.toContain('"NotebookEdit"');
		});

		test("has FILE_MODIFYING_PATTERNS section", () => {
			const generated = generatePiGuardExtension(builderHooks());
			expect(generated).toContain("FILE_MODIFYING_PATTERNS.some");
		});

		test("has SAFE_PREFIXES array", () => {
			const generated = generatePiGuardExtension(builderHooks());
			expect(generated).toContain("const SAFE_PREFIXES =");
		});

		test("does NOT have DANGEROUS_PATTERNS blocklist guard", () => {
			const generated = generatePiGuardExtension(builderHooks());
			expect(generated).not.toContain("DANGEROUS_PATTERNS.some");
		});

		test("Bash path boundary check for file-modifying commands", () => {
			const generated = generatePiGuardExtension(builderHooks());
			expect(generated).toContain("FILE_MODIFYING_PATTERNS.some((re) => re.test(cmd))");
			expect(generated).toContain("Bash path boundary violation");
		});
	});

	describe("Scout — non-implementation capability", () => {
		test("write tools ARE in BLOCKED_TOOLS for scout (WRITE_BLOCKED)", () => {
			const generated = generatePiGuardExtension(scoutHooks());
			const blockedSection = extractBlockedToolsSection(generated);
			expect(blockedSection).toContain('"Write"');
			expect(blockedSection).toContain('"Edit"');
			expect(blockedSection).toContain('"NotebookEdit"');
		});

		test("has whitelist+blocklist pattern (SAFE_PREFIXES then DANGEROUS_PATTERNS)", () => {
			const generated = generatePiGuardExtension(scoutHooks());
			expect(generated).toContain("SAFE_PREFIXES.some((p) => cmd.startsWith(p))");
			expect(generated).toContain("DANGEROUS_PATTERNS.some((re) => re.test(cmd))");
		});

		test("SAFE_PREFIXES check comes before DANGEROUS_PATTERNS check", () => {
			const generated = generatePiGuardExtension(scoutHooks());
			const safeIdx = generated.indexOf("SAFE_PREFIXES.some");
			const dangerIdx = generated.indexOf("DANGEROUS_PATTERNS.some");
			expect(safeIdx).toBeGreaterThan(-1);
			expect(dangerIdx).toBeGreaterThan(-1);
			expect(safeIdx).toBeLessThan(dangerIdx);
		});

		test("does NOT have FILE_MODIFYING_PATTERNS guard", () => {
			const generated = generatePiGuardExtension(scoutHooks());
			expect(generated).not.toContain("FILE_MODIFYING_PATTERNS.some");
		});

		test("block reason references capability name", () => {
			const generated = generatePiGuardExtension(scoutHooks());
			expect(generated).toContain("scout agents cannot modify files");
		});
	});

	describe("Coordinator — coordination capability", () => {
		test("safe prefixes include git add and git commit", () => {
			const generated = generatePiGuardExtension(coordinatorHooks());
			const safePrefixesSection = extractSafePrefixesSection(generated);
			expect(safePrefixesSection).toContain('"git add"');
			expect(safePrefixesSection).toContain('"git commit"');
		});

		test("write tools are in BLOCKED_TOOLS (coordination is non-implementation)", () => {
			const generated = generatePiGuardExtension(coordinatorHooks());
			const blockedSection = extractBlockedToolsSection(generated);
			expect(blockedSection).toContain('"Write"');
		});

		test("builder does NOT have git add/commit in safe prefixes", () => {
			const generated = generatePiGuardExtension(builderHooks());
			const safePrefixesSection = extractSafePrefixesSection(generated);
			expect(safePrefixesSection).not.toContain('"git add"');
			expect(safePrefixesSection).not.toContain('"git commit"');
		});
	});

	describe("path boundary guards (all capabilities)", () => {
		test("WRITE_SCOPE_TOOLS constant is always present", () => {
			for (const hooks of [builderHooks(), scoutHooks(), coordinatorHooks()]) {
				const generated = generatePiGuardExtension(hooks);
				expect(generated).toContain(
					'const WRITE_SCOPE_TOOLS = new Set<string>(["Write", "Edit", "NotebookEdit"]);',
				);
			}
		});

		test("path boundary check uses WORKTREE_PATH", () => {
			const generated = generatePiGuardExtension(builderHooks());
			expect(generated).toContain("filePath.startsWith(WORKTREE_PATH)");
		});

		test("path boundary checks file_path and notebook_path fields", () => {
			const generated = generatePiGuardExtension(builderHooks());
			expect(generated).toContain("file_path");
			expect(generated).toContain("notebook_path");
		});

		test("path boundary block reason is clear", () => {
			const generated = generatePiGuardExtension(builderHooks());
			expect(generated).toContain(
				"Path boundary violation: file is outside your assigned worktree",
			);
		});
	});

	describe("universal Bash danger guards (all capabilities)", () => {
		test("blocks git push for builder", () => {
			const generated = generatePiGuardExtension(builderHooks());
			expect(generated).toContain("git push is blocked");
		});

		test("blocks git push for scout", () => {
			const generated = generatePiGuardExtension(scoutHooks());
			expect(generated).toContain("git push is blocked");
		});

		test("blocks git reset --hard", () => {
			const generated = generatePiGuardExtension(builderHooks());
			expect(generated).toContain("git reset --hard is not allowed");
		});

		test("enforces branch naming convention using AGENT_NAME", () => {
			const generated = generatePiGuardExtension(builderHooks("my-agent"));
			// These strings intentionally contain literal ${...} — they appear in the generated code
			// as template literal expressions, not as interpolations in this test file.
			expect(generated).toContain("overstory/$" + "{AGENT_NAME}/");
			expect(generated).toContain(
				"Branch must follow overstory/$" + "{AGENT_NAME}/{task-id} convention",
			);
		});

		test("bash guard matches both Bash and bash tool names", () => {
			const generated = generatePiGuardExtension(builderHooks());
			expect(generated).toContain('event.name === "Bash"');
			expect(generated).toContain('event.name === "bash"');
		});
	});

	describe("quality gate prefixes", () => {
		test("custom quality gate commands appear in SAFE_PREFIXES", () => {
			const hooks: HooksDef = {
				agentName: "test-reviewer",
				capability: "reviewer",
				worktreePath: WORKTREE,
				qualityGates: [
					{ name: "Tests", command: "bun test", description: "all tests must pass" },
					{ name: "Lint", command: "bun run lint", description: "lint clean" },
				],
			};
			const generated = generatePiGuardExtension(hooks);
			const safePrefixesSection = extractSafePrefixesSection(generated);
			expect(safePrefixesSection).toContain('"bun test"');
			expect(safePrefixesSection).toContain('"bun run lint"');
		});

		test("default quality gates provide SAFE_PREFIXES entries", () => {
			// Without custom gates, DEFAULT_QUALITY_GATES are used
			const generated = generatePiGuardExtension(scoutHooks());
			expect(generated).toContain("const SAFE_PREFIXES =");
			// bun test is the default quality gate command
			const safePrefixesSection = extractSafePrefixesSection(generated);
			expect(safePrefixesSection).toContain('"bun test"');
		});
	});

	describe("generated code is self-contained", () => {
		test("output is non-empty TypeScript string", () => {
			const generated = generatePiGuardExtension(builderHooks());
			expect(typeof generated).toBe("string");
			expect(generated.length).toBeGreaterThan(500);
		});

		test("output ends with newline", () => {
			const generated = generatePiGuardExtension(builderHooks());
			expect(generated.endsWith("\n")).toBe(true);
		});

		test("DANGEROUS_PATTERNS constant is always present", () => {
			const generated = generatePiGuardExtension(builderHooks());
			expect(generated).toContain("const DANGEROUS_PATTERNS =");
		});

		test("FILE_MODIFYING_PATTERNS constant is always present", () => {
			const generated = generatePiGuardExtension(builderHooks());
			expect(generated).toContain("const FILE_MODIFYING_PATTERNS =");
		});

		test("returns { type: 'allow' } as default", () => {
			const generated = generatePiGuardExtension(builderHooks());
			expect(generated).toContain('return { type: "allow" };');
		});

		test("uses String() for safe property access on event.input", () => {
			const generated = generatePiGuardExtension(builderHooks());
			expect(generated).toContain("String(");
			expect(generated).toContain("event.input as Record<string, unknown>");
		});

		test("deterministic output for same inputs", () => {
			const hooks = builderHooks("consistent-builder");
			const g1 = generatePiGuardExtension(hooks);
			const g2 = generatePiGuardExtension(hooks);
			expect(g1).toBe(g2);
		});
	});
});

// --- Helpers ---

/**
 * Extract the BLOCKED_TOOLS Set literal section from generated code.
 * Returns the text between "BLOCKED_TOOLS = new Set" and the first "]);"
 * after that point.
 */
function extractBlockedToolsSection(generated: string): string {
	const start = generated.indexOf("BLOCKED_TOOLS = new Set");
	const end = generated.indexOf("]);", start);
	if (start === -1 || end === -1) return "";
	return generated.slice(start, end + 3);
}

/**
 * Extract the SAFE_PREFIXES array literal section from generated code.
 * Returns the text between "SAFE_PREFIXES =" and the next "];"
 */
function extractSafePrefixesSection(generated: string): string {
	const start = generated.indexOf("const SAFE_PREFIXES =");
	const end = generated.indexOf("];", start);
	if (start === -1 || end === -1) return "";
	return generated.slice(start, end + 2);
}
