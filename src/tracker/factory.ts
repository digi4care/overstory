/**
 * Tracker factory — creates the right backend client based on configuration.
 */

import { createBeadsTracker } from "./beads.ts";
import { createSeedsTracker } from "./seeds.ts";
import type { TrackerBackend, TrackerClient } from "./types.ts";

/**
 * Create a tracker client for the specified backend.
 *
 * @param backend - Which backend to use ("beads" or "seeds")
 * @param cwd - Working directory for CLI commands
 */
export function createTrackerClient(backend: TrackerBackend, cwd: string): TrackerClient {
	switch (backend) {
		case "beads":
			return createBeadsTracker(cwd);
		case "seeds":
			return createSeedsTracker(cwd);
		default: {
			const _exhaustive: never = backend;
			throw new Error(`Unknown tracker backend: ${_exhaustive}`);
		}
	}
}

// Re-export types for convenience
export type { TrackerBackend, TrackerClient, TrackerIssue } from "./types.ts";
