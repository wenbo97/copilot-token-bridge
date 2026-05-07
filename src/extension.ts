import * as vscode from 'vscode';
import * as http from 'http';
import { handleToken, clearTokenCache } from './handlers/token';
import { initLog, log } from './log';

const DEFAULT_PORT = 3774;
let server: http.Server | undefined;
let activePort: number = DEFAULT_PORT;
let statusBarItem: vscode.StatusBarItem;

export async function activate(context: vscode.ExtensionContext) {
	initLog();
	log('Extension activating...');

	statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
	context.subscriptions.push(statusBarItem);

	startServer();

	context.subscriptions.push(
		vscode.commands.registerCommand('copilot-token-bridge.startServer', () => startServer()),
		vscode.commands.registerCommand('copilot-token-bridge.stopServer', () => stopServer())
	);
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

function startServer() {
	if (server) {
		vscode.window.showInformationMessage(`Copilot Token Bridge already running on port ${activePort}`);
		return;
	}

	activePort = getConfiguredPort();

	const srv = http.createServer(async (req, res) => {
		const start = Date.now();
		log(`→ ${req.method} ${req.url}`);

		try {
			const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
			const pathname = url.pathname;

			if (req.method === 'GET' && pathname === '/token') {
				const force = url.searchParams.get('force') === 'true';
				await handleToken(res, force);
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

	srv.on('error', (err: any) => {
		if (err.code === 'EADDRINUSE') {
			log(`Port ${activePort} is already in use`);
			vscode.window.showErrorMessage(`Copilot Token Bridge: Port ${activePort} is already in use`);
		} else {
			log(`Server error: ${err.message}`);
			vscode.window.showErrorMessage(`Copilot Token Bridge error: ${err.message}`);
		}
		server = undefined;
	});

	srv.listen(activePort, '127.0.0.1', () => {
		log(`Server listening on http://127.0.0.1:${activePort}`);
		vscode.window.showInformationMessage(`Copilot Token Bridge started on port ${activePort}`);
		statusBarItem.text = `$(key) Copilot Token :${activePort}`;
		statusBarItem.tooltip = 'Click to stop Copilot Token Bridge';
		statusBarItem.command = 'copilot-token-bridge.stopServer';
		statusBarItem.show();
	});

	server = srv;
}

function stopServer() {
	if (!server) { return; }
	server.close();
	server = undefined;
	clearTokenCache();
	statusBarItem.hide();
	log('Server stopped, token cache cleared');
	vscode.window.showInformationMessage('Copilot Token Bridge stopped');
}

export function deactivate() {
	stopServer();
}
