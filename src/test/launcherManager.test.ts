import * as assert from 'assert';
import { LauncherManager, type LauncherState } from '../launcherManager';

suite('LauncherManager', () => {
test('adds launcher in stopped state', () => {
const manager = new LauncherManager();
const launcher = manager.addLauncher('Dev', 'node -e "console.log(1)"');
assert.strictEqual(launcher.status, 'stopped');
assert.strictEqual(manager.getState().length, 1);
});

test('runs script and captures logs', async () => {
const manager = new LauncherManager();
const launcher = manager.addLauncher('Echo', 'node -e "console.log(\'hello\')"');
manager.startLauncher(launcher.id, process.cwd());
await waitForStatus(manager, launcher.id, ['stopped', 'errored'], 5000);
const logs = manager.getLogs(launcher.id).map((entry) => entry.message);
assert.ok(logs.some((line) => line.includes('hello')));
});

test('stops a running process', async () => {
const manager = new LauncherManager();
const launcher = manager.addLauncher('Long', 'node -e "setInterval(() => {}, 1000)"');
manager.startLauncher(launcher.id, process.cwd());
await waitForStatus(manager, launcher.id, ['running'], 5000);
manager.stopLauncher(launcher.id);
await waitForStatus(manager, launcher.id, ['stopped'], 5000);
});
});

async function waitForStatus(manager: LauncherManager, launcherId: string, expected: LauncherState['status'][], timeoutMs: number): Promise<void> {
const start = Date.now();
while (Date.now() - start < timeoutMs) {
const current = manager.getState().find((launcher) => launcher.id === launcherId);
if (current && expected.includes(current.status)) {
return;
}
await new Promise((resolve) => setTimeout(resolve, 25));
}
const finalStatus = manager.getState().find((launcher) => launcher.id === launcherId)?.status;
throw new Error(`Timed out waiting for status ${expected.join(', ')}; current=${finalStatus ?? 'missing'}`);
}
