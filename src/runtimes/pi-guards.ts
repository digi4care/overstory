// Pi runtime guard extension generator.
// Generates self-contained TypeScript code for .pi/extensions/overstory-guard.ts.
// Pi's extension system intercepts tool_call events and can return { type: "block" }
// to prevent tool execution — equivalent to Claude Code's PreToolUse hooks.

import {
	DANGEROUS_BASH_PATTERNS,
	INTERACTIVE_TOOLS,
	NATIVE_TEAM_TOOLS,
	SAFE_BASH_PREFIXES,
	WRITE_TOOLS,
} from "../agents/guard-rules.ts";
import { extractQualityGatePrefixes } from "../agents/hooks-deployer.ts";
import { DEFAULT_QUALITY_GATES } from "../config.ts";
import type { HooksDef } from "./types.ts";

/** Capabilities that must not modify project files. */
const NON_IMPLEMENTATION_CAPABILITIES = new Set([
	"scout",
	"reviewer",
	"lead",
	"coordinator",
	"supervisor",
	"monitor",
]);

/** Coordination capabilities that get git add/commit whitelisted for metadata sync. */
const COORDINATION_CAPABILITIES = new Set(["coordinator", "supervisor", "monitor"]);

/**
 * Bash patterns that modify files and require path boundary validation.
 * Mirrors FILE_MODIFYING_BASH_PATTERNS in hooks-deployer.ts (not exported, duplicated here).
 * Applied to implementation agents (builder/merger) only.
 */
const FILE_MODIFYING_BASH_PATTERNS = [
	"sed\\s+-i",
	"sed\\s+--in-place",
	"echo\\s+.*>",
	"printf\\s+.*>",
	"cat\\s+.*>",
	"tee\\s",
	"\\bmv\\s",
	"\\bcp\\s",
	"\\brm\\s",
	"\\bmkdir\\s",
	"\\btouch\\s",
	"\\bchmod\\s",
	"\\bchown\\s",
	">>",
	"\\binstall\\s",
	"\\brsync\\s",
];

/** Serialize a string array as a TypeScript Set<string> literal (tab-indented entries). */
function toSetLiteral(items: string[]): string {
	if (items.length === 0) return "new Set<string>([])";
	const entries = items.map((s) => `\t"${s}",`).join("\n");
	return `new Set<string>([\n${entries}\n])`;
}

/** Serialize a string array as a TypeScript string[] literal (tab-indented entries). */
function toStringArrayLiteral(items: string[]): string {
	if (items.length === 0) return "[]";
	const entries = items.map((s) => `\t"${s}",`).join("\n");
	return `[\n${entries}\n]`;
}

/**
 * Serialize grep -qE pattern strings as a TypeScript RegExp[] literal.
 * Pattern strings use \\b/\\s double-escaping: their string values (\b/\s) map
 * directly to JavaScript regex word boundary/whitespace tokens.
 */
function toRegExpArrayLiteral(patterns: string[]): string {
	if (patterns.length === 0) return "[]";
	const entries = patterns.map((p) => `\t/${p}/,`).join("\n");
	return `[\n${entries}\n]`;
}

/**
 * Generate a self-contained TypeScript guard extension for Pi's extension system.
 *
 * The returned string is ready to write as `.pi/extensions/overstory-guard.ts`.
 * Pi loads this file and calls `tool_call` before each tool execution,
 * allowing overstory guards to enforce the same security policies as
 * Claude Code's `settings.local.json` PreToolUse hooks.
 *
 * Guard order (per AgentRuntime spec):
 * 1. Block NATIVE_TEAM_TOOLS + INTERACTIVE_TOOLS (all agents).
 * 2. Block WRITE_TOOLS for non-implementation capabilities.
 * 3. Path boundary on Write/Edit/NotebookEdit (all agents, defense-in-depth).
 * 4. Universal Bash danger guards: git push, reset --hard, wrong branch naming.
 * 5a. Non-implementation agents: safe prefix whitelist then dangerous pattern blocklist.
 * 5b. Implementation agents (builder/merger): file-modifying bash path boundary.
 * 6. Default allow.
 *
 * @param hooks - Agent identity, capability, worktree path, and optional quality gates.
 * @returns Self-contained TypeScript source code for the Pi guard extension file.
 */
