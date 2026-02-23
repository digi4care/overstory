/**
 * Seeds template management helpers.
 *
 * Wraps `sd tpl` commands via Bun.spawn for multi-step workflow templates.
 * Templates are prototypes with ordered steps. "Pouring" a template creates
 * actual issues with dependencies pre-wired.
 *
 * Zero runtime dependencies -- only Bun built-in APIs.
 */

import { AgentError } from "../errors.ts";

// === Types ===

export interface TemplateStep {
	title: string;
	type?: string;
	priority?: number;
}

export interface TemplatePrototype {
	id: string;
	name: string;
	stepCount: number;
}

export interface ConvoyStatus {
	templateId: string;
	total: number;
	completed: number;
	inProgress: number;
	blocked: number;
	issues: string[];
}

// === Internal helpers ===

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
 * Run an `sd` subcommand and throw on failure.
 */
async function runSd(
	args: string[],
	cwd: string,
	context: string,
): Promise<{ stdout: string; stderr: string }> {
	const { stdout, stderr, exitCode } = await runCommand(["sd", ...args], cwd);
	if (exitCode !== 0) {
		throw new AgentError(`sd ${context} failed (exit ${exitCode}): ${stderr.trim()}`);
	}
	return { stdout, stderr };
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

// === Public API ===

/**
 * Create a template with ordered steps.
 *
 * First creates the template via `sd tpl create`, then adds each step
 * in order via `sd tpl step add`. Returns the template ID.
 *
 * @param cwd - Working directory where sd commands should run
 * @param options - Template name and ordered steps
 * @returns The template ID
 */
export async function createTemplate(
	cwd: string,
	options: { name: string; steps: TemplateStep[] },
): Promise<string> {
	const { stdout } = await runSd(
		["tpl", "create", "--name", options.name, "--json"],
		cwd,
		"tpl create",
	);
	const result = parseJsonOutput<SeedsEnvelope & { id: string }>(stdout, "tpl create");
	const tplId = result.id;

	for (const step of options.steps) {
		const stepArgs = [
			"tpl",
			"step",
			"add",
			tplId,
			"--title",
			step.title,
			"--type",
			step.type ?? "task",
		];
		if (step.priority !== undefined) {
			stepArgs.push("--priority", String(step.priority));
		}
		stepArgs.push("--json");
		await runSd(stepArgs, cwd, `tpl step add (${step.title})`);
	}

	return tplId;
}

/**
 * Pour (instantiate) a template into actual issues.
 *
 * Creates issues from the template with dependencies pre-wired.
 * Seeds requires a prefix for all created issue titles.
 *
 * @param cwd - Working directory where sd commands should run
 * @param options - Template ID and title prefix (required)
 * @returns Array of created issue IDs
 */
export async function pourTemplate(
	cwd: string,
	options: { templateId: string; prefix: string },
): Promise<string[]> {
	const args = ["tpl", "pour", options.templateId, "--prefix", options.prefix, "--json"];
	const { stdout } = await runSd(args, cwd, "tpl pour");
	const result = parseJsonOutput<SeedsEnvelope & { ids: string[] }>(stdout, "tpl pour");
	return result.ids;
}

/**
 * List all templates.
 *
 * @param cwd - Working directory where sd commands should run
 * @returns Array of template summaries
 */
export async function listTemplates(cwd: string): Promise<TemplatePrototype[]> {
	const { stdout } = await runSd(["tpl", "list", "--json"], cwd, "tpl list");
	const result = parseJsonOutput<
		SeedsEnvelope & { templates: Array<{ id: string; name: string; stepCount: number }> }
	>(stdout, "tpl list");
	return result.templates.map((entry) => ({
		id: entry.id,
		name: entry.name,
		stepCount: entry.stepCount,
	}));
}

/**
 * Get the convoy status for a template instance.
 *
 * Returns counts of total, completed, in-progress, and blocked issues
 * that were poured from this template.
 *
 * @param cwd - Working directory where sd commands should run
 * @param templateId - The template ID to check status for
 * @returns Status counts and issue list for the convoy
 */
export async function getConvoyStatus(cwd: string, templateId: string): Promise<ConvoyStatus> {
	const { stdout } = await runSd(
		["tpl", "status", templateId, "--json"],
		cwd,
		`tpl status ${templateId}`,
	);
	const result = parseJsonOutput<
		SeedsEnvelope & {
			status: {
				templateId: string;
				total: number;
				completed: number;
				inProgress: number;
				blocked: number;
				issues: string[];
			};
		}
	>(stdout, `tpl status ${templateId}`);
	return {
		templateId: result.status.templateId,
		total: result.status.total,
		completed: result.status.completed,
		inProgress: result.status.inProgress,
		blocked: result.status.blocked,
		issues: result.status.issues,
	};
}
