const FALLBACK_HERO_KEY_BY_ID: Record<number, string> = { 54: 'life_stealer' };
const FALLBACK_HERO_NAME_BY_KEY: Record<string, string> = { life_stealer: 'Lifestealer' };
let heroKeyById: Record<number, string> = { ...FALLBACK_HERO_KEY_BY_ID };
let heroNameByKey: Record<string, string> = { ...FALLBACK_HERO_NAME_BY_KEY };
export function setHeroConstants(next:{heroKeyById:Record<number,string>;heroNameByKey:Record<string,string>}){ heroKeyById=Object.keys(next.heroKeyById).length?next.heroKeyById:{...FALLBACK_HERO_KEY_BY_ID}; heroNameByKey=Object.keys(next.heroNameByKey).length?next.heroNameByKey:{...FALLBACK_HERO_NAME_BY_KEY}; }
export function getHeroKeyById(heroId:number):string|null{ if(!Number.isFinite(heroId)||heroId<=0) return null; return heroKeyById[heroId]??null; }
export function getHeroNameById(heroId:number):string|null{ const key=getHeroKeyById(heroId); return key?heroNameByKey[key]??null:null; }

// Canonical keys only: display names (e.g. Wraith King) are not asset identifiers.
export function getHeroPortraitUrl(heroKey?: string): string | undefined {
  return heroKey && /^[a-z][a-z0-9_]*$/.test(heroKey)
    ? `https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/${heroKey}.png`
    : undefined;
}
