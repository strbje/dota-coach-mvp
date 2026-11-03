"""Build an offline review fixture from the two real captures; no product calculations.
Usage: capture.json observations-2026-11-04.json decoded-directory new-output.json
"""
import bisect
import hashlib
import json
import sys
from pathlib import Path

if not __debug__:
    raise SystemExit('Assertions must stay enabled')


def sha(path):
    with path.open('rb') as source:
        return hashlib.file_digest(source, 'sha256').hexdigest()


def point(row):
    p = row['point']
    return [p['cell'][i]*128 + p['vec'][i] - 16384 for i in range(2)]


def compact(value, depth=0):
    inline = json.dumps(value, ensure_ascii=False)
    if len(inline) + depth*2 <= 380:
        return inline
    pad = '  '*(depth+1)
    if isinstance(value, dict):
        parts = [json.dumps(k)+': '+compact(v,depth+1) for k,v in value.items()]
        return '{\n'+',\n'.join(pad+p for p in parts)+'\n'+'  '*depth+'}'
    return '[\n'+',\n'.join(pad+compact(v,depth+1) for v in value)+'\n'+'  '*depth+']'


def build(capture_path, protocol_path, decoded_dir):
    capture = json.loads(capture_path.read_text(encoding='utf-8-sig'))
    protocol = json.loads(protocol_path.read_text(encoding='utf-8'))
    assert sha(capture_path) == protocol['stratzCaptureSha256']
    result = {'schemaVersion': 1, 'productReady': False,
              'source': {'captureSha256': sha(capture_path), 'protocolSha256': sha(protocol_path),
                         'builderSha256': sha(Path(__file__)), 'synthetic': False,
                         'csJoin': 'First increasing WK/skeleton lastHits counter, consecutive 1..N, within 2s of STRATZ; no XY used',
                         'mapAssetStatus': 'unavailable'}, 'matches': []}
    labels = {'dota_goodguys_tower2_bot': 'Radiant: нижняя башня 2',
              'dota_badguys_tower2_top': 'Dire: верхняя башня 2',
              'ent_dota_fountain_bad': 'Фонтан Dire', 'ent_dota_fountain_good': 'Фонтан Radiant',
              'npc_dota_roshan': 'Рошан: появление'}
    for probe in capture['probes']:
        raw = probe['raw']; mid = raw['id']; player = raw['players'][0]
        verified = next(m for m in protocol['matches'] if m['matchId'] == mid)
        decoded = decoded_dir / f'{mid}.verified.jsonl'
        assert sha(decoded) == verified['decodeSha256'], 'Different decoded replay'
        with decoded.open(encoding='utf-8') as source:
            rows = [json.loads(line) for line in source]
        assert rows[-1]['kind'] == 'complete' and rows[-1]['rowsBeforeComplete'] == len(rows)-1
        start = rows[-1]['gameStart']
        heroes = [r for r in rows if r['kind'] == 'hero']
        times = [r['clock']['absoluteTime']-start for r in heroes]
        dying = [r for r in rows if r['kind'] == 'dying']
        increments = {}; high = 0
        for row in rows:
            if row['kind'] != 'combat' or row['type'] != 'DOTA_COMBATLOG_DEATH':
                continue
            if row['attacker'] not in ['npc_dota_hero_skeleton_king', 'npc_dota_wraith_king_skeleton_warrior']:
                continue
            count = row['lastHits']
            if count is not None and count > high:
                assert count == high+1, 'Gap in last-hit counter; cannot establish ordinal join'
                increments[count] = row
                high = count
        cs = player['playbackData']['csEvents']
        assert len(increments) == len(cs) == player['numLastHits']
        events = []
        for index, event in enumerate(cs):
            death = increments[index+1]; replay_time = death['timestamp']-start
            assert abs(replay_time-event['time']) <= 2, 'Ordinal/time mismatch'
            flags = [event[key] for key in ['isCreep','isNeutral','isAncient']]
            assert sum(flags) <= 1, 'Overlapping flags need explicit handling'
            category = ['lane','neutral','ancient'][flags.index(True)] if any(flags) else 'unclassified'
            executor = 'hero' if death['attacker'] == 'npc_dota_hero_skeleton_king' else 'skeleton'
            events.append({'index': index, 'time': event['time'],
                           'xy': [event['positionX'], event['positionY']], 'category': category,
                           'executor': executor, 'target': death['target'], 'replayTime': replay_time})
        # These examples were selected before the visual stage; do not choose by XY agreement.
        example_indices = [0,12,65,179,245,274] if mid == 9019592113 else [0,5,43,90,176,177,236]
        examples = []
        for index in example_indices:
            event = events[index]; t = event['replayTime']; insertion = bisect.bisect_left(times,t)
            nearest = min(range(max(0,insertion-2),min(len(times),insertion+3)),key=lambda i:abs(times[i]-t))
            # Not a victim identity join: retain ALL dying entities within this window.
            candidates = [r for r in dying if abs(r['clock']['absoluteTime']-start-t) <= 0.1]
            examples.append({'index':index,'hero':{'time':times[nearest],'world':point(heroes[nearest])},
                             'dyingCandidates':[{'time':r['clock']['absoluteTime']-start,
                                'world':point(r),'className':r['point']['class'],'handle':r['point']['handle']}
                                for r in candidates]})
        result['matches'].append({'id':mid,'side':'Radiant' if player['isRadiant'] else 'Dire',
            'heroId':42,'slot':player['playerSlot'],'duration':raw['durationSeconds'],
            'gameVersion':verified['context']['gameVersion'], 'lastHits':player['numLastHits'],
            'decodeSha256':verified['decodeSha256'], 'farm':events, 'farmExamples':examples,
            'deaths':[{'index':d['index'],'time':d['stratzTime'],'replayTime':d['replayCombatTime'],
                'eventXY':d['stratzEventXY'],'candidateXY':d['adapterXY'],
                'candidateTime':d['nearestStratzTime'] if d['adapterConfidence']!='unmatched' else None,
                'confidence':d['adapterConfidence'],'sameCell':d['adapterSameCell'],
                'worldError':d['adapterErrorLength'], 'referenceWorld':d['replayDying']['world'],
                'referenceTime':d['replayDying']['time'],'referenceCell':d['replayDying']['cell']}
                for d in verified['deaths']],
            'landmarks':[{'label':labels[p['unitName']], 'time':p['time'],'team':p['team'],
                          'world':p['world'],'cell':p['cell']} for p in verified['landmarks']],
            'bounds':{'xMin':-8448,'xMax':8448,'yMin':-9472,'yMax':8448}})
    return result


if __name__ == '__main__':
    if len(sys.argv) != 5:
        raise SystemExit('capture.json protocol.json decoded-directory new-output.json')
    capture, protocol, decoded, output = map(Path,sys.argv[1:])
    if output.exists():
        raise SystemExit('Refusing to overwrite existing fixture')
    data = build(capture,protocol,decoded)
    # One event per line keeps the independently inspectable fixture compact.
    with output.open('x',encoding='utf-8') as target:
        target.write(compact(data)+'\n')
    for match in data['matches']:
        print(match['id'], 'last hits',len(match['farm']),
              'skeleton',sum(e['executor']=='skeleton' for e in match['farm']))
