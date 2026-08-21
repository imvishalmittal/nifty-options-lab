import fs from 'node:fs';

export function buildPartitions({ scope, customStart = '', customEnd = '', customLot = 65, today = new Date() }) {
  const partitions = [];
  const addMonths = (startYear, startMonth, endYear, endMonth, finalEnd = null) => {
    for (let year = startYear; year <= endYear; year += 1) {
      for (let month = year === startYear ? startMonth : 1; month <= (year === endYear ? endMonth : 12); month += 1) {
        const mm = String(month).padStart(2, '0');
        const last = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
        partitions.push({
          label: `${year}-${mm}`,
          start: `${year}-${mm}-01`,
          end: finalEnd && year === endYear && month === endMonth ? finalEnd : last,
          lot: 'auto',
        });
      }
    }
  };

  if (scope === 'discovery-2020-2024') addMonths(2020, 1, 2024, 12);
  else if (scope === 'validation-2025') addMonths(2025, 1, 2025, 12);
  else if (scope === 'holdout-2026') {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(today).map((part) => [part.type, part.value]));
    const isoToday = `${parts.year}-${parts.month}-${parts.day}`;
    const end = isoToday.slice(0, 4) === '2026' ? isoToday : '2026-12-31';
    addMonths(2026, 1, 2026, Number(end.slice(5, 7)), end);
  } else if (scope === 'custom') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(customStart) || !/^\d{4}-\d{2}-\d{2}$/.test(customEnd) || customStart > customEnd) {
      throw new Error('custom_start and custom_end must be ordered YYYY-MM-DD dates');
    }
    if (!(Number(customLot) > 0)) throw new Error('custom_lot_size must be positive');
    partitions.push({ label: 'custom', start: customStart, end: customEnd, lot: Number(customLot) });
  } else {
    throw new Error(`Unsupported scope: ${scope}`);
  }
  return partitions;
}

export function resolveWorkflowRequest(env = process.env) {
  if (env.INPUT_SCOPE) {
    return {
      scope: env.INPUT_SCOPE,
      customStart: env.INPUT_CUSTOM_START ?? '',
      customEnd: env.INPUT_CUSTOM_END ?? '',
      customLot: env.INPUT_CUSTOM_LOT ?? 65,
    };
  }
  if (!env.REQUEST_FILE || !fs.existsSync(env.REQUEST_FILE)) throw new Error('No workflow input or run-request file found');
  const request = JSON.parse(fs.readFileSync(env.REQUEST_FILE, 'utf8'));
  return {
    scope: request.scope,
    customStart: request.customStart ?? '',
    customEnd: request.customEnd ?? '',
    customLot: request.customLot ?? 65,
  };
}

function main() {
  const request = resolveWorkflowRequest();
  const partitions = buildPartitions(request);
  if (!process.env.GITHUB_OUTPUT) throw new Error('GITHUB_OUTPUT is required');
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `result=${JSON.stringify({ include: partitions })}\ncount=${partitions.length}\n`);
  process.stdout.write(`${JSON.stringify({ request, partitions: partitions.length })}\n`);
}

if (process.argv[1]?.endsWith('workflow-plan.mjs')) {
  try { main(); } catch (error) {
    console.error(error.stack || error.message);
    process.exit(1);
  }
}
