# STRATZ_RESEARCH

## Confirmed status
- Endpoint `https://api.stratz.com/graphql` works.
- Auth with `STRATZ_API_TOKEN` works.
- Response content-type can be `application/graphql-response+json`.
- PowerShell inline JSON can break `curl.exe` arguments.
- Reliable local test uses `ConvertTo-Json` + `Set-Content` + `--data-binary @file`.

## Confirmed working query: basic
```graphql
query DebugStratz($id: Long!) {
  match(id: $id) {
    id
    players {
      steamAccountId
      heroId
    }
  }
}
```

## Confirmed working query: playerDeep
```graphql
query DebugStratzPlayerDeep($id: Long!) {
  match(id: $id) {
    id
    durationSeconds
    players {
      steamAccountId
      heroId
      kills
      deaths
      assists
      goldPerMinute
      experiencePerMinute
      networth
      level
      item0Id
      item1Id
      item2Id
      item3Id
      item4Id
      item5Id
    }
  }
}
```

## Confirmed data: match `8781054570` / Lifestealer
- `heroId`: 54
- `KDA`: 19 / 9 / 18
- `GPM`: 760
- `XPM`: 990
- `networth`: 47587
- `level`: 30
- final item IDs: `603, 147, 135, 168, 208, 112`

## Rejected / not confirmed
- `teamfights` is not a field on `MatchType`.
- Query `match(id) { teamfights { ... } }` returns: `Cannot query field "teamfights" on type "MatchType"`.

## Debug routes
- `GET /api/debug/stratz/match/:id?query=basic`
- `GET /api/debug/stratz/match/:id?query=playerDeep`
- `GET /api/debug/stratz/match/:id?query=teamfightsProbe`
- `GET /api/debug/stratz/schema?type=MatchType`

## Schema discovery instruction
1. Try introspection route first: `/api/debug/stratz/schema?type=MatchType`.
2. If introspection is blocked/denied, use STRATZ GraphQL Explorer.
3. Manually inspect `MatchType` and connected player/event types.
4. Only after field confirmation, promote findings from research/debug to product-ready.

Do not build product conclusions like **first death in fight**, **solo death**, or **death location** until schema fields are confirmed.

## Research questions
1. Where does STRATZ expose fight events, if at all?
2. Does `MatchType` expose playback/replay fields?
3. Are death events available directly on players?
4. Are death coordinates available?
5. Is order of deaths in fights available?
6. Are item purchases/timings available, or only final item slots?
7. Is farm breakdown available beyond basic stats?
8. Is IMP available through API?

## PowerShell: confirmed curl flow
```powershell
$body = @{
  query = 'query DebugStratz($id: Long!) { match(id: $id) { id players { steamAccountId heroId } } }'
  variables = @{
    id = 8781054570
  }
} | ConvertTo-Json -Depth 10 -Compress

$body | Set-Content -Encoding UTF8 stratz-body.json

curl.exe -i https://api.stratz.com/graphql `
  -H "Authorization: Bearer $env:STRATZ_API_TOKEN" `
  -H "Content-Type: application/json" `
  -H "User-Agent: dota-coach-mvp/0.1 local-dev" `
  --data-binary "@stratz-body.json"
```

Do not use inline unescaped JSON with `curl.exe` in PowerShell; it can split JSON into invalid arguments.
