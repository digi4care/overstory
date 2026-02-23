import type { DoctorCheck, DoctorCheckFn } from "./types.ts";

/**
 * External dependency checks.
 * Validates that required CLI tools (git, bun, tmux, sd, mulch) are available
 * and that sd has functional CGO support for its Dolt database backend.
 */
export const checkDependencies: DoctorCheckFn = async (
	_config,
	_overstoryDir,
): Promise<DoctorCheck[]> => {
	const requiredTools = [
		{ name: "git", versionFlag: "--version", required: true },
		{ name: "bun", versionFlag: "--version", required: true },
		{ name: "tmux", versionFlag: "-V", required: true },
		{ name: "sd", versionFlag: "--version", required: true },
		{ name: "mulch", versionFlag: "--version", required: true },
	];

	const checks: DoctorCheck[] = [];

	for (const tool of requiredTools) {
		const check = await checkTool(tool.name, tool.versionFlag, tool.required);
		checks.push(check);
	}

	// If sd is available, probe for CGO/Dolt backend functionality
	const sdCheck = checks.find((c) => c.name === "sd availability");
	if (sdCheck?.status === "pass") {
		const cgoCheck = await checkSdCgoSupport();
		checks.push(cgoCheck);
	}

	return checks;
};

/**
 * Probe whether sd's Dolt database backend is functional.
 * The npm-distributed sd binary may be built without CGO, which causes
 * `sd init` and all database operations to fail even though `sd --version` succeeds.
 * We detect this by running `sd status` in a temp directory and checking for
 * the characteristic "without CGO support" error message.
 */
async function checkSdCgoSupport(): Promise<DoctorCheck> {
	const { mkdtemp, rm } = await import("node:fs/promises");
	const { join } = await import("node:path");
	const { tmpdir } = await import("node:os");

	let tempDir: string | undefined;
	try {
		tempDir = await mkdtemp(join(tmpdir(), "overstory-sd-cgo-"));
		const proc = Bun.spawn(["sd", "status"], {
			cwd: tempDir,
			stdout: "pipe",
			stderr: "pipe",
		});

		const exitCode = await proc.exited;
		const stderr = await new Response(proc.stderr).text();

		if (stderr.includes("without CGO support")) {
			return {
				name: "sd CGO support",
				category: "dependencies",
				status: "fail",
				message: "sd binary was built without CGO — Dolt database operations will fail",
				details: [
					"The installed sd binary lacks CGO support required by its Dolt backend.",
					"Workaround: rebuild sd from source with CGO_ENABLED=1 and ICU headers.",
					"See: https://github.com/jayminwest/overstory/issues/10",
				],
				fixable: true,
			};
		}

		// Any other exit code is fine — sd status may fail for other reasons
		// (no .seeds/ dir, etc.) but those aren't CGO issues
		if (exitCode === 0 || !stderr.includes("CGO")) {
			return {
				name: "sd CGO support",
				category: "dependencies",
				status: "pass",
				message: "sd has functional database backend",
				details: ["Dolt backend operational"],
			};
		}

		return {
			name: "sd CGO support",
			category: "dependencies",
			status: "warn",
			message: `sd status returned unexpected error (exit code ${exitCode})`,
			details: [stderr.trim().split("\n")[0] || "unknown error"],
		};
	} catch (error) {
		return {
			name: "sd CGO support",
			category: "dependencies",
			status: "warn",
			message: "Could not verify sd CGO support",
			details: [error instanceof Error ? error.message : String(error)],
		};
	} finally {
		if (tempDir) {
			await rm(tempDir, { recursive: true }).catch(() => {});
		}
	}
}

/**
 * Check if a CLI tool is available by attempting to run it with a version flag.
 */
async function checkTool(
	name: string,
	versionFlag: string,
	required: boolean,
): Promise<DoctorCheck> {
	try {
		const proc = Bun.spawn([name, versionFlag], {
			stdout: "pipe",
			stderr: "pipe",
		});

		const exitCode = await proc.exited;

		if (exitCode === 0) {
			const stdout = await new Response(proc.stdout).text();
			const version = stdout.split("\n")[0]?.trim() || "version unknown";

			return {
				name: `${name} availability`,
				category: "dependencies",
				status: "pass",
				message: `${name} is available`,
				details: [version],
			};
		}

		// Non-zero exit code
		const stderr = await new Response(proc.stderr).text();
		return {
			name: `${name} availability`,
			category: "dependencies",
			status: required ? "fail" : "warn",
			message: `${name} command failed (exit code ${exitCode})`,
			details: stderr ? [stderr.trim()] : undefined,
			fixable: true,
		};
	} catch (error) {
		// Command not found or spawn failed
		return {
			name: `${name} availability`,
			category: "dependencies",
			status: required ? "fail" : "warn",
			message: `${name} is not installed or not in PATH`,
			details: [
				`Install ${name} or ensure it is in your PATH`,
				error instanceof Error ? error.message : String(error),
			],
			fixable: true,
		};
	}
}