export function generatePiGuardExtension(hooks: HooksDef): string {
	const { agentName, capability, worktreePath, qualityGates } = hooks;
	const gates = qualityGates ?? DEFAULT_QUALITY_GATES;
	const gatePrefixes = extractQualityGatePrefixes(gates);

	const isNonImpl = NON_IMPLEMENTATION_CAPABILITIES.has(capability);
	const isCoordination = COORDINATION_CAPABILITIES.has(capability);

	// Build blocked tools: team tools + interactive tools for all agents,
	// plus write tools for non-implementation capabilities.
	const blockedTools: string[] = [
		...NATIVE_TEAM_TOOLS,
		...INTERACTIVE_TOOLS,
		...(isNonImpl ? WRITE_TOOLS : []),
	];

	// Build safe Bash prefixes: base set + coordination extras + quality gate commands.
	const safePrefixes: string[] = [
		...SAFE_BASH_PREFIXES,
		...(isCoordination ? ["git add", "git commit"] : []),
		...gatePrefixes,
	];

	const blockedToolsCode = toSetLiteral(blockedTools);
	const safePrefixesCode = toStringArrayLiteral(safePrefixes);
	const dangerousPatternsCode = toRegExpArrayLiteral(DANGEROUS_BASH_PATTERNS);
	const fileModifyingPatternsCode = toRegExpArrayLiteral(FILE_MODIFYING_BASH_PATTERNS);

	// Capability-specific Bash guard section (mutually exclusive).
	const capabilityBashBlock = isNonImpl
		? [
				"",
				`\t\t\t// Non-implementation agents: whitelist safe prefixes, block dangerous patterns.`,
				`\t\t\tif (SAFE_PREFIXES.some((p) => cmd.startsWith(p))) {`,
				`\t\t\t\treturn { type: "allow" };`,
				`\t\t\t}`,
				`\t\t\tif (DANGEROUS_PATTERNS.some((re) => re.test(cmd))) {`,
				`\t\t\t\treturn {`,
				`\t\t\t\t\ttype: "block",`,
				`\t\t\t\t\treason: "${capability} agents cannot modify files — this command is not allowed",`,
				`\t\t\t\t};`,
				`\t\t\t}`,
			].join("\n")
		: [
				"",
				`\t\t\t// Implementation agents: path boundary on file-modifying Bash commands.`,
				`\t\t\tif (FILE_MODIFYING_PATTERNS.some((re) => re.test(cmd))) {`,
				`\t\t\t\tconst tokens = cmd.split(/\\s+/);`,
				`\t\t\t\tconst paths = tokens`,
				`\t\t\t\t\t.filter((t) => t.startsWith("/"))`,
				`\t\t\t\t\t.map((t) => t.replace(/[";>]*$/, ""));`,
				`\t\t\t\tfor (const p of paths) {`,
				`\t\t\t\t\tif (!p.startsWith("/dev/") && !p.startsWith("/tmp/") && !p.startsWith(WORKTREE_PATH)) {`,
				`\t\t\t\t\t\treturn {`,
				`\t\t\t\t\t\t\ttype: "block",`,
				`\t\t\t\t\t\t\treason: "Bash path boundary violation: command targets a path outside your worktree. All file modifications must stay within your assigned worktree.",`,
				`\t\t\t\t\t\t};`,
				`\t\t\t\t\t}`,
				`\t\t\t\t}`,
				`\t\t\t}`,
			].join("\n");

	const lines = [
		`// .pi/extensions/overstory-guard.ts`,
		`// Generated by overstory — do not edit manually.`,
		`// Agent: ${agentName} | Capability: ${capability}`,
		`import type { Extension } from "@mariozechner/pi-coding-agent";`,
		``,
		`const AGENT_NAME = "${agentName}";`,
		`const WORKTREE_PATH = "${worktreePath}";`,
		``,
		`// Tools blocked for this agent capability.`,
		`const BLOCKED_TOOLS = ${blockedToolsCode};`,
		``,
		`// Write-scope tools where path boundary is enforced (all agents, defense-in-depth).`,
		`const WRITE_SCOPE_TOOLS = new Set<string>(["Write", "Edit", "NotebookEdit"]);`,
		``,
		`// Safe Bash command prefixes — checked before the dangerous pattern blocklist.`,
		`const SAFE_PREFIXES = ${safePrefixesCode};`,
		``,
		`// Dangerous Bash patterns blocked for non-implementation agents.`,
		`const DANGEROUS_PATTERNS = ${dangerousPatternsCode};`,
		``,
		`// File-modifying Bash patterns requiring path boundary validation (implementation agents).`,
		`const FILE_MODIFYING_PATTERNS = ${fileModifyingPatternsCode};`,
		``,
		`export default (): Extension => ({`,
		`\ttool_call: async (event) => {`,
		`\t\t// 1. Block native team/task tools and interactive tools (all agents).`,
		`\t\tif (BLOCKED_TOOLS.has(event.name)) {`,
		`\t\t\treturn {`,
		`\t\t\t\ttype: "block",`,
		`\t\t\t\treason: \`Overstory agents must use 'ov sling' for delegation — \${event.name} is not allowed\`,`,
		`\t\t\t};`,
		`\t\t}`,
		``,
		`\t\t// 2. Path boundary enforcement for Write/Edit/NotebookEdit (all agents).`,
		`\t\tif (WRITE_SCOPE_TOOLS.has(event.name)) {`,
		`\t\t\tconst filePath = String(`,
		`\t\t\t\t(event.input as Record<string, unknown>)?.file_path ??`,
		`\t\t\t\t(event.input as Record<string, unknown>)?.notebook_path ??`,
		`\t\t\t\t"",`,
		`\t\t\t);`,
		`\t\t\tif (filePath && !filePath.startsWith(WORKTREE_PATH)) {`,
		`\t\t\t\treturn {`,
		`\t\t\t\t\ttype: "block",`,
		`\t\t\t\t\treason: "Path boundary violation: file is outside your assigned worktree. All writes must target files within your worktree.",`,
		`\t\t\t\t};`,
		`\t\t\t}`,
		`\t\t}`,
		``,
		`\t\t// 3. Bash command guards.`,
		`\t\tif (event.name === "Bash" || event.name === "bash") {`,
		`\t\t\tconst cmd = String((event.input as Record<string, unknown>)?.command ?? "");`,
		``,
		`\t\t\t// Universal danger guards (all agents).`,
		`\t\t\tif (/\\bgit\\s+push\\b/.test(cmd)) {`,
		`\t\t\t\treturn {`,
		`\t\t\t\t\ttype: "block",`,
		`\t\t\t\t\treason: "git push is blocked — use ov merge to integrate changes, push manually when ready",`,
		`\t\t\t\t};`,
		`\t\t\t}`,
		`\t\t\tif (/git\\s+reset\\s+--hard/.test(cmd)) {`,
		`\t\t\t\treturn {`,
		`\t\t\t\t\ttype: "block",`,
		`\t\t\t\t\treason: "git reset --hard is not allowed — it destroys uncommitted work",`,
		`\t\t\t\t};`,
		`\t\t\t}`,
		`\t\t\tconst branchMatch = /git\\s+checkout\\s+-b\\s+(\\S+)/.exec(cmd);`,
		`\t\t\tif (branchMatch) {`,
		`\t\t\t\tconst branch = branchMatch[1] ?? "";`,
		`\t\t\t\tif (!branch.startsWith(\`overstory/\${AGENT_NAME}/\`)) {`,
		`\t\t\t\t\treturn {`,
		`\t\t\t\t\t\ttype: "block",`,
		`\t\t\t\t\t\treason: \`Branch must follow overstory/\${AGENT_NAME}/{task-id} convention\`,`,
		`\t\t\t\t\t};`,
		`\t\t\t\t}`,
		`\t\t\t}`,
		capabilityBashBlock,
		`\t\t}`,
		``,
		`\t\treturn { type: "allow" };`,
		`\t},`,
		`});`,
		``,
	];

	return lines.join("\n");
}
