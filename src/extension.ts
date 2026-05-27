import * as vscode from 'vscode';
import { LauncherManager, type LauncherConfig, type LauncherState, type LogEntry } from './launcherManager';

const VIEW_ID = 'panelMe.launcherView';
const STORAGE_KEY = 'panelMe.launchers';

class PanelMeViewProvider implements vscode.WebviewViewProvider {
private view?: vscode.WebviewView;
private readonly manager: LauncherManager;
private readonly context: vscode.ExtensionContext;
private readonly unlisten: () => void;

public constructor(context: vscode.ExtensionContext) {
this.context = context;
const initial = context.workspaceState.get<LauncherConfig[]>(STORAGE_KEY, []);
this.manager = new LauncherManager(initial);
this.unlisten = this.manager.onDidChange(() => {
void this.context.workspaceState.update(STORAGE_KEY, this.manager.getConfigs());
this.postState();
});
}

	public dispose(): void {
		this.manager.dispose();
		this.unlisten();
	}

public resolveWebviewView(webviewView: vscode.WebviewView): void {
this.view = webviewView;
webviewView.webview.options = {
enableScripts: true,
};
webviewView.webview.html = this.getHtml(webviewView.webview);
webviewView.webview.onDidReceiveMessage((message: unknown) => {
this.handleMessage(message);
});
this.postState();
}

private handleMessage(message: unknown): void {
if (!message || typeof message !== 'object') {
return;
}
const data = message as { type?: string; id?: string; name?: string; script?: string; launcherId?: string };
const cwd = this.workspaceCwd();
switch (data.type) {
case 'addLauncher': {
if (!data.name || !data.script) {
return;
}
this.manager.addLauncher(data.name, data.script);
break;
}
case 'removeLauncher': {
if (data.id) {
this.manager.removeLauncher(data.id);
}
break;
}
case 'startLauncher': {
if (data.id) {
this.manager.startLauncher(data.id, cwd);
}
break;
}
case 'stopLauncher': {
if (data.id) {
this.manager.stopLauncher(data.id);
}
break;
}
case 'clearLogs': {
this.manager.clearLogs(data.launcherId);
break;
}
default:
break;
}
}

private postState(): void {
if (!this.view) {
return;
}
const payload = {
type: 'state',
launchers: this.manager.getState(),
logs: this.manager.getLogs(),
};
void this.view.webview.postMessage(payload);
}

