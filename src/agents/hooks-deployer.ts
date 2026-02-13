import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { AgentError } from "../errors.ts";

/**
 * Capabilities that must never modify project files.
 * Includes read-only roles (scout, reviewer) and coordination roles (lead).
 * Only "builder" and "merger" are allowed to modify files.
 */
const NON_IMPLEMENTATION_CAPABILITIES = new Set([
	"scout",
	"reviewer",
	"lead",
	"coordinator",
	"supervisor",
	"monitor",
]);

/**
 * Capabilities that coordinate work and need git add/commit for syncing
 * beads, mulch, and other metadata — but must NOT git push.
 */
const COORDINATION_CAPABILITIES = new Set(["coordinator", "supervisor", "monitor"]);

/**
 * Additional safe Bash prefixes for coordination capabilities.
 * Allows git add/commit for beads sync, mulch records, etc.
 * git push remains blocked via DANGEROUS_BASH_PATTERNS.
 */
const COORDINATION_SAFE_PREFIXES = ["git add", "git commit"];

/**
 * Claude Code native team/task tools that bypass overstory orchestration.
 * All overstory agents must use `overstory sling` for delegation, not these.
 */
const NATIVE_TEAM_TOOLS = [
	"Task",
	"TeamCreate",
	"TeamDelete",
	"SendMessage",
	"TaskCreate",
	"TaskUpdate",
	"TaskList",
	"TaskGet",
	"TaskOutput",
	"TaskStop",
];

/** Tools that non-implementation agents must not use. */
const WRITE_TOOLS = ["Write", "Edit", "NotebookEdit"];

/** Canonical branch names that agents must never push to directly. */
const CANONICAL_BRANCHES = ["main", "master"];

/**
 * Bash commands that modify files and must be blocked for non-implementation agents.
 * Each pattern is a regex fragment used inside a grep -qE check.
 */
const DANGEROUS_BASH_PATTERNS = [
	"sed\\s+-i",
	"sed\\s+--in-place",
	"echo\\s+.*>",
	"printf\\s+.*>",
	"cat\\s+.*>",
	"tee\\s",
	"\\bvim\\b",
	"\\bnano\\b",
	"\\bvi\\b",
	"\\bmv\\s",
	"\\bcp\\s",
	"\\brm\\s",
	"\\bmkdir\\s",
	"\\btouch\\s",
	"\\bchmod\\s",
	"\\bchown\\s",
	">>",
	"\\bgit\\s+add\\b",
	"\\bgit\\s+commit\\b",
	"\\bgit\\s+merge\\b",
	"\\bgit\\s+push\\b",
	"\\bgit\\s+reset\\b",
	"\\bgit\\s+checkout\\b",
	"\\bgit\\s+rebase\\b",
	"\\bgit\\s+stash\\b",
	"\\bnpm\\s+install\\b",
	"\\bbun\\s+install\\b",
	"\\bbun\\s+add\\b",
	// Runtime eval flags — bypass shell pattern guards by executing JS/Python directly
	"\\bbun\\s+-e\\b",
	"\\bbun\\s+--eval\\b",
	"\\bnode\\s+-e\\b",
	"\\bnode\\s+--eval\\b",
	"\\bdeno\\s+eval\\b",
	"\\bpython3?\\s+-c\\b",
	"\\bperl\\s+-e\\b",
	"\\bruby\\s+-e\\b",
];

/**
 * Bash commands that are always safe for non-implementation agents.
 * If a command starts with any of these prefixes, it bypasses the dangerous command check.
 * This whitelist is checked BEFORE the blocklist.
 */
const SAFE_BASH_PREFIXES = [
	"overstory ",
	"bd ",
	"git status",
	"git log",
	"git diff",
	"git show",
	"git blame",
	"git branch",
	"mulch ",
	"bun test",
	"bun run lint",
	"bun run typecheck",
	"bun run biome",
];

/** Hook entry shape matching Claude Code's settings.local.json format. */
interface HookEntry {
	matcher: string;
	hooks: Array<{ type: string; command: string }>;
}

/**
 * Resolve the path to the hooks template file.
 * The template lives at `templates/hooks.json.tmpl` relative to the repo root.
 */
function getTemplatePath(): string {
	// src/agents/hooks-deployer.ts -> repo root is ../../
	return join(dirname(import.meta.dir), "..", "templates", "hooks.json.tmpl");
}

/**
 * Env var guard prefix for hook commands.
 *
 * When hooks are deployed to the project root (e.g. for the coordinator),
 * they affect ALL Claude Code sessions in that directory. This prefix
 * ensures hooks only activate for overstory-managed agent sessions
 * (which have OVERSTORY_AGENT_NAME set in their environment) and are
 * no-ops for the user's own Claude Code session.
 */
const ENV_GUARD = '[ -z "$OVERSTORY_AGENT_NAME" ] && exit 0;';

