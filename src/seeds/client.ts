/**
 * Seeds (sd) CLI client.
 *
 * Wraps the `sd` command-line tool for issue tracking operations.
 * All commands use `--json` for parseable output. Seeds wraps responses
 * in a `{ success: bool, command: string, ...data }` envelope.
 * Uses Bun.spawn -- zero runtime dependencies.
 */

import { AgentError } from "../errors.ts";

/**
 * A seeds issue as returned by the sd CLI.
 * Defined locally since it comes from an external CLI tool.
 * Seeds uses consistent camelCase field names and a `type` field directly.
 */
export interface SeedIssue {
	id: string;
	title: string;
	status: string;
	priority: number;
	type: string;
	assignee?: string;
	description?: string;
	blocks?: string[];
	blockedBy?: string[];
}

export interface SeedsClient {
	/** List issues that are ready for work (open, unblocked). */
	ready(): Promise<SeedIssue[]>;

	/** Show details for a specific issue. */
	show(id: string): Promise<SeedIssue>;

	/** Create a new issue. Returns the new issue ID. */
	create(
		title: string,
		options?: { type?: string; priority?: number; description?: string },
	): Promise<string>;

	/** Claim an issue (mark as in_progress). */
	claim(id: string): Promise<void>;

	/** Close an issue with an optional reason. */
	close(id: string, reason?: string): Promise<void>;

	/** List issues with optional filters. */
	list(options?: { status?: string; limit?: number }): Promise<SeedIssue[]>;
}

/**
 * Run a shell command and capture its output.
 */
async function runCommand(
	cmd: string[],
	cwd: string,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
	const proc = Bun.spawn(cmd, {
		cwd,
		stdout: "pipe",
		stderr: "pipe",
	});
	const stdout = await new Response(proc.stdout).text();
	const stderr = await new Response(proc.stderr).text();
	const exitCode = await proc.exited;
	return { stdout, stderr, exitCode };
}

/**
 * Seeds JSON envelope returned by all `sd --json` commands.
 */
interface SeedsEnvelope {
	success: boolean;
	command: string;
}

/**
 * Parse JSON output from an sd command.
 * Unwraps the `{ success, command, ...data }` envelope and checks for errors.
 * Handles the case where output may be empty or malformed.
 */
function parseJsonOutput<T extends SeedsEnvelope>(stdout: string, context: string): T {
	const trimmed = stdout.trim();
	if (trimmed === "") {
		throw new AgentError(`Empty output from sd ${context}`);
	}
	let parsed: T;
	try {
		parsed = JSON.parse(trimmed) as T;
	} catch {
		throw new AgentError(
			`Failed to parse JSON output from sd ${context}: ${trimmed.slice(0, 200)}`,
		);
	}
	if (!parsed.success) {
		throw new AgentError(`sd ${context} returned success=false`);
	}
	return parsed;
}

/**
 * Create a SeedsClient bound to the given working directory.
 *
 * @param cwd - Working directory where sd commands should run
 * @returns A SeedsClient instance wrapping the sd CLI
 */
export function createSeedsClient(cwd: string): SeedsClient {
	async function runSd(
		args: string[],
		context: string,
	): Promise<{ stdout: string; stderr: string }> {
		const { stdout, stderr, exitCode } = await runCommand(["sd", ...args], cwd);
		if (exitCode !== 0) {
			throw new AgentError(`sd ${context} failed (exit ${exitCode}): ${stderr.trim()}`);
		}
		return { stdout, stderr };
	}

	return {
		async ready() {
			const { stdout } = await runSd(["ready", "--json"], "ready");
			const result = parseJsonOutput<SeedsEnvelope & { issues: SeedIssue[] }>(stdout, "ready");
			return result.issues;
		},

		async show(id) {
			const { stdout } = await runSd(["show", id, "--json"], `show ${id}`);
			const result = parseJsonOutput<SeedsEnvelope & { issue: SeedIssue }>(stdout, `show ${id}`);
			return result.issue;
		},

		async create(title, options) {
			const args = ["create", "--title", title, "--json"];
			if (options?.type) {
				args.push("--type", options.type);
			}
			if (options?.priority !== undefined) {
				args.push("--priority", String(options.priority));
			}
			if (options?.description) {
				args.push("--description", options.description);
			}
			const { stdout } = await runSd(args, "create");
			const result = parseJsonOutput<SeedsEnvelope & { id: string }>(stdout, "create");
			return result.id;
		},

		async claim(id) {
			await runSd(["update", id, "--status", "in_progress", "--json"], `claim ${id}`);
		},

		async close(id, reason) {
			const args = ["close", id];
			if (reason) {
				args.push("--reason", reason);
			}
			args.push("--json");
			await runSd(args, `close ${id}`);
		},

		async list(options) {
			const args = ["list", "--json"];
			if (options?.status) {
				args.push("--status", options.status);
			}
			if (options?.limit !== undefined) {
				args.push("--limit", String(options.limit));
			}
			const { stdout } = await runSd(args, "list");
			const result = parseJsonOutput<SeedsEnvelope & { issues: SeedIssue[] }>(stdout, "list");
			return result.issues;
		},
	};
}
