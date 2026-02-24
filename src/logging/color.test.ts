import { describe, expect, test } from "bun:test";
import { dirname, join } from "node:path";

// Resolve the project root from this file's location (src/logging/ -> project root)
const projectRoot = join(dirname(import.meta.dir), "..");

describe("color module", () => {
	test("color.red is a function that wraps text", async () => {
		const { color } = await import("./color.ts");
		const result = color.red("hello");
		expect(result).toContain("hello");
		expect(typeof result).toBe("string");
	});

	test("color functions all exist", async () => {
		const { color } = await import("./color.ts");
		const expectedKeys = [
			"bold",
			"dim",
			"red",
			"green",
			"yellow",
			"blue",
			"magenta",
			"cyan",
			"white",
			"gray",
		];
		for (const key of expectedKeys) {
			expect(key in color).toBe(true);
			expect(typeof (color as Record<string, unknown>)[key]).toBe("function");
		}
	});

	test("brand palette functions wrap text", async () => {
		const { brand, accent, muted } = await import("./color.ts");
		const result = brand("Overstory");
		expect(result).toContain("Overstory");
		expect(typeof accent("test")).toBe("string");
		expect(typeof muted("test")).toBe("string");
	});

	test("noColor is an identity function", async () => {
		const { noColor } = await import("./color.ts");
		expect(noColor("hello")).toBe("hello");
		expect(noColor("")).toBe("");
	});

	test("stripAnsi removes escape codes", async () => {
		const { stripAnsi } = await import("./color.ts");
		expect(stripAnsi("\x1b[31mhello\x1b[39m")).toBe("hello");
		expect(stripAnsi("plain")).toBe("plain");
		expect(stripAnsi("\x1b[1m\x1b[31mbold red\x1b[39m\x1b[22m")).toBe("bold red");
	});

	test("visibleLength excludes ANSI codes", async () => {
		const { visibleLength } = await import("./color.ts");
		expect(visibleLength("\x1b[31mhello\x1b[39m")).toBe(5);
		expect(visibleLength("hello")).toBe(5);
		expect(visibleLength("")).toBe(0);
	});

	test("setQuiet/isQuiet controls quiet mode", async () => {
		const { isQuiet, setQuiet } = await import("./color.ts");
		expect(isQuiet()).toBe(false);
		setQuiet(true);
		expect(isQuiet()).toBe(true);
		setQuiet(false);
		expect(isQuiet()).toBe(false);
	});

	test("NO_COLOR env causes chalk.level to be 0", async () => {
		const proc = Bun.spawn(
			[
				"bun",
				"-e",
				'import chalk from "chalk"; console.log(JSON.stringify({ level: chalk.level }))',
			],
			{
				cwd: projectRoot,
				stdout: "pipe",
				stderr: "pipe",
				env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: undefined },
			},
		);
		await proc.exited;
		const output = await new Response(proc.stdout).text();
		const result = JSON.parse(output.trim());
		expect(result.level).toBe(0);
	});

	test("FORCE_COLOR overrides NO_COLOR", async () => {
		const proc = Bun.spawn(
			[
				"bun",
				"-e",
				'import chalk from "chalk"; console.log(JSON.stringify({ level: chalk.level }))',
			],
			{
				cwd: projectRoot,
				stdout: "pipe",
				stderr: "pipe",
				env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "1" },
			},
		);
		await proc.exited;
		const output = await new Response(proc.stdout).text();
		const result = JSON.parse(output.trim());
		expect(result.level).toBeGreaterThan(0);
	});

	test("chalk re-export is available", async () => {
		const { chalk } = await import("./color.ts");
		expect(typeof chalk.red).toBe("function");
		expect(chalk.red("test")).toContain("test");
	});

	test("ColorFn type: color functions accept strings and return strings", async () => {
		const { color } = await import("./color.ts");
		// Each color function should accept a string and return a string
		const result = color.bold(color.red("nested"));
		expect(result).toContain("nested");
		expect(typeof result).toBe("string");
	});
});
