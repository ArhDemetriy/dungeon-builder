import { type Remote, wrap } from 'comlink';

import type { SaveWorkerApi } from './saveWorker';

let workerApi: Remote<SaveWorkerApi> | null = null;
export const getSaveWorker = () =>
  workerApi ??
  (workerApi = wrap<SaveWorkerApi>(
    new Worker(new URL('./saveWorker.ts', import.meta.url), {
      type: 'module',
    })
  ));
