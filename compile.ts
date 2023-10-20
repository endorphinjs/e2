import path from 'node:path';
import fs from 'node:fs/promises';
import { compile } from './src/compiler';

const input = process.argv[2];
const output = process.argv[3];

if (!input) {
    console.error('No input file specified');
    process.exit(1);
}

const src = await fs.readFile(input, 'utf-8');
const compiled = compile(src);

if (output) {
    await fs.writeFile(path.resolve(output), compiled);
    console.log('Compiled %s to %s', input, output);
} else {
    console.log(compiled);
}
