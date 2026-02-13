/**
 * Tests for mulch CLI client.
 *
 * Uses real mulch CLI when available (preferred).
 * All tests are skipped if mulch is not installed.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentError } from "../errors.ts";
import { createMulchClient } from "./client.ts";

// Check if mulch is available
let hasMulch = false;
try {
	const proc = Bun.spawn(["which", "mulch"], { stdout: "pipe", stderr: "pipe" });
	const exitCode = await proc.exited;
	hasMulch = exitCode === 0;
} catch {
	hasMulch = false;
}

describe("createMulchClient", () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), "mulch-test-"));
	});

	afterEach(async () => {
		await rm(tempDir, { recursive: true, force: true });
	});

	/**
	 * Helper to initialize mulch in tempDir.
	 * Creates .mulch/ directory and initial structure.
	 */
	async function initMulch(): Promise<void> {
		if (!hasMulch) return;
		const proc = Bun.spawn(["mulch", "init"], {
			cwd: tempDir,
			stdout: "pipe",
			stderr: "pipe",
		});
		await proc.exited;
	}

	describe("prime", () => {
		test.skipIf(!hasMulch)("returns non-empty string", async () => {
			await initMulch();
			const client = createMulchClient(tempDir);
			const result = await client.prime();
			expect(result).toBeTruthy();
			expect(typeof result).toBe("string");
			expect(result.length).toBeGreaterThan(0);
		});

		test.skipIf(!hasMulch)("passes domain args when provided", async () => {
			await initMulch();
			// Add a domain first so we can prime it
			const addProc = Bun.spawn(["mulch", "add", "architecture"], {
				cwd: tempDir,
				stdout: "pipe",
				stderr: "pipe",
			});
			await addProc.exited;

			const client = createMulchClient(tempDir);
			const result = await client.prime(["architecture"]);
			expect(typeof result).toBe("string");
		});

		test.skipIf(!hasMulch)("passes --format flag", async () => {
			await initMulch();
			const client = createMulchClient(tempDir);
			const result = await client.prime([], "markdown");
			expect(typeof result).toBe("string");
		});

		test.skipIf(!hasMulch)("passes both domains and format", async () => {
			await initMulch();
			const addProc = Bun.spawn(["mulch", "add", "architecture"], {
				cwd: tempDir,
				stdout: "pipe",
				stderr: "pipe",
			});
			await addProc.exited;

			const client = createMulchClient(tempDir);
			const result = await client.prime(["architecture"], "xml");
			expect(typeof result).toBe("string");
		});
	});

	describe("status", () => {
		test.skipIf(!hasMulch)("returns MulchStatus shape", async () => {
			await initMulch();
			const client = createMulchClient(tempDir);
			const result = await client.status();
			expect(result).toHaveProperty("domains");
			expect(Array.isArray(result.domains)).toBe(true);
		});

		test.skipIf(!hasMulch)("with no domains returns empty array", async () => {
			await initMulch();
			const client = createMulchClient(tempDir);
			const result = await client.status();
			expect(result.domains).toEqual([]);
		});

		test.skipIf(!hasMulch)("includes domain data when domains exist", async () => {
			await initMulch();
			// Add a domain
			const addProc = Bun.spawn(["mulch", "add", "architecture"], {
				cwd: tempDir,
				stdout: "pipe",
				stderr: "pipe",
			});
			await addProc.exited;

			const client = createMulchClient(tempDir);
			const result = await client.status();
			expect(result.domains.length).toBeGreaterThan(0);
			// Just verify we got an array with entries, don't check specific structure
			// as mulch CLI output format may vary
		});
	});

	describe("record", () => {
		test.skipIf(!hasMulch)("with required args succeeds", async () => {
			await initMulch();
			// Add domain first
			const addProc = Bun.spawn(["mulch", "add", "architecture"], {
				cwd: tempDir,
				stdout: "pipe",
				stderr: "pipe",
			});
			await addProc.exited;

			const client = createMulchClient(tempDir);
			await expect(
				client.record("architecture", {
					type: "convention",
					description: "test convention",
				}),
			).resolves.toBeUndefined();
		});

		test.skipIf(!hasMulch)("with optional args succeeds", async () => {
			await initMulch();
			const addProc = Bun.spawn(["mulch", "add", "architecture"], {
				cwd: tempDir,
				stdout: "pipe",
				stderr: "pipe",
			});
			await addProc.exited;

			const client = createMulchClient(tempDir);
			await expect(
				client.record("architecture", {
					type: "pattern",
					name: "test-pattern",
					description: "test description",
					title: "Test Pattern",
					rationale: "testing all options",
					tags: ["testing", "example"],
				}),
			).resolves.toBeUndefined();
		});

		test.skipIf(!hasMulch)("with multiple tags", async () => {
			await initMulch();
			const addProc = Bun.spawn(["mulch", "add", "typescript"], {
				cwd: tempDir,
				stdout: "pipe",
				stderr: "pipe",
			});
			await addProc.exited;

			const client = createMulchClient(tempDir);
			await expect(
				client.record("typescript", {
					type: "convention",
					description: "multi-tag test",
					tags: ["tag1", "tag2", "tag3"],
				}),
			).resolves.toBeUndefined();
		});
	});

	describe("query", () => {
		test.skipIf(!hasMulch)("passes domain arg when provided", async () => {
			await initMulch();
			const addProc = Bun.spawn(["mulch", "add", "architecture"], {
				cwd: tempDir,
				stdout: "pipe",
				stderr: "pipe",
			});
			await addProc.exited;

			const client = createMulchClient(tempDir);
			const result = await client.query("architecture");
			expect(typeof result).toBe("string");
		});

		test.skipIf(!hasMulch)("query without domain requires --all flag", async () => {
			await initMulch();
			const client = createMulchClient(tempDir);
			// Current implementation doesn't pass --all, so this will fail
			// This documents the current behavior
			await expect(client.query()).rejects.toThrow(AgentError);
		});
	});

	describe("search", () => {
		test.skipIf(!hasMulch)("returns string output", async () => {
			await initMulch();
			const client = createMulchClient(tempDir);
			const result = await client.search("test");
			expect(typeof result).toBe("string");
		});

		test.skipIf(!hasMulch)("searches across domains", async () => {
			await initMulch();
			// Add a domain and record
			const addProc = Bun.spawn(["mulch", "add", "testing"], {
				cwd: tempDir,
				stdout: "pipe",
				stderr: "pipe",
			});
			await addProc.exited;

			const client = createMulchClient(tempDir);
			await client.record("testing", {
				type: "convention",
				description: "searchable keyword here",
			});

			const result = await client.search("searchable");
			expect(typeof result).toBe("string");
		});
	});

	describe("error handling", () => {
		test.skipIf(!hasMulch)("throws AgentError when mulch command fails", async () => {
			// Don't init mulch - operations will fail with "not initialized" error
			const client = createMulchClient(tempDir);
			await expect(client.status()).rejects.toThrow(AgentError);
		});

		test.skipIf(!hasMulch)("AgentError message contains exit code", async () => {
			const client = createMulchClient(tempDir);
			try {
				await client.status();
				expect.unreachable("Should have thrown AgentError");
			} catch (error) {
				expect(error).toBeInstanceOf(AgentError);
				const agentError = error as AgentError;
				expect(agentError.message).toContain("exit");
				expect(agentError.message).toContain("status");
			}
		});

		test.skipIf(!hasMulch)("record fails with descriptive error for missing domain", async () => {
			await initMulch();
			const client = createMulchClient(tempDir);
			// Try to record to a domain that doesn't exist
			await expect(
				client.record("nonexistent-domain", {
					type: "convention",
					description: "test",
				}),
			).rejects.toThrow(AgentError);
		});

		test.skipIf(!hasMulch)("handles empty status output correctly", async () => {
			await initMulch();
			const client = createMulchClient(tempDir);
			const result = await client.status();
			// With no domains, should have empty array (not throw)
			expect(result).toHaveProperty("domains");
			expect(result.domains).toEqual([]);
		});
	});
});