	private workspaceCwd(): string {
		const useWorkspace = vscode.workspace.getConfiguration('panelMe').get<boolean>('defaultWorkspaceCwd', true);
		if (!useWorkspace) {
			return this.context.extensionPath;
		}
		const folder = vscode.workspace.workspaceFolders?.[0]?.uri;
		if (folder) {
			return folder.fsPath;
		}
return this.context.extensionPath;
}

private getHtml(webview: vscode.Webview): string {
const nonce = getNonce();
const csp = `default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';`;
return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="${csp}" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Panel Me</title>
<style>
body { font-family: var(--vscode-font-family); padding: 8px; color: var(--vscode-foreground); }
.tabs { display: flex; gap: 8px; margin-bottom: 12px; }
.tab { border: 1px solid var(--vscode-button-border, transparent); background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); border-radius: 4px; padding: 4px 8px; cursor: pointer; }
.tab.active { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
.panel { display: none; }
.panel.active { display: block; }
form { display: grid; gap: 8px; margin-bottom: 12px; }
input, button, select { width: 100%; box-sizing: border-box; }
.launcher { border: 1px solid var(--vscode-panel-border); border-radius: 6px; padding: 8px; margin-bottom: 8px; }
.row { display: flex; gap: 6px; }
.row > button { flex: 1; }
.status { font-size: 12px; opacity: 0.9; margin: 4px 0; }
pre { white-space: pre-wrap; background: var(--vscode-editor-background); border: 1px solid var(--vscode-panel-border); border-radius: 6px; padding: 8px; max-height: 420px; overflow: auto; }
.empty { opacity: 0.75; font-size: 12px; }
</style>
</head>
<body>
<div class="tabs">
<button id="tabLaunchers" class="tab active" type="button">Launchers</button>
<button id="tabLogs" class="tab" type="button">Logs</button>
</div>

<section id="launchersPanel" class="panel active">
<form id="launcherForm">
<input id="launcherName" type="text" placeholder="Launcher name" required />
<input id="launcherScript" type="text" placeholder="Script (e.g. npm run dev)" required />
<button type="submit">Add launcher</button>
</form>
<div id="launchers" class="empty">No launchers yet.</div>
</section>

<section id="logsPanel" class="panel">
<div class="row" style="margin-bottom:8px;">
<select id="logLauncherFilter"></select>
<button id="clearLogs" type="button">Clear</button>
</div>
<pre id="logsContent" class="empty">No logs yet.</pre>
</section>

<script nonce="${nonce}">
const vscode = acquireVsCodeApi();
let launchers = [];
let logs = [];
let activeTab = 'launchers';
let logFilter = 'all';

const tabLaunchers = document.getElementById('tabLaunchers');
const tabLogs = document.getElementById('tabLogs');
const launchersPanel = document.getElementById('launchersPanel');
const logsPanel = document.getElementById('logsPanel');
const launcherForm = document.getElementById('launcherForm');
const launcherName = document.getElementById('launcherName');
const launcherScript = document.getElementById('launcherScript');
const launchersEl = document.getElementById('launchers');
const logFilterEl = document.getElementById('logLauncherFilter');
const clearLogsBtn = document.getElementById('clearLogs');
const logsContent = document.getElementById('logsContent');

function setTab(tab) {
activeTab = tab;
tabLaunchers.classList.toggle('active', tab === 'launchers');
tabLogs.classList.toggle('active', tab === 'logs');
launchersPanel.classList.toggle('active', tab === 'launchers');
logsPanel.classList.toggle('active', tab === 'logs');
}

function renderLaunchers() {
if (!launchers.length) {
launchersEl.className = 'empty';
launchersEl.textContent = 'No launchers yet.';
return;
}
launchersEl.className = '';
launchersEl.innerHTML = launchers.map((launcher) => {
const canStart = launcher.status === 'stopped' || launcher.status === 'errored';
const canStop = launcher.status === 'starting' || launcher.status === 'running' || launcher.status === 'stopping';
const details = [launcher.status.toUpperCase()];
if (launcher.pid) details.push('pid ' + launcher.pid);
if (launcher.lastError) details.push(launcher.lastError);
return '<div class="launcher">'
+ '<strong>' + escapeHtml(launcher.name) + '</strong>'
+ '<div class="status">' + escapeHtml(details.join(' · ')) + '</div>'
+ '<div class="status">' + escapeHtml(launcher.script) + '</div>'
+ '<div class="row">'
+ '<button data-action="start" data-id="' + launcher.id + '" ' + (canStart ? '' : 'disabled') + '>Start</button>'
+ '<button data-action="stop" data-id="' + launcher.id + '" ' + (canStop ? '' : 'disabled') + '>Stop</button>'
+ '<button data-action="remove" data-id="' + launcher.id + '">Remove</button>'
+ '</div></div>';
}).join('');
}

function renderLogFilter() {
const options = ['<option value="all">All launchers</option>']
.concat(launchers.map((launcher) => '<option value="' + launcher.id + '">' + escapeHtml(launcher.name) + '</option>'));
logFilterEl.innerHTML = options.join('');
if (!launchers.some((launcher) => launcher.id === logFilter)) {
logFilter = 'all';
}
logFilterEl.value = logFilter;
}

function renderLogs() {
const visible = logFilter === 'all' ? logs : logs.filter((entry) => entry.launcherId === logFilter);
if (!visible.length) {
logsContent.className = 'empty';
logsContent.textContent = 'No logs yet.';
return;
}
logsContent.className = '';
logsContent.textContent = visible
.map((entry) => '[' + new Date(entry.timestamp).toLocaleTimeString() + '] '
+ '[' + entry.launcherName + '] '
+ '[' + entry.stream + '] '
+ entry.message)
.join('\n');
}

function render() {
renderLaunchers();
renderLogFilter();
renderLogs();
}

window.addEventListener('message', (event) => {
if (!event.data || event.data.type !== 'state') {
return;
}
launchers = event.data.launchers || [];
logs = event.data.logs || [];
render();
});

tabLaunchers.addEventListener('click', () => setTab('launchers'));
tabLogs.addEventListener('click', () => setTab('logs'));

launcherForm.addEventListener('submit', (event) => {
event.preventDefault();
if (!launcherName.value.trim() || !launcherScript.value.trim()) {
return;
}
vscode.postMessage({ type: 'addLauncher', name: launcherName.value, script: launcherScript.value });
launcherName.value = '';
launcherScript.value = '';
launcherName.focus();
});

launchersEl.addEventListener('click', (event) => {
const target = event.target;
if (!(target instanceof HTMLButtonElement)) {
return;
}
const action = target.getAttribute('data-action');
const id = target.getAttribute('data-id');
if (!action || !id) {
return;
}
if (action === 'start') {
vscode.postMessage({ type: 'startLauncher', id });
} else if (action === 'stop') {
vscode.postMessage({ type: 'stopLauncher', id });
} else if (action === 'remove') {
vscode.postMessage({ type: 'removeLauncher', id });
}
});

logFilterEl.addEventListener('change', () => {
logFilter = logFilterEl.value;
renderLogs();
});

clearLogsBtn.addEventListener('click', () => {
vscode.postMessage({ type: 'clearLogs', launcherId: logFilter === 'all' ? undefined : logFilter });
});

function escapeHtml(value) {
return value
.replaceAll('&', '&amp;')
.replaceAll('<', '&lt;')
.replaceAll('>', '&gt;')
.replaceAll('"', '&quot;')
.replaceAll("'", '&#39;');
}
</script>
</body>
</html>`;
}
}

export function activate(context: vscode.ExtensionContext): void {
const provider = new PanelMeViewProvider(context);
context.subscriptions.push(provider);
context.subscriptions.push(
vscode.window.registerWebviewViewProvider(VIEW_ID, provider, {
webviewOptions: {
retainContextWhenHidden: true,
},
})
);
}

export function deactivate(): void {}

function getNonce(): string {
const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
let result = '';
for (let index = 0; index < 32; index++) {
result += chars.charAt(Math.floor(Math.random() * chars.length));
}
return result;
}

export { LauncherManager, LauncherState, LogEntry };