/**
 * Build a PreToolUse guard that blocks a specific tool.
 *
 * Returns a JSON response with decision=block so Claude Code rejects
 * the tool call before execution.
 */
function blockGuard(toolName: string, reason: string): HookEntry {
	const response = JSON.stringify({ decision: "block", reason });
	return {
		matcher: toolName,
		hooks: [
			{
				type: "command",
				command: `${ENV_GUARD} echo '${response}'`,
			},
		],
	};
}

/**
 * Build a Bash guard script that inspects the command from stdin JSON.
 *
 * Claude Code PreToolUse hooks receive `{"tool_name": "Bash", "tool_input": {"command": "..."}, ...}` on stdin.
 * This builds a bash script that reads stdin, extracts the command, and checks for
 * dangerous patterns (push to canonical branch, hard reset, wrong branch naming).
 */
function buildBashGuardScript(agentName: string): string {
	const canonicalPattern = CANONICAL_BRANCHES.join("|");
	// The script reads JSON from stdin, extracts the command field, then checks patterns.
	// Uses parameter expansion to avoid requiring jq (zero runtime deps).
	const script = [
		// Only enforce for overstory agent sessions (skip for user's own Claude Code)
		ENV_GUARD,
		"read -r INPUT;",
		// Extract command value from JSON — grab everything after "command": (with optional space)
		'CMD=$(echo "$INPUT" | sed \'s/.*"command": *"\\([^"]*\\)".*/\\1/\');',
		// Check 1: Block git push to canonical branches
		`if echo "$CMD" | grep -qE 'git\\s+push\\s+\\S+\\s+(${canonicalPattern})'; then`,
		`  echo '{"decision":"block","reason":"Agents must not push to canonical branch (${CANONICAL_BRANCHES.join("/")})"}';`,
		"  exit 0;",
		"fi;",
		// Check 2: Block git reset --hard
		"if echo \"$CMD\" | grep -qE 'git\\s+reset\\s+--hard'; then",
		'  echo \'{"decision":"block","reason":"git reset --hard is not allowed — it destroys uncommitted work"}\';',
		"  exit 0;",
		"fi;",
		// Check 3: Warn on git checkout -b with wrong naming convention
		"if echo \"$CMD\" | grep -qE 'git\\s+checkout\\s+-b\\s'; then",
		`  BRANCH=$(echo "$CMD" | sed 's/.*git\\s*checkout\\s*-b\\s*\\([^ ]*\\).*/\\1/');`,
		`  if ! echo "$BRANCH" | grep -qE '^overstory/${agentName}/'; then`,
		`    echo '{"decision":"block","reason":"Branch must follow overstory/${agentName}/{bead-id} convention"}';`,
		"    exit 0;",
		"  fi;",
		"fi;",
	].join(" ");
	return script;
}

/**
 * Generate Bash-level PreToolUse guards for dangerous operations.
 *
 * Applied to ALL agent capabilities. Inspects Bash tool commands for:
 * - `git push` to canonical branches (main/master) — blocked
 * - `git reset --hard` — blocked
 * - `git checkout -b` with non-standard branch naming — blocked
 *
 * @param agentName - The agent name, used for branch naming validation
 */
export function getDangerGuards(agentName: string): HookEntry[] {
	return [
		{
			matcher: "Bash",
			hooks: [
				{
					type: "command",
					command: buildBashGuardScript(agentName),
				},
			],
		},
	];
}

/**
 * Build a Bash guard script that blocks file-modifying commands for non-implementation agents.
 *
 * Uses a whitelist-first approach: if the command matches a known-safe prefix, it passes.
 * Otherwise, it checks against dangerous patterns and blocks if any match.
 *
 * @param capability - The agent capability, included in block reason messages
 * @param extraSafePrefixes - Additional safe prefixes for this capability (e.g. git add/commit for coordinators)
 */
export function buildBashFileGuardScript(
	capability: string,
	extraSafePrefixes: string[] = [],
): string {
	// Build the safe prefix check: if command starts with any safe prefix, allow it
	const allSafePrefixes = [...SAFE_BASH_PREFIXES, ...extraSafePrefixes];
	const safePrefixChecks = allSafePrefixes
		.map((prefix) => `if echo "$CMD" | grep -qE '^\\s*${prefix}'; then exit 0; fi;`)
		.join(" ");

	// Build the dangerous pattern check
	const dangerPattern = DANGEROUS_BASH_PATTERNS.join("|");

	const script = [
		// Only enforce for overstory agent sessions (skip for user's own Claude Code)
		ENV_GUARD,
		"read -r INPUT;",
		// Extract command value from JSON (with optional space after colon)
		'CMD=$(echo "$INPUT" | sed \'s/.*"command": *"\\([^"]*\\)".*/\\1/\');',
		// First: whitelist safe commands
		safePrefixChecks,
		// Then: check for dangerous patterns
		`if echo "$CMD" | grep -qE '${dangerPattern}'; then`,
		`  echo '{"decision":"block","reason":"${capability} agents cannot modify files — this command is not allowed"}';`,
		"  exit 0;",
		"fi;",
	].join(" ");
	return script;
}

