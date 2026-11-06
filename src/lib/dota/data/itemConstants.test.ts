import assert from 'node:assert/strict';
import test from 'node:test';
import { getItemIconUrlByKey, getItemIconCandidates, getItemKeyById, getItemNameById, getItemNameByKey, setItemConstants } from './itemConstants';

test('Valve RU snapshot keeps canonical keys separate from safe display names', () => {
  setItemConstants({ itemKeyById: {}, itemByKey: {} });
  assert.equal(getItemKeyById(137), 'radiance');
  assert.equal(getItemNameById(137), 'Radiance');
  assert.equal(getItemNameByKey('butterfly'), 'Butterfly');
  assert.equal(getItemNameByKey('unknown_new_item'), 'Unknown New Item');
});

test('item images accept relative and absolute CDN paths without doubling the origin', () => {
  const url = 'https://cdn.steamstatic.com/apps/dota2/images/dota_react/items/radiance.png';
  setItemConstants({ itemKeyById: {}, itemByKey: { radiance: { img: url }, armlet: { img: '/apps/dota2/images/dota_react/items/armlet.png' } } });
  assert.equal(getItemIconUrlByKey('radiance'), url);
  assert.equal(getItemIconUrlByKey('armlet'), 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/items/armlet.png');
  assert.equal(getItemIconUrlByKey('../radiance'), null);
  assert.deepEqual(getItemIconCandidates('radiance', url), [url, 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/items/radiance.png']);
  assert.ok(getItemIconCandidates('radiance', 'https://example.org/a.png').every((url) => url.includes('steamstatic.com/')));
  setItemConstants({ itemKeyById: {}, itemByKey: {} });
});
