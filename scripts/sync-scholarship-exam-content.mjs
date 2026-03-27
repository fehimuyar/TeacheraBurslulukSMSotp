import fs from 'node:fs';
import path from 'node:path';
import {
  SCHOLARSHIP_EXAM_CONTENT_DIR,
  SCHOLARSHIP_EXAM_PACKAGE_DIR,
  SCHOLARSHIP_EXAM_SHARED_SHELL_DIR,
} from '../packages/shared/scholarship-exam/index.js';

const root = process.cwd();
const targetDirs = [
  {
    label: 'www-public-content',
    source: SCHOLARSHIP_EXAM_CONTENT_DIR,
    target: path.join(root, 'apps', 'www', 'public', 'bursluluk-exam', 'content'),
  },
  {
    label: 'www-public-shared-shell',
    source: SCHOLARSHIP_EXAM_SHARED_SHELL_DIR,
    target: path.join(root, 'apps', 'www', 'public', 'bursluluk-exam', 'shared-shell'),
  },
  {
    label: 'exam-api-private-content',
    source: SCHOLARSHIP_EXAM_CONTENT_DIR,
    target: path.join(root, 'apps', 'exam-api', 'private', 'scholarship-exam', 'content'),
  },
];

function syncDirectory({ source, target }) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.rmSync(target, { recursive: true, force: true });
  fs.cpSync(source, target, { recursive: true });
}

for (const descriptor of targetDirs) {
  syncDirectory(descriptor);
  console.log(`synced:${descriptor.label}:${path.relative(root, descriptor.target)}`);
}

console.log(`source:${path.relative(root, SCHOLARSHIP_EXAM_PACKAGE_DIR)}`);
console.log('sync_scholarship_exam_content_done');
