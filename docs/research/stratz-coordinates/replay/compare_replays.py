"""Research comparison of a saved STRATZ capture, saved adapter output and decoded replays.
No network calls, product calculations, interpolation, or missing-value imputation.
"""
import bisect
import collections
import hashlib
import json
import math
import sys
from pathlib import Path

if not __debug__:
    raise SystemExit('Do not disable assertions: they are evidence validation gates')


def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def world(point):
    if any(value is None for value in point['cell'][:2] + point['vec'][:2]):
        return None
    return [point['cell'][i] * 128 + point['vec'][i] - 16384 for i in range(2)]


def compact(value, depth=0):
    line = json.dumps(value, ensure_ascii=False, separators=(', ', ': '))
    if len(line) + 2 * depth <= 150:
        return line
    pad, end = '  ' * (depth + 1), '  ' * depth
    if isinstance(value, list):
        return '[\n' + ',\n'.join(pad + compact(item, depth + 1) for item in value) + '\n' + end + ']'
    if isinstance(value, dict):
        return '{\n' + ',\n'.join(pad + json.dumps(key) + ': ' + compact(item, depth + 1) for key, item in value.items()) + '\n' + end + '}'
    return line


def compare(capture_path, baseline_path, decoded_dir):
    capture = json.loads(capture_path.read_text(encoding='utf-8-sig'))
    baseline = json.loads(baseline_path.read_text(encoding='utf-8-sig'))
    assert digest(capture_path) == baseline['sourceCapture']['sha256'], 'Different STRATZ capture'
    result = {
        'reviewDateMsk': '2026-11-04', 'methodologyStatus': 'research-only', 'productReady': False,
        'stratzCaptureSha256': digest(capture_path), 'adapterBaselineSha256': digest(baseline_path),
        'comparatorSha256': digest(Path(__file__)),
        'probeSha256': digest(Path(__file__).with_name('ReplayProbe.java')),
        'decoder': 'Clarity 5.0.1 / clarity-protobuf 7.0 / Java 21.0.13',
        'method': {
            'clock': '(serverTick minus totalPausedTicks) times replay tick interval minus gameStart; use pauseStartTick while paused',
            'deathClock': 'Combat log timestamp minus gameStart; timestampRaw retains pause time and is not substituted',
            'deathReference': 'Same selected hero handle, first lifeState transition from 0 at combat death within 0.1s; illusions and willReincarnate=true excluded',
            'positionDiagnostic': 'Compare nearest replay sample to STRATZ integer time, then separately search same cell within +/-1s; latter is not exact time validation',
            'referenceWorld': 'cell*128+vec-16384, checked against two initial +600 combat-log locations below',
            'mapAsset': None, 'visualReplayReview': False,
            'goldJoin': 'Original stream order, equal count and every amount; reason correspondence checked separately. No deduplication.',
            'csExamples': 'Match death log by lastHits ordinal and a 2s window, without using XY to select; preserve ambiguity',
            'objectiveJoin': 'Latest decoded state at or before the STRATZ time, per named building handle; match type/team/cell. Initial building records are not kills.',
        }, 'matches': []
    }
    for probe in capture['probes']:
        match = probe['raw']; match_id = match['id']; player = match['players'][0]
        saved = next(row for row in baseline['matches'] if row['matchId'] == match_id)
        decoded = decoded_dir / f'{match_id}.verified.jsonl'
        with decoded.open(encoding='utf-8') as stream:
            rows = [json.loads(line) for line in stream]
        assert rows[-1]['kind'] == 'complete', 'Incomplete decode'
        assert rows[-1]['rowsBeforeComplete'] == len(rows)-1, 'Missing decoded rows'
        assert rows[0]['kind'] == 'file' and rows[0]['matchId'] == match_id
        start = rows[-1]['gameStart']
        hero = [row for row in rows if row['kind'] == 'hero']
        times = [row['clock']['absoluteTime'] - start for row in hero]
        assert all(a <= b for a, b in zip(times, times[1:])), 'Non-monotonic clock'
        selection = next(row for row in rows if row['kind'] == 'selection')
        handle = selection['point']['handle']
        assert all(row['point']['handle'] == handle for row in hero), 'Multiple selected hero handles'
        assert selection['heroId'] == player['heroId'] == 42
        assert selection['point']['team'] == (2 if player['isRadiant'] else 3)
        assert selection['teamSlot'] == player['playerSlot'] % 128
        def nearby(t, span=0.2):
            return range(bisect.bisect_left(times, t-span), bisect.bisect_right(times, t+span))
        def nearest(t):
            index = bisect.bisect_left(times, t)
            return min(range(max(0, index-2), min(len(hero), index+3)), key=lambda i: abs(times[i]-t))
        def sample(row):
            return {'replayTick': row['clock']['tick'], 'serverTick': row['clock']['serverTick'],
                    'time': row['clock']['absoluteTime']-start, 'cell': row['point']['cell'][:2],
                    'vec': row['point']['vec'][:2], 'world': world(row['point']),
                    'handle': row['point']['handle'], 'lifeState': row['point']['lifeState']}
        combats = [row for row in rows if row['kind'] == 'combat']
        all_deaths = [row for row in combats if row['type'] == 'DOTA_COMBATLOG_DEATH'
                      and row['target'] == 'npc_dota_hero_skeleton_king' and row['targetIllusion'] is False]
        deaths = [row for row in all_deaths if row['willReincarnate'] is False]
        assert len(deaths) == len(player['stats']['deathEvents']) == player['deaths']
        assert len(saved['deaths']['rows']) == len(deaths), 'Incomplete adapter baseline'
        dying = [row for row in rows if row['kind'] == 'dying' and row['point']['handle'] == handle]
        death_report = []
        for index, (death, old) in enumerate(zip(deaths, saved['deaths']['rows'])):
            assert old['eventTime'] == player['stats']['deathEvents'][index]['time'], 'Different baseline death order'
            t = death['timestamp'] - start
            candidates = [row for row in dying if abs(row['clock']['absoluteTime']-start-t) <= 0.1]
            assert len(candidates) == 1, ('Ambiguous death transition', match_id, index)
            point = sample(candidates[0]); adapter_world = old['nearestProjection']['world'] if old['adapterConfidence'] != 'unmatched' else None
            difference = [adapter_world[i]-point['world'][i] for i in range(2)] if adapter_world else None
            death_report.append({'index': index, 'stratzTime': old['eventTime'], 'replayCombatTime': t,
                'stratzMinusReplaySeconds': old['eventTime']-t, 'replayKiller': death['attacker'],
                'stratzEventXY': old['eventXY'], 'adapterXY': old['adapterXY'],
                'adapterConfidence': old['adapterConfidence'], 'nearestStratzTime': old['nearest']['time'],
                'replayDying': point, 'replayReferenceTimeDelta': point['time']-t,
                'adapterSameCell': old['adapterXY'] == point['cell'] if adapter_world else None,
                'adapterWorld': adapter_world, 'adapterMinusReplayWorld': difference,
                'adapterErrorLength': math.hypot(*difference) if difference else None})
        positions = player['playbackData']['playerUpdatePositionEvents']
        position_counts = collections.Counter(); signed_matches = []; missing = []
        for index, position in enumerate(positions):
            xy = [position['x'], position['y']]; t = position['time']; n = nearest(t)
            position_counts['nearestSampleSameCell'] += hero[n]['point']['cell'][:2] == xy
            candidates = [i for i in nearby(t, 1) if hero[i]['point']['cell'][:2] == xy]
            position_counts['sameCellWithinOneSecond'] += bool(candidates)
            if candidates:
                chosen = min(candidates, key=lambda i: abs(times[i]-t)); signed_matches.append(times[chosen]-t)
            else: missing.append(index)
        gold = [row for row in combats if row['type'] == 'DOTA_COMBATLOG_GOLD']
        stratz_gold = player['playbackData']['goldEvents']
        assert len(gold) == len(stratz_gold)
        gold_differences = []; reason_map = collections.defaultdict(set); gold_time_deltas = []
        for index, (g, s) in enumerate(zip(gold, stratz_gold)):
            if g['value'] != s['amount']: gold_differences.append(index)
            reason_map[s['reason']].add(g['goldReason'])
            gold_time_deltas.append(s['time']-(g['timestamp']-start))
        initial = gold[0]; assert initial['value'] == 600 and initial['goldReason'] == 0
        first = sample(hero[0]); initial_location = [initial['locationX'], initial['locationY']]
        offset = [first['cell'][i]*128 + first['vec'][i] - initial_location[i] for i in range(2)]
        assert all(abs(v-16384) < 0.02 for v in offset), 'World offset not confirmed'
        unique_landmarks = {}
        for row in rows:
            if row['kind'] == 'landmark': unique_landmarks.setdefault(row['point']['handle'], row)
        landmarks = []
        wanted = ['CDOTA_Unit_Fountain', 'CDOTA_Unit_Roshan']
        for row in unique_landmarks.values():
            point = row['point']
            if point['class'] in wanted or point['unitName'] in ['dota_goodguys_tower2_bot', 'dota_badguys_tower2_top']:
                landmarks.append({'unitName': point['unitName'], 'class': point['class'], 'team': point['team'], **sample(row)})
        building_checks = []
        for index, event in enumerate(match['playbackData']['buildingEvents']):
            if event['positionX'] is None or event['positionY'] is None: continue
            # This sample contains only initial full pairs. Deletion/recreation is
            # not reconstructed by this helper; reject use on another event scope.
            assert event['time'] == -89, 'Building validation only covers initial state'
            assert isinstance(event['isRadiant'], bool), 'Unknown building team'
            team = 2 if event['isRadiant'] else 3
            eligible = {'TOWER':'CDOTA_BaseNPC_Tower','BARRACKS':'CDOTA_BaseNPC_Barracks','FORT':'CDOTA_BaseNPC_Fort','HEALER':'CDOTA_Unit_Fountain','OUTPOST':'CDOTA_BaseNPC_Watch_Tower'}
            # Entity state persists until an explicit update. Unlike missing STRATZ axes,
            # carrying this decoded state is defined by the replay entity protocol.
            state_at_event = {}
            for row in rows:
                if row['kind'] == 'landmark' and row['clock']['absoluteTime']-start <= event['time']:
                    state_at_event[row['point']['handle']] = row
            found = [row for row in state_at_event.values() if row['point']['class'] == eligible.get(event['type'])
                     and row['point']['team'] == team and row['point']['cell'][:2] == [event['positionX'],event['positionY']]]
            building_checks.append({'stratzIndex': index, 'event': event, 'matches': [dict(unitName=row['point']['unitName'], **sample(row)) for row in found]})
        roshan = [row for row in rows if row['kind'] == 'landmark' and row['point']['class'] == 'CDOTA_Unit_Roshan']
        # Landmark updates are sparse; report observed samples only, never silently carry a missing STRATZ axis.
        roshan_checks = []
        for index, event in enumerate(match['playbackData']['roshanEvents']):
            if event['x'] is None or event['y'] is None: continue
            candidates = [row for row in roshan if abs(row['clock']['absoluteTime']-start-event['time'])<=1
                          and row['point']['cell'][:2] == [event['x'],event['y']]]
            roshan_checks.append({'stratzIndex': index, 'time': event['time'], 'xy': [event['x'],event['y']],
                                  'sameCellObservedWithinOneSecond': bool(candidates)})
        cs_examples = []
        indices = [0,12,65,179,245,274] if match_id == 9019592113 else [0,5,43,90,176,177,236]
        for index in indices:
            event = player['playbackData']['csEvents'][index]
            matches = [row for row in combats if row['type'] == 'DOTA_COMBATLOG_DEATH'
                       and row['lastHits'] == index+1 and abs(row['timestamp']-start-event['time']) <= 2]
            # A lastHits counter is local to the attacker; require the known WK or WK skeleton attribution too.
            matches = [row for row in matches if row['attacker'] in ['npc_dota_hero_skeleton_king','npc_dota_wraith_king_skeleton_warrior']]
            cs_examples.append({'stratzIndex': index, 'event': event, 'heroAtStratzTime': sample(hero[nearest(event['time'])]), 'replayDeaths': [
                {'time': row['timestamp']-start, 'attacker': row['attacker'], 'target': row['target'], 'lastHits': row['lastHits']}
                for row in matches]})
        result['matches'].append({'matchId': match_id, 'heroId': player['heroId'], 'playerSlot': player['playerSlot'],
            'replaySha256': digest(decoded_dir / f'{match_id}.dem'),
            'decodeSha256': digest(decoded), 'decodeRows': len(rows), 'decodeComplete': True,
            'gameStart': start,
            'file': rows[0], 'serverInfo': next(row for row in rows if row['kind']=='serverInfo'),
            'context': next(row for row in rows if row['kind']=='context'),
            'cameraBounds': next(row['fields'] for row in rows if row['kind']=='fields' and row['class']=='CDOTACameraBounds'),
            'selectedResourceIndex': selection['resourceIndex'], 'heroHandle': handle,
            'rawHeroDeathRecords': len(all_deaths), 'reincarnationsExcluded': len(all_deaths)-len(deaths),
            'totalPausedTicks': max(row['clock']['totalPausedTicks'] for row in hero),
            'heroSnapshots': len(hero), 'positions': {'stratzRecords':len(positions), **position_counts,
                'signedNearestSameCellRange': [min(signed_matches),max(signed_matches)], 'missingIndices':missing},
            'initialWorldCrossCheck': {'hero':first,'combatGoldLocation':initial_location,'measuredOffset':offset},
            'deaths': death_report, 'landmarks':landmarks,
            'buildingPairChecks':building_checks,'roshanPairChecks':roshan_checks,
            'gold': {'records':len(gold),'orderedAmountDifferences':gold_differences,
                'reasonCodes':{key:sorted(value) for key,value in reason_map.items()},
                'stratzMinusReplayTimeRange':[min(gold_time_deltas),max(gold_time_deltas)]},
            'csExamples':cs_examples})
    return result


if __name__ == '__main__':
    if len(sys.argv) != 5:
        raise SystemExit('capture.json adapter-baseline.json decoded-directory new-output.json')
    capture, baseline, decoded, output = map(Path, sys.argv[1:])
    if output.exists(): raise SystemExit('Output already exists; refusing overwrite')
    result = compare(capture, baseline, decoded)
    with output.open('x', encoding='utf-8') as stream: stream.write(compact(result)+'\n')
    for match in result['matches']:
        print(match['matchId'], 'positions', match['positions'], 'death cells', [row['adapterSameCell'] for row in match['deaths']],
              'buildings', len(match['buildingPairChecks']), 'unmatched buildings', [row['stratzIndex'] for row in match['buildingPairChecks'] if not row['matches']],
              'roshan matches', sum(row['sameCellObservedWithinOneSecond'] for row in match['roshanPairChecks']), '/', len(match['roshanPairChecks']))
