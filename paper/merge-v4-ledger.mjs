import fs from 'node:fs';

const MAIN = 'public/paper/trades.json';
const V4 = 'public/paper/v4-trades.json';

function key(row) {
  return `${row.source}|${row.date}|${row.strategy}|${row.trailStepPoints ?? ''}`;
}

if (!fs.existsSync(V4)) process.exit(0);
let main = { meta: {}, trades: [] };
if (fs.existsSync(MAIN)) main = JSON.parse(fs.readFileSync(MAIN, 'utf8'));
const v4 = JSON.parse(fs.readFileSync(V4, 'utf8'));
main.trades = Array.isArray(main.trades) ? main.trades : [];
const existing = new Set(main.trades.map(key));
for (const row of Array.isArray(v4.trades) ? v4.trades : []) {
  if (!existing.has(key(row))) {
    main.trades.push(row);
    existing.add(key(row));
  }
}
const paperStrategies = new Set(Array.isArray(main.meta?.paperStrategies) ? main.meta.paperStrategies : []);
for (const value of ['V2', 'V3-5', 'V3-10', 'V4']) paperStrategies.add(value);
main.meta = { ...main.meta, paperMode: true, paperStrategies: [...paperStrategies] };
fs.writeFileSync(MAIN, JSON.stringify(main, null, 2));
