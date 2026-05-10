export type ItemConstant = { dname?: string; img?: string; icon?: string };
const FALLBACK_ITEM_KEY_BY_ID: Record<number, string> = {50:'phase_boots',108:'desolator',112:'basher',116:'black_king_bar',135:'armlet',147:'sange_and_yasha',156:'satanic',168:'mjollnir',208:'abyssal_blade',603:'assault'};
let itemKeyById: Record<number, string> = { ...FALLBACK_ITEM_KEY_BY_ID };
let itemByKey: Record<string, ItemConstant> = {};
export function setItemConstants(next:{itemKeyById:Record<number,string>;itemByKey:Record<string,ItemConstant>}){ itemKeyById=Object.keys(next.itemKeyById).length?next.itemKeyById:{...FALLBACK_ITEM_KEY_BY_ID}; itemByKey=next.itemByKey; }
export function getItemKeyById(itemId:number):string|null{ if(!Number.isFinite(itemId)||itemId<=0) return null; return itemKeyById[itemId]??null; }
export function humanizeItemKey(key:string):string{ if(!key) return 'Unknown Item'; return key.split('_').map((part)=>(part?part[0].toUpperCase()+part.slice(1):part)).join(' '); }
export function getItemNameByKey(key:string):string{ const normalizedKey=key?.trim(); if(!normalizedKey) return 'Unknown Item'; return itemByKey[normalizedKey]?.dname ?? humanizeItemKey(normalizedKey); }
export function getItemNameById(itemId:number):string|null{ const key=getItemKeyById(itemId); return key?getItemNameByKey(key):null; }
export function getItemIconUrlByKey(itemKey:string):string|null{ const normalizedKey=itemKey?.trim(); if(!normalizedKey) return null; const path=itemByKey[normalizedKey]?.img ?? itemByKey[normalizedKey]?.icon; if(path) return `https://cdn.cloudflare.steamstatic.com${path}`; return `https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/items/${normalizedKey}.png`; }
