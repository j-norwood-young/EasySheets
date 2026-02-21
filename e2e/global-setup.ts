import { execSync } from 'child_process';
import { mkdirSync, existsSync } from 'fs';
import { join } from 'path';

export default function globalSetup() {
	const dataDir = join(process.cwd(), 'data');
	if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
	process.env.DB_PATH = process.env.DB_PATH || 'file:./data/sqlite.db';
	execSync('pnpm db:migrate', {
		stdio: 'inherit',
		cwd: process.cwd(),
		env: { ...process.env, DB_PATH: 'file:./data/sqlite.db' }
	});
}
