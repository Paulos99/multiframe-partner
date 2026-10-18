import {readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
for(const f of readdirSync('.', {recursive:true}).filter(f=>!String(f).includes('node_modules')&&/\.(js|mjs)$/.test(String(f)))) {
  const result=spawnSync(process.execPath,['--check',String(f)],{stdio:'inherit'}); if(result.status)process.exit(result.status);
}
