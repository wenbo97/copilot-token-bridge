import * as vscode from 'vscode';
import * as http from 'http';
import { handleToken, clearTokenCache } from './handlers/token';
import { initLog, log } from './log';

const DEFAULT_PORT = 18774;
const PING_SIGNATURE = 'copilot-token-bridge';
let server: http.Server | undefined;
let activePort: number = DEFAULT_PORT;
let statusBarItem: vscode.StatusBarItem;
let sharedMode = false;
let serverGeneration = 0;

export async function activate(context: vscode.ExtensionContext) {
	initLog();
	log('Extension activating...');

	statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
	context.subscriptions.push(statusBarItem);

	activePort = getConfiguredPort();
	updateStatusBar();

	context.subscriptions.push(
		vscode.commands.registerCommand('copilot-token-bridge.startServer', () => startServer()),
		vscode.commands.registerCommand('copilot-token-bridge.stopServer', () => stopServer()),
		vscode.commands.registerCommand('copilot-token-bridge.setPort', () => setPort()),
		vscode.commands.registerCommand('copilot-token-bridge.showMenu', () => showMenu()),
		vscode.workspace.onDidChangeConfiguration((e) => {
			if (e.affectsConfiguration('copilot-token-bridge.port')) {
				const newPort = getConfiguredPort();
				if ((server || sharedMode) && newPort !== activePort) {
					log(`Port changed to ${newPort}, restarting server`);
					stopServer();
					startServer({ silentIfTaken: true });
				} else if (!server && !sharedMode && newPort !== activePort) {
					serverGeneration++;
					activePort = newPort;
					updateStatusBar();
				}
			}
		})
	);
}

function updateStatusBar() {
	const starting = !!server && !server.listening;
	const state = starting ? 'starting' : server ? 'running' : sharedMode ? 'shared' : 'stopped';
	const icon = starting ? 'loading~spin' : server ? 'key' : sharedMode ? 'link' : 'circle-outline';
	statusBarItem.text = `$(${icon}) Copilot Token :${activePort}`;
	statusBarItem.tooltip = sharedMode
		? `Another VS Code window runs the bridge on :${activePort}. Click for actions.`
		: `Copilot Token Bridge is ${state} on :${activePort}. Click to start or stop the server.`;
	statusBarItem.accessibilityInformation = {
		label: `Copilot Token Bridge, ${state}, port ${activePort}. Open server actions.`,
	};
	statusBarItem.command = 'copilot-token-bridge.showMenu';
	statusBarItem.show();
}

async function showMenu() {
	const owning = !!server;
	const items: (vscode.QuickPickItem & { action: string })[] = [];
	if (owning) {
		items.push({ label: '$(debug-stop) Stop server', action: 'stop' });
	} else {
		items.push({ label: '$(play) Start server', action: 'start' });
		if (sharedMode) {
			items.push({
				label: '$(debug-disconnect) Leave shared mode',
				description: 'The server in the other VS Code window keeps running',
				action: 'stop',
			});
		}
	}
	items.push({ label: '$(edit) Change port...', description: `current: ${activePort}`, action: 'setPort' });
	const state = owning ? `${server?.listening ? 'running' : 'starting'} :${activePort}`
		: sharedMode ? `shared :${activePort}` : `stopped :${activePort}`;
	const pick = await vscode.window.showQuickPick(items, {
		title: `Copilot Token Bridge (${state})`,
	});
	if (!pick) { return; }
	if (pick.action === 'setPort') { await setPort(); }
	else if (pick.action === 'stop') { stopServer(); }
	else if (pick.action === 'start') { startServer(); }
}

async function setPort() {
	const current = getConfiguredPort();
	const input = await vscode.window.showInputBox({
		title: 'Copilot Token Bridge: Set Port',
		prompt: 'Enter a TCP port (1-65535). Avoid Windows reserved ranges.',
		value: String(current),
		validateInput: (v) => {
			const n = Number(v);
			if (!Number.isInteger(n) || n < 1 || n > 65535) {
				return 'Port must be an integer between 1 and 65535';
			}
			return null;
		}
	});
	if (input === undefined) { return; }
	const port = Number(input);
	await vscode.workspace.getConfiguration('copilot-token-bridge')
		.update('port', port, vscode.ConfigurationTarget.Global);
	// onDidChangeConfiguration will restart the server
}

