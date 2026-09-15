import assert from 'node:assert/strict';
import test from 'node:test';
import { localizePreGameText } from './preGameCopy';

test('RU presentation mappings return user-facing Russian', () => {
  assert.equal(localizePreGameText('enemy short-trade pressure is high', 'ru'), 'Противник силён в коротких разменах');
  assert.equal(localizePreGameText('short_trade_burst', 'ru'), 'Сильный урон в коротких разменах');
  assert.equal(localizePreGameText('secure last hits', 'ru'), 'Помогает надёжнее добивать крипов');
});

test('EN presentation keeps the existing English meaning', () => {
  assert.equal(localizePreGameText('enemy short-trade pressure is high', 'en'), 'enemy short-trade pressure is high');
  assert.equal(localizePreGameText('short_trade_burst', 'en'), 'short trade burst');
});

test('unknown keys have a safe readable fallback', () => {
  assert.equal(localizePreGameText('unknown_copy_key', 'ru'), 'unknown copy key');
});
