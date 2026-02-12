import { describe, expect, test } from "bun:test";
import type { AgentSession } from "../types.ts";
import { evaluateHealth, transitionState } from "./health.ts";

/**
 * Tests for evaluateHealth() and transitionState() in the agent health state machine.
 *
 * Real implementations only — no mocks needed. evaluateHealth is a pure function
 * that takes session state + tmux liveness + thresholds and returns a HealthCheck.
 */

const THRESHOLDS = { staleMs: 30_000, zombieMs: 120_000 };

function makeSession(overrides: Partial<AgentSession> = {}): AgentSession {
	return {
		id: "session-test",
		agentName: "test-agent",
		capability: "builder",
		worktreePath: "/tmp/test",
		branchName: "overstory/test-agent/test-task",
		beadId: "test-task",
		tmuxSession: "overstory-test-agent",
		state: "booting",
		pid: 12345,
		parentAgent: null,
		depth: 0,
		startedAt: new Date().toISOString(),
		lastActivity: new Date().toISOString(),
		...overrides,
	};
}

describe("evaluateHealth", () => {
	test("tmux dead → zombie with terminate action", () => {
		const session = makeSession({ state: "working" });
		const check = evaluateHealth(session, false, THRESHOLDS);

		expect(check.state).toBe("zombie");
		expect(check.action).toBe("terminate");
		expect(check.tmuxAlive).toBe(false);
	});

	test("activity older than zombieMs → zombie", () => {
		const oldActivity = new Date(Date.now() - 200_000).toISOString();
		const session = makeSession({ state: "working", lastActivity: oldActivity });
		const check = evaluateHealth(session, true, THRESHOLDS);

		expect(check.state).toBe("zombie");
		expect(check.action).toBe("terminate");
	});

	test("activity older than staleMs → stalled", () => {
		const staleActivity = new Date(Date.now() - 60_000).toISOString();
		const session = makeSession({ state: "working", lastActivity: staleActivity });
		const check = evaluateHealth(session, true, THRESHOLDS);

		expect(check.state).toBe("stalled");
		expect(check.action).toBe("escalate");
	});

	test("booting with recent activity → transitions to working", () => {
		const recentActivity = new Date(Date.now() - 5_000).toISOString();
		const session = makeSession({ state: "booting", lastActivity: recentActivity });
		const check = evaluateHealth(session, true, THRESHOLDS);

		expect(check.state).toBe("working");
		expect(check.action).toBe("none");
	});

	test("working with recent activity → stays working", () => {
		const recentActivity = new Date(Date.now() - 5_000).toISOString();
		const session = makeSession({ state: "working", lastActivity: recentActivity });
		const check = evaluateHealth(session, true, THRESHOLDS);

		expect(check.state).toBe("working");
		expect(check.action).toBe("none");
	});

	test("booting but tmux dead → zombie (takes priority)", () => {
		const session = makeSession({ state: "booting" });
		const check = evaluateHealth(session, false, THRESHOLDS);

		expect(check.state).toBe("zombie");
		expect(check.action).toBe("terminate");
	});

	test("booting with stale activity → stalled", () => {
		const staleActivity = new Date(Date.now() - 60_000).toISOString();
		const session = makeSession({ state: "booting", lastActivity: staleActivity });
		const check = evaluateHealth(session, true, THRESHOLDS);

		expect(check.state).toBe("stalled");
		expect(check.action).toBe("escalate");
	});
});

describe("transitionState", () => {
	test("advances from booting to working", () => {
		const check = {
			state: "working" as const,
			agentName: "a",
			timestamp: "",
			tmuxAlive: true,
			lastActivity: "",
			processAlive: true,
			action: "none" as const,
		};
		expect(transitionState("booting", check)).toBe("working");
	});

	test("advances from working to stalled", () => {
		const check = {
			state: "stalled" as const,
			agentName: "a",
			timestamp: "",
			tmuxAlive: true,
			lastActivity: "",
			processAlive: true,
			action: "escalate" as const,
		};
		expect(transitionState("working", check)).toBe("stalled");
	});

	test("never regresses from stalled to working", () => {
		const check = {
			state: "working" as const,
			agentName: "a",
			timestamp: "",
			tmuxAlive: true,
			lastActivity: "",
			processAlive: true,
			action: "none" as const,
		};
		expect(transitionState("stalled", check)).toBe("stalled");
	});

	test("never regresses from zombie to booting", () => {
		const check = {
			state: "booting" as const,
			agentName: "a",
			timestamp: "",
			tmuxAlive: true,
			lastActivity: "",
			processAlive: true,
			action: "none" as const,
		};
		expect(transitionState("zombie", check)).toBe("zombie");
	});

	test("same state stays the same", () => {
		const check = {
			state: "working" as const,
			agentName: "a",
			timestamp: "",
			tmuxAlive: true,
			lastActivity: "",
			processAlive: true,
			action: "none" as const,
		};
		expect(transitionState("working", check)).toBe("working");
	});
});
