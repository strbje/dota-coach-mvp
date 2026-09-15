import assert from 'node:assert/strict';
import test from 'node:test';
import { inspectSource } from './check-design.mjs';

test('allows token usage, CSS Modules badge, and dynamic grade width', () => {
  assert.deepEqual(
    inspectSource('.panel { border: var(--border-width) solid var(--color-border); }', 'panel.module.css'),
    []
  );
  assert.deepEqual(inspectSource('<Badge className={styles.badge} />', 'badge.tsx'), []);
  assert.deepEqual(inspectSource('<span style={{ width: `${score}%` }} />', 'grade.tsx'), []);
});

test('rejects raw colors and guarded systemic values including local variables', () => {
  const source = [
    '.color { color: #fff; }',
    '.radius { border-radius: 8px; }',
    '.control { --control: 44px; width: var(--control); }'
  ].join('\n');
  assert.equal(inspectSource(source, 'example.css').length, 3);
});

test('rejects raw borders, font sizes, and transition durations', () => {
  const source = [
    '.panel { border: 1px solid var(--color-border); }',
    '.accent { border-left: 3px solid var(--color-brand); }',
    '.score { font-size: 2rem; }',
    '.button { transition: color 160ms; }'
  ].join('\n');
  assert.equal(inspectSource(source, 'example.css').length, 4);
});

test('rejects static inline spacing and dimensions', () => {
  assert.equal(inspectSource('<div style={{ marginTop: "1rem" }} />', 'example.tsx').length, 1);
  assert.equal(inspectSource('<div style={{ gap: "8px" }} />', 'example.tsx').length, 1);
  assert.equal(inspectSource('<div style={{ width: "44px" }} />', 'example.tsx').length, 1);
});

test('rejects exact legacy global classes without blocking similarly named classes', () => {
  assert.equal(inspectSource('<article className="card grade-card" />', 'grade.tsx').length, 1);
  assert.equal(inspectSource('<span className={`badge ${tone}`} />', 'badge.tsx').length, 1);
  assert.deepEqual(inspectSource('<article className="grade-card" />', 'grade.tsx'), []);
});

test('allows unique layout and runtime computed values', () => {
  assert.deepEqual(inspectSource('.hero { max-width: 763px; }', 'hero.css'), []);
  assert.deepEqual(inspectSource('<div style={{ width: value, gap }} />', 'runtime.tsx'), []);
});
