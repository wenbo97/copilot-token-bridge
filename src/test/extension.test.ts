import * as assert from 'assert';
import * as http from 'http';
import * as vscode from 'vscode';

function httpGet(url: string): Promise<{ status: number; body: string }> {
	return new Promise((resolve, reject) => {
		const req = http.get(url, (res) => {
			const chunks: Buffer[] = [];
			res.on('data', (c: Buffer) => chunks.push(c));
			res.on('end', () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString() }));
		});
		req.setTimeout(5_000, () => req.destroy(new Error('timeout')));
		req.on('error', reject);
	});
}

suite('Copilot Token Bridge', () => {
	test('local server responds on configured port', async () => {
		// Activation is triggered by onStartupFinished, but in the test host we
		// nudge it by invoking a contributed command — this guarantees activate()
		// has run before we hit the port.
		await vscode.commands.executeCommand('copilot-token-bridge.startServer');

		const port = vscode.workspace
			.getConfiguration('copilot-token-bridge')
			.get<number>('port', 3774);

		const { status, body } = await httpGet(`http://127.0.0.1:${port}/token`);

		// 200 when GitHub is signed in, 500 when not — both prove the route is wired.
		assert.ok(
			status === 200 || status === 500,
			`Unexpected status ${status}: ${body.slice(0, 200)}`,
		);
		const json = JSON.parse(body);
		if (status === 200) {
			assert.ok(typeof json.token === 'string', 'expected token field on 200');
			assert.ok(typeof json.expires_at === 'number', 'expected expires_at field on 200');
		} else {
			assert.ok(json.error, 'expected error field on 500');
		}
	});

	test('unknown route returns 404', async () => {
		const port = vscode.workspace
			.getConfiguration('copilot-token-bridge')
			.get<number>('port', 3774);
		const { status } = await httpGet(`http://127.0.0.1:${port}/does-not-exist`);
		assert.strictEqual(status, 404);
	});
});
