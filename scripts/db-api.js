#!/usr/bin/env node
const db = require('./db');
db.initDB();

const command = process.argv[2];
const args = process.argv.slice(3);

function parseArgs(args) {
  const result = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2);
      result[key] = args[i + 1] || true;
      i++;
    } else {
      result._positional = result._positional || [];
      result._positional.push(args[i]);
    }
  }
  return result;
}

const opts = parseArgs(args);

switch (command) {
  case 'history':
    console.log(JSON.stringify(db.getRunHistory({
      limit: parseInt(opts.limit) || 50,
      offset: parseInt(opts.offset) || 0,
      type: opts.type,
      status: opts.status
    })));
    break;
  case 'stats':
    console.log(JSON.stringify(db.getStats()));
    break;
  case 'run':
    console.log(JSON.stringify(db.getRunById(parseInt(opts._positional?.[0]))));
    break;
  default:
    console.error('Usage: db-api.js <history|stats|run> [options]');
    process.exit(1);
}