function getConfiguredPort(): number {
	const cfg = vscode.workspace.getConfiguration('copilot-token-bridge');
	const port = cfg.get<number>('port', DEFAULT_PORT);
	if (!Number.isInteger(port) || port < 1 || port > 65535) {
		log(`Invalid port setting ${port}, falling back to ${DEFAULT_PORT}`);
		return DEFAULT_PORT;
	}
	return port;
}

function probeExistingInstance(port: number, timeoutMs = 500): Promise<boolean> {
	return new Promise((resolve) => {
		const req = http.get({ host: '127.0.0.1', port, path: '/ping', timeout: timeoutMs }, (res) => {
			let body = '';
			res.on('data', (c) => body += c);
			res.on('end', () => {
				try {
					const j = JSON.parse(body);
					resolve(!!(j && j.service === PING_SIGNATURE));
				} catch { resolve(false); }
			});
		});
		req.on('error', () => resolve(false));
		req.on('timeout', () => { req.destroy(); resolve(false); });
	});
}

function enterSharedMode(port: number) {
	sharedMode = true;
	activePort = port;
	updateStatusBar();
	log(`Another instance owns port ${port}, entering shared mode`);
}

function startServer(opts: { silentIfTaken?: boolean } = {}) {
	if (server) {
		if (!opts.silentIfTaken) {
			vscode.window.showInformationMessage(`Copilot Token Bridge already running on port ${activePort}`);
		}
		return;
	}

	const generation = ++serverGeneration;
	const port = getConfiguredPort();
	activePort = port;
	sharedMode = false;

	const srv = http.createServer(async (req, res) => {
		const start = Date.now();
		log(`→ ${req.method} ${req.url}`);

		try {
			const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
			const pathname = url.pathname;

			if (req.method === 'GET' && pathname === '/token') {
				const force = url.searchParams.get('force') === 'true';
				await handleToken(res, force);
			} else if (req.method === 'GET' && pathname === '/ping') {
				res.writeHead(200, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify({ service: PING_SIGNATURE, pid: process.pid }));
			} else {
				res.writeHead(404, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify({ error: { message: 'Not found' } }));
			}
			log(`← ${res.statusCode} ${req.method} ${req.url} (${Date.now() - start}ms)`);
		} catch (err: any) {
			log(`✘ ERROR ${req.method} ${req.url}: ${err.message}`);
			if (!res.headersSent) {
				res.writeHead(500, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify({ error: { message: err.message ?? 'Internal error' } }));
			} else {
				res.end();
			}
		}
	});

	srv.on('error', async (err: any) => {
		if (generation !== serverGeneration) { return; }
		server = undefined;
		updateStatusBar();
		if (err.code === 'EADDRINUSE') {
			const ours = await probeExistingInstance(port);
			if (generation !== serverGeneration) { return; }
			if (ours) {
				enterSharedMode(port);
				return;
			}
			log(`Port ${activePort} is already in use by another process`);
			if (!opts.silentIfTaken) {
				vscode.window.showErrorMessage(`Copilot Token Bridge: Port ${activePort} is already in use`);
			}
		} else {
			log(`Server error: ${err.message}`);
			vscode.window.showErrorMessage(`Copilot Token Bridge error: ${err.message}`);
		}
	});

	srv.listen(port, '127.0.0.1', () => {
		if (generation !== serverGeneration) { return; }
		sharedMode = false;
		log(`Server listening on http://127.0.0.1:${activePort}`);
		updateStatusBar();
	});

	server = srv;
	updateStatusBar();
}

function stopServer() {
	serverGeneration++;
	if (sharedMode) {
		sharedMode = false;
		updateStatusBar();
		log('Exited shared mode');
		return;
	}
	if (!server) {
		updateStatusBar();
		return;
	}
	server.close();
	server = undefined;
	clearTokenCache();
	updateStatusBar();
	log('Server stopped, token cache cleared');
	vscode.window.showInformationMessage('Copilot Token Bridge stopped');
}

export function deactivate() {
	stopServer();
}
