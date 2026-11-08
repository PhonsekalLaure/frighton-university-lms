import { runLibraryMaintenance } from '../services/libraryMaintenance.js';
import { config } from '../config/env.js';
if (!config.sis.apiKey || !config.service.apiKey || config.sis.apiKey === config.service.apiKey)
  throw new Error('Configure distinct directional integration credentials before starting the worker.');
const stop = new AbortController();
process.once('SIGINT', () => stop.abort());
process.once('SIGTERM', () => stop.abort());
while (!stop.signal.aborted) {
  const start = Date.now();
  try {
    await runLibraryMaintenance();
  } catch {
    console.error('Library maintenance failed; retrying on the next cycle.');
  }
  if (!stop.signal.aborted)
    await new Promise<void>((resolve) => {
      const finish = () => {
        clearTimeout(timer);
        stop.signal.removeEventListener('abort', finish);
        resolve();
      };
      const timer = setTimeout(finish, Math.max(1000, 60000 - (Date.now() - start)));
      stop.signal.addEventListener('abort', finish, { once: true });
    });
}
