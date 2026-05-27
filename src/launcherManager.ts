import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomUUID } from 'node:crypto';

export type LauncherStatus = 'stopped' | 'starting' | 'running' | 'stopping' | 'errored';

export interface LauncherConfig {
id: string;
name: string;
script: string;
}

export interface LauncherState extends LauncherConfig {
status: LauncherStatus;
pid?: number;
lastExitCode?: number | null;
lastError?: string;
}

export interface LogEntry {
launcherId: string;
launcherName: string;
timestamp: string;
stream: 'stdout' | 'stderr' | 'system';
message: string;
}

const MAX_LOG_ENTRIES = 2000;

interface LauncherRuntime {
state: LauncherState;
process?: ChildProcessWithoutNullStreams;
}

export class LauncherManager {
private readonly launchers = new Map<string, LauncherRuntime>();
private readonly logs: LogEntry[] = [];
private readonly listeners = new Set<() => void>();

public constructor(initialLaunchers: LauncherConfig[] = []) {
for (const launcher of initialLaunchers) {
this.launchers.set(launcher.id, {
state: { ...launcher, status: 'stopped' },
});
}
}

	public onDidChange(listener: () => void): () => void {
this.listeners.add(listener);
return () => {
this.listeners.delete(listener);
};
	}

	public dispose(): void {
		for (const runtime of this.launchers.values()) {
			if (runtime.process) {
				runtime.process.kill();
			}
		}
		this.listeners.clear();
	}

public addLauncher(name: string, script: string): LauncherState {
const id = randomUUID();
const state: LauncherState = {
id,
name: name.trim(),
script: script.trim(),
status: 'stopped',
};
this.launchers.set(id, { state });
this.emitChange();
return { ...state };
}

public removeLauncher(id: string): void {
const runtime = this.launchers.get(id);
if (!runtime) {
return;
}
if (runtime.process) {
this.stopLauncher(id);
}
this.launchers.delete(id);
this.emitChange();
}

public startLauncher(id: string, cwd: string): void {
const runtime = this.launchers.get(id);
if (!runtime || runtime.process) {
return;
}

runtime.state.status = 'starting';
runtime.state.lastError = undefined;
runtime.state.lastExitCode = undefined;
this.appendSystemLog(runtime.state, `Starting script: ${runtime.state.script}`);
this.emitChange();

const child = spawn(runtime.state.script, {
cwd,
shell: true,
env: process.env,
});
runtime.process = child;

child.once('spawn', () => {
runtime.state.status = 'running';
runtime.state.pid = child.pid;
this.appendSystemLog(runtime.state, `Process running${child.pid ? ` (pid ${child.pid})` : ''}`);
this.emitChange();
});

child.stdout.on('data', (chunk: Buffer) => {
this.appendLog(runtime.state, 'stdout', chunk.toString());
});

child.stderr.on('data', (chunk: Buffer) => {
this.appendLog(runtime.state, 'stderr', chunk.toString());
});

child.once('error', (error: Error) => {
runtime.state.status = 'errored';
runtime.state.lastError = error.message;
runtime.state.pid = undefined;
runtime.process = undefined;
this.appendSystemLog(runtime.state, `Failed to start: ${error.message}`);
this.emitChange();
});

child.once('exit', (code: number | null, signal: NodeJS.Signals | null) => {
runtime.process = undefined;
runtime.state.pid = undefined;
runtime.state.lastExitCode = code;
if (runtime.state.status === 'stopping') {
runtime.state.status = 'stopped';
} else if (code === 0) {
runtime.state.status = 'stopped';
} else {
runtime.state.status = 'errored';
runtime.state.lastError = signal ? `Exited with signal ${signal}` : `Exited with code ${code ?? 'unknown'}`;
}
this.appendSystemLog(runtime.state, `Process exited${signal ? ` by signal ${signal}` : ` with code ${code ?? 'unknown'}`}`);
this.emitChange();
});
}

public stopLauncher(id: string): void {
const runtime = this.launchers.get(id);
if (!runtime || !runtime.process) {
return;
}

runtime.state.status = 'stopping';
this.appendSystemLog(runtime.state, 'Stopping process');
this.emitChange();

if (!runtime.process.kill()) {
runtime.state.status = 'errored';
runtime.state.lastError = 'Unable to stop process';
this.appendSystemLog(runtime.state, runtime.state.lastError);
this.emitChange();
}
}

public clearLogs(launcherId?: string): void {
if (!launcherId) {
this.logs.length = 0;
this.emitChange();
return;
}

for (let index = this.logs.length - 1; index >= 0; index--) {
if (this.logs[index].launcherId === launcherId) {
this.logs.splice(index, 1);
}
}
this.emitChange();
}

public getState(): LauncherState[] {
return [...this.launchers.values()].map((runtime) => ({ ...runtime.state }));
}

public getConfigs(): LauncherConfig[] {
return this.getState().map(({ id, name, script }) => ({ id, name, script }));
}

public getLogs(launcherId?: string): LogEntry[] {
if (!launcherId) {
return [...this.logs];
}
return this.logs.filter((entry) => entry.launcherId === launcherId);
}

private appendSystemLog(state: LauncherState, message: string): void {
this.appendLog(state, 'system', message);
}

private appendLog(state: LauncherState, stream: LogEntry['stream'], message: string): void {
const normalized = message.replace(/\r/g, '').trimEnd();
if (!normalized) {
return;
}
for (const line of normalized.split('\n')) {
this.logs.push({
launcherId: state.id,
launcherName: state.name,
timestamp: new Date().toISOString(),
stream,
message: line,
});
}
if (this.logs.length > MAX_LOG_ENTRIES) {
this.logs.splice(0, this.logs.length - MAX_LOG_ENTRIES);
}
this.emitChange();
}

private emitChange(): void {
for (const listener of this.listeners) {
listener();
}
}
}
