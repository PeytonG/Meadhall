// SPDX-License-Identifier: AGPL-3.0-only
// Recognises running games from the process list (like Discord does), using arRPC's game list.
// Only runs when "Detect games" is on, at most every 15 seconds, and only reads process paths.
import { execFile } from "node:child_process";
import fs from "node:fs/promises";

import { matchProcess } from "./detectable";

export interface DetectedGame {
    id: string;
    name: string;
    startedAt: number;
}

type ProcessEntry = { path: string; args: string[] };

function run(command: string, args: string[]): Promise<string> {
    return new Promise((resolve) => {
        execFile(command, args, { windowsHide: true, timeout: 10_000, maxBuffer: 16 * 1024 * 1024 }, (error, stdout) => resolve(error ? "" : String(stdout)));
    });
}

// Windows 11 24H2 removed wmic (what arRPC uses), so ask CIM through PowerShell instead.
async function windowsProcesses(): Promise<ProcessEntry[]> {
    const out = await run("powershell.exe", [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "Get-CimInstance Win32_Process -Property ExecutablePath | Where-Object ExecutablePath | ForEach-Object { $_.ExecutablePath }",
    ]);
    return out
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((path) => ({ path, args: [] }));
}

async function linuxProcesses(): Promise<ProcessEntry[]> {
    const pids = (await fs.readdir("/proc").catch(() => [] as string[])).filter((name) => /^\d+$/.test(name));
    const entries = await Promise.all(
        pids.map(async (pid) => {
            const cmdline = await fs.readFile(`/proc/${pid}/cmdline`, "utf8").catch(() => "");
            const [path, ...args] = cmdline.split("\0").filter(Boolean);
            return path ? { path, args } : null;
        }),
    );
    return entries.filter((entry): entry is ProcessEntry => entry !== null);
}

async function macProcesses(): Promise<ProcessEntry[]> {
    const out = await run("ps", ["-axo", "comm="]);
    return out
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((path) => ({ path, args: [] }));
}

export async function listProcesses(): Promise<ProcessEntry[]> {
    if (process.platform === "win32") return windowsProcesses();
    if (process.platform === "linux") return linuxProcesses();
    if (process.platform === "darwin") return macProcesses();
    return [];
}

const SCAN_EVERY_MS = 15_000;
const startedAt = new Map<string, number>();
let lastScan = 0;
let lastResult: DetectedGame[] = [];
let scanning: Promise<DetectedGame[]> | null = null;

export function detectedFrom(processes: ProcessEntry[], now = Date.now()): DetectedGame[] {
    const found = new Map<string, DetectedGame>();
    for (const entry of processes) {
        const app = matchProcess(entry.path, entry.args);
        if (!app || found.has(app.id)) continue;
        if (!startedAt.has(app.id)) startedAt.set(app.id, now);
        found.set(app.id, { id: app.id, name: app.name, startedAt: startedAt.get(app.id)! });
    }
    // Games that closed start their timer again next time.
    for (const id of [...startedAt.keys()]) if (!found.has(id)) startedAt.delete(id);
    return [...found.values()];
}

export function runningGames(): Promise<DetectedGame[]> {
    if (Date.now() - lastScan < SCAN_EVERY_MS) return Promise.resolve(lastResult);
    scanning ??= listProcesses()
        .then((processes) => {
            lastResult = detectedFrom(processes);
            lastScan = Date.now();
            return lastResult;
        })
        .catch(() => lastResult)
        .finally(() => {
            scanning = null;
        });
    return scanning;
}