/**
 * Generate capability-specific PreToolUse guards.
 *
 * Non-implementation capabilities (scout, reviewer, lead, coordinator, supervisor, monitor) get:
 * - Write, Edit, NotebookEdit tool blocks
 * - Bash file-modification command guards (sed -i, echo >, mv, rm, etc.)
 * - Coordination capabilities (coordinator, supervisor) get git add/commit whitelisted
 *
 * All overstory-managed agents get:
 * - Claude Code native team/task tool blocks (Task, TeamCreate, SendMessage, etc.)
 *   to ensure delegation goes through overstory sling
 *
 * Implementation capabilities (builder, merger) get only the native team tool blocks
 * beyond the universal danger guards from getDangerGuards().
 *
 * Note: All capabilities also receive Bash danger guards via getDangerGuards().
 */
export function getCapabilityGuards(capability: string): HookEntry[] {
	const guards: HookEntry[] = [];

	// Block Claude Code native team/task tools for ALL overstory agents.
	// Agents must use `overstory sling` for delegation, not native Task/Team tools.
	const teamToolGuards = NATIVE_TEAM_TOOLS.map((tool) =>
		blockGuard(
			tool,
			`Overstory agents must use 'overstory sling' for delegation — ${tool} is not allowed`,
		),
	);
	guards.push(...teamToolGuards);

	if (NON_IMPLEMENTATION_CAPABILITIES.has(capability)) {
		const toolGuards = WRITE_TOOLS.map((tool) =>
			blockGuard(tool, `${capability} agents cannot modify files — ${tool} is not allowed`),
		);
		guards.push(...toolGuards);

		// Coordination capabilities get git add/commit whitelisted for beads/mulch sync
		const extraSafe = COORDINATION_CAPABILITIES.has(capability) ? COORDINATION_SAFE_PREFIXES : [];
		const bashFileGuard: HookEntry = {
			matcher: "Bash",
			hooks: [
				{
					type: "command",
					command: buildBashFileGuardScript(capability, extraSafe),
				},
			],
		};
		guards.push(bashFileGuard);
	}

	return guards;
}

/**
 * Deploy hooks config to an agent's worktree as `.claude/settings.local.json`.
 *
 * Reads `templates/hooks.json.tmpl`, replaces `{{AGENT_NAME}}`, then merges
 * capability-specific PreToolUse guards into the resulting config.
 *
 * @param worktreePath - Absolute path to the agent's git worktree
 * @param agentName - The unique name of the agent
 * @param capability - Agent capability (builder, scout, reviewer, lead, merger)
 * @throws {AgentError} If the template is not found or the write fails
 */
export async function deployHooks(
	worktreePath: string,
	agentName: string,
	capability = "builder",
): Promise<void> {
	const templatePath = getTemplatePath();
	const file = Bun.file(templatePath);
	const exists = await file.exists();

	if (!exists) {
		throw new AgentError(`Hooks template not found: ${templatePath}`, {
			agentName,
		});
	}

	let template: string;
	try {
		template = await file.text();
	} catch (err) {
		throw new AgentError(`Failed to read hooks template: ${templatePath}`, {
			agentName,
			cause: err instanceof Error ? err : undefined,
		});
	}

	// Replace all occurrences of {{AGENT_NAME}}
	let content = template;
	while (content.includes("{{AGENT_NAME}}")) {
		content = content.replace("{{AGENT_NAME}}", agentName);
	}

	// Parse the base config and merge guards into PreToolUse
	const config = JSON.parse(content) as { hooks: Record<string, HookEntry[]> };
	const dangerGuards = getDangerGuards(agentName);
	const capabilityGuards = getCapabilityGuards(capability);
	const allGuards = [...dangerGuards, ...capabilityGuards];

	if (allGuards.length > 0) {
		const preToolUse = config.hooks.PreToolUse ?? [];
		config.hooks.PreToolUse = [...allGuards, ...preToolUse];
	}

	const finalContent = `${JSON.stringify(config, null, "\t")}\n`;

	const claudeDir = join(worktreePath, ".claude");
	const outputPath = join(claudeDir, "settings.local.json");

	try {
		await mkdir(claudeDir, { recursive: true });
	} catch (err) {
		throw new AgentError(`Failed to create .claude/ directory at: ${claudeDir}`, {
			agentName,
			cause: err instanceof Error ? err : undefined,
		});
	}

	try {
		await Bun.write(outputPath, finalContent);
	} catch (err) {
		throw new AgentError(`Failed to write hooks config to: ${outputPath}`, {
			agentName,
			cause: err instanceof Error ? err : undefined,
		});
	}
}
