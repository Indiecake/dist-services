import { loadServiceConfig } from '../index.ts';

const config = loadServiceConfig();

console.log(JSON.stringify(config, null, 2));
