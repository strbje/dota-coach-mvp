import assert from 'node:assert/strict';
import test from 'node:test';
import { getItemKeyById, getItemNameById, getItemNameByKey, setItemConstants } from './itemConstants';

test('Valve RU snapshot keeps canonical keys separate from safe display names', () => {
  setItemConstants({ itemKeyById: {}, itemByKey: {} });
  assert.equal(getItemKeyById(137), 'radiance');
  assert.equal(getItemNameById(137), 'Radiance');
  assert.equal(getItemNameByKey('butterfly'), 'Butterfly');
  assert.equal(getItemNameByKey('unknown_new_item'), 'Unknown New Item');
});
