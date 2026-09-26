import { execFileSync } from 'node:child_process';
const args=process.argv.slice(2);
execFileSync('node',['research/idea18-diagnostic.mjs',...args],{stdio:'inherit'});
execFileSync('node',['research/idea19-diagnostic.mjs',...args],{stdio:'inherit'});
