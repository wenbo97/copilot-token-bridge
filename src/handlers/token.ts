import * as vscode from 'vscode';
import * as http from 'http';
import * as https from 'https';
import { log } from '../log';

let cachedCopilotToken: { token: string; expires_at: number } | undefined;

export async function handleToken(res: http.ServerResponse, force = false) {
	try {
		if (force) {
			cachedCopilotToken = undefined;
			log('Force refresh: cleared cached token');
		}

		const githubToken = await getGitHubToken();
		log(`GitHub OAuth token obtained (${githubToken.slice(0, 8)}...)`);

		const copilotToken = await getCopilotToken(githubToken);
		log(`Copilot internal token obtained, expires_at=${copilotToken.expires_at}`);

		res.writeHead(200, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify(copilotToken));
	} catch (err: any) {
		log(`Token error: ${err.message}`);
		res.writeHead(500, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({ error: { message: err.message } }));
	}
}

async function getGitHubToken(): Promise<string> {
	const session = await vscode.authentication.getSession('github', ['copilot'], { createIfNone: true });
	if (!session) {
		throw new Error('No GitHub session available. Please sign in to GitHub in VS Code.');
	}
	return session.accessToken;
}

async function getCopilotToken(githubToken: string): Promise<any> {
	if (cachedCopilotToken && cachedCopilotToken.expires_at > Math.floor(Date.now() / 1000) + 60) {
		log('Using cached Copilot token');
		return cachedCopilotToken;
	}

	const result = await httpGet('https://api.github.com/copilot_internal/v2/token', {
		'Authorization': `token ${githubToken}`,
		'User-Agent': 'vscode-claude-proxy-ext',
		'Accept': 'application/json',
	});

	cachedCopilotToken = JSON.parse(result);
	return cachedCopilotToken;
}

function httpGet(url: string, headers: Record<string, string>): Promise<string> {
	return new Promise((resolve, reject) => {
		const req = https.request(url, { method: 'GET', headers }, (res) => {
			const chunks: Buffer[] = [];
			res.on('data', (c: Buffer) => chunks.push(c));
			res.on('end', () => {
				const body = Buffer.concat(chunks).toString();
				if (res.statusCode && res.statusCode >= 400) {
					reject(new Error(`HTTP ${res.statusCode}: ${body}`));
				} else {
					resolve(body);
				}
			});
		});
		req.on('error', reject);
		req.end();
	});
}
