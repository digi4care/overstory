import { describe, expect, test } from "bun:test";
import { createTrackerClient } from "./factory.ts";

describe("createTrackerClient", () => {
	test("creates beads tracker for beads backend", () => {
		const client = createTrackerClient("beads", "/tmp");
		expect(client).toBeDefined();
		expect(client.ready).toBeTypeOf("function");
		expect(client.show).toBeTypeOf("function");
		expect(client.create).toBeTypeOf("function");
		expect(client.claim).toBeTypeOf("function");
		expect(client.close).toBeTypeOf("function");
		expect(client.list).toBeTypeOf("function");
		expect(client.sync).toBeTypeOf("function");
	});

	test("creates seeds tracker for seeds backend", () => {
		const client = createTrackerClient("seeds", "/tmp");
		expect(client).toBeDefined();
		expect(client.ready).toBeTypeOf("function");
		expect(client.show).toBeTypeOf("function");
		expect(client.create).toBeTypeOf("function");
		expect(client.claim).toBeTypeOf("function");
		expect(client.close).toBeTypeOf("function");
		expect(client.list).toBeTypeOf("function");
		expect(client.sync).toBeTypeOf("function");
	});

	test("throws for invalid backend", () => {
		// @ts-expect-error - intentionally testing runtime guard
		expect(() => createTrackerClient("invalid", "/tmp")).toThrow();
	});
});
