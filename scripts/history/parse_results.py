"""Parse Chris's law school results document (text export) into structured JSON.

Usage: python3 parse_results.py results.txt out.json [app.json]
Gaps in the record are then filled from tcpr_gaps.json (next to this script); those rows are marked source "TCPR".
Each competition block ends with its "PARTICIPATING SCHOOLS:" line. Lines that can't be read are kept
in `unparsed` on the event so nothing is silently lost.
"""
import json, re, sys

MONTHS = 'January|February|Febraury|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Aug|Sept|Sep|Oct|Nov|Dec'
ALIASES = {
    'loyola la': 'Loyola LA', 'loyola los angeles': 'Loyola LA', 'chicago kent': 'Chicago-Kent', 'hoston': 'Houston',
    'uic': 'Illinois Chicago', 'nova se': 'Nova Southeastern', 'nova': 'Nova Southeastern', 'fiu': 'Florida International',
    'st, mary’s': "St. Mary's", 'st marys': "St. Mary's", 'st johns': "St. John's", 'st. johns': "St. John's",
    'mcgeorge': 'Pacific McGeorge', 'uc hastings': 'UC Law SF', 'hastings': 'UC Law SF', 'wash u': 'Washington University',
    'washu': 'Washington University', 'smu': 'SMU', 'lsu': 'LSU', 'byu': 'BYU', 'nyu': 'NYU', 'ucla': 'UCLA', 'usc': 'USC',
    'umkc': 'UMKC', 'unlv': 'UNLV', 'touro': 'Touro',
    'arkon': 'Akron', 'brookyln': 'Brooklyn', 'duquense': 'Duquesne', 'illinios': 'Illinois', 'nove se': 'Nova Southeastern',
    'ohio northen': 'Ohio Northern', 'pace': 'Pace', 'pacific-mcgeorge': 'Pacific McGeorge', 'roger wiliams': 'Roger Williams',
    'rutger': 'Rutgers', 'setson hall': 'Seton Hall', 'uc berkely': 'UC Berkeley', 'berkeley': 'UC Berkeley', 'uc sf law': 'UC Law SF',
    'uc san francisco': 'UC Law SF', 'loyola - chicago': 'Loyola Chicago', 'loyola-chicago': 'Loyola Chicago', 'loyola-new orleans': 'Loyola New Orleans',
    'texas a & m': 'Texas A&M', 'texas a& m': 'Texas A&M', 'texas a &m': 'Texas A&M', 'texas am': 'Texas A&M',
    'inter american': 'InterAmerican Puerto Rico', 'inter american puerto rico': 'InterAmerican Puerto Rico', 'interamerica puerto rico': 'InterAmerican Puerto Rico',
    'interamerican': 'InterAmerican Puerto Rico', 'john marshall (atlanta)': 'John Marshall Atlanta', 'john marshall': 'John Marshall Atlanta',
    'new york law': 'New York Law School', 'new york': 'New York Law School', 'washington & lee': 'Washington and Lee', 'cuny school of law': 'CUNY',
    'uconn': 'Connecticut', 'cooley (fl)': 'Cooley', 'thomas (fl)': 'St. Thomas (FL)', 'st. thomas minnesota': 'St. Thomas (MN)',
    'widener delaware': 'Widener', 'tennessee winston': 'Tennessee', 'texas southern thurgood marshall': 'Texas Southern',
    'southern university law center': 'Southern', 'new hampshire franklin pierce': 'New Hampshire', 'cleveland': 'Cleveland State',
    'umass': 'Massachusetts', 'texas a&m': 'Texas A&M', 'william and mary': 'William & Mary', 'lewis and clark': 'Lewis & Clark', 'louis & clark': 'Lewis & Clark',
    'mississippi christian': 'Mississippi College', 'southern california': 'USC',
    # Added in the 2026-11-27 audit: short or misspelled names that split one school into two.
    'johns': "St. John's", "john's": "St. John's", "mary's": "St. Mary's", 'thomas': 'St. Thomas',
    'st thomas': 'St. Thomas', 'st. thomas (florida)': 'St. Thomas (FL)', 'st. thomas (minnesota)': 'St. Thomas (MN)',
    'boston': 'Boston University', 'bu': 'Boston University', 'ole miss': 'Mississippi', 'puerto rico': 'University of Puerto Rico',
    'upr': 'University of Puerto Rico', 'university of chicago': 'University of Chicago',
    # St. Thomas (FL)'s law school is the Benjamin L. Crump College of Law; TCPR confirms it at the 2023 Community Competition.
    'benjamin crump': 'St. Thomas (FL)', 'benjamin crump (st. thomas)': 'St. Thomas (FL)', 'arkansas - little rock': 'Arkansas Little Rock',
}

# Typos in the source where two schools ran together with no comma, or a name was doubled.
SPLITS = {
    'penn state penn state': ['Penn State'], 'uc berkeley uc davis': ['UC Berkeley', 'UC Davis'],
    'pacific mcgeorge puerto rico': ['Pacific McGeorge', 'Puerto Rico'], "st. john's stetson": ["St. John's", 'Stetson'],
    "st. john's temple": ["St. John's", 'Temple'], "st. mary's south texas": ["St. Mary's", 'South Texas'],
}

# Schools that the record sometimes names without saying which campus. Florida events mean the Miami school.
FLORIDA = {'Barry', 'Florida International', 'Nova Southeastern', 'Stetson', 'Florida', 'Florida State', 'Miami', 'Cooley',
           'Jacksonville', 'Ave Maria', 'Florida A&M'}


# Events where the record says only "St. Thomas" and outside sources settle which school it was.
# Gold Cup 2024: St. Thomas (FL)'s law school posted its national semifinal finish there (Oct 29, 2024), and TCPR agrees.
ST_THOMAS_AT = {('2024-25', 'Fall', 'Gold Cup Trial Competition'): 'St. Thomas (FL)'}

# Events the record lists twice. The St. John's Peter James Johnson Civil Rights competition is held each October;
# the Spring 2025 entry repeats the Fall 2024 one (same final four: NYU, Georgetown, Drexel, Fordham).
DUPLICATES = {('2024-25', 'Spring', "St. John's Civil Rights")}


def resolve_schools(ev):
    """Make results and participants name the same school, and pin down 'St. Thomas' where the event says which one."""
    schools = {p['school'] for p in ev['participants']} | {r['school'] for r in ev['results']}
    if re.fullmatch(r'NTC Region 12', ev['name'] or '', re.I):
        schools.add('St. Thomas (MN)')  # Region 12 is the upper Midwest; the 2026 record names St. Thomas (MN) there.
    florida = bool(schools & FLORIDA) or re.search(r'florida|zehmer|bedell', ' '.join(ev['source'] + [ev['name'] or '']), re.I)
    pinned = ST_THOMAS_AT.get((ev['season'], ev['term'], re.sub(r'\(\s*\)', '', ev['name'] or '').strip()))
    def fix(school):
        if school == 'St. Thomas' and pinned:
            return pinned
        if school == 'St. Thomas':
            if 'St. Thomas (FL)' in schools or (florida and 'St. Thomas (MN)' not in schools):
                return 'St. Thomas (FL)'
            if 'St. Thomas (MN)' in schools:
                return 'St. Thomas (MN)'
        if schools and school not in schools:
            longer = [s for s in schools if s.startswith(school + ' ')]
            if len(longer) == 1:
                return longer[0]
        return school
    for coll in (ev['results'], ev['participants']):
        for r in coll:
            new = fix(r['school'])
            if new != r['school']:
                r['team'] = new + r['team'][len(r['school']):]
                r['school'] = new


def clean(s):
    s = s.replace('’', "'").replace('‘', "'").replace('​', '').replace('\xa0', ' ')
    s = re.sub(r'\s+', ' ', s).strip(' .,;:')
    return s


def split_team(raw):
    """'Nova Southeastern 2' -> ('Nova Southeastern', 'Nova Southeastern 2')."""
    t = clean(raw)
    t = re.sub(r'^[_\W]+', '', t)
    t = re.sub(r'^(the|and)\s+', '', t, flags=re.I)
    t = re.sub(r'\s+(x|ghost)$', '', t, flags=re.I)
    m = re.match(r'^(.*?)(?:\s+(\d|I{1,3}|[AB]))$', t)
    school = m.group(1) if m else t
    school = re.sub(r'\s+(x|ghost)$', '', school, flags=re.I)
    school = ALIASES.get(school.lower(), school)
    if re.match(r'^loyola la$', school, re.I):
        school = 'Loyola LA'
    team = school + (' ' + m.group(2) if m else '')
    return school, team


def names(chunk):
    chunk = re.sub(r'\bSt,\s+', 'St. ', chunk)
    chunk = re.sub(r'\bSt\s+(?=(?:Mary|John|Thomas|Louis)\b)', 'St. ', chunk)
    # "Hofstra 1 Hofstra 2" and "Barry 2 Case Western": a missing comma after a team number.
    chunk = re.sub(r'(\b\d)\s+(?=[A-Z])', r'\1, ', chunk)
    chunk = re.sub(r'\((?!MN|FL|TX|CA|Florida|Minnesota|Chicago|LA|Atlanta|Texas)[^)]*\)', '', chunk)
    # "Akron 1 & 2" means two teams from one school.
    chunk = re.sub(r"([A-Z][\w.' ]*?)\s+1\s*&\s*2\b", r"\1 1, \1 2", chunk)
    chunk = re.sub(r'(?<!\bSt)(?<!\bMt)\.\s+(?=[A-Z])', ', ', chunk)
    parts = re.split(r',\s*|\s+and\s+(?!Lee\b|Mary\b|Clark\b)', chunk)
    out = []
    for p in parts:
        p = clean(p)
        p = re.sub(r'\s+and$', '', p)
        # "Cumberland x 3": three teams from one school.
        mx = re.fullmatch(r'(.+?)\s+x\s*(\d)', p)
        if mx:
            out.extend(f'{mx.group(1)} {i}' for i in range(1, int(mx.group(2)) + 1))
            continue
        # "Case Western 1, 2, 3, 4, & 5": a bare number is another team from the school before it.
        mnum = re.fullmatch(r'&?\s*(\d)', p)
        if mnum and out:
            out.append(re.sub(r'\s+\d$', '', out[-1]) + ' ' + mnum.group(1))
            continue
        if not p or p.lower() in ('and',) or re.fullmatch(r'\d+', p):
            continue
        out.extend(SPLITS.get(p.lower(), [p]))
    return out


def season_of(term, year):
    return f'{year}-{str(year + 1)[2:]}' if term == 'Fall' else f'{year - 1}-{str(year)[2:]}'


def parse(lines):
    events, block = [], []
    term, year = None, None
    pending = None  # an event whose participant list is on the following line
    for raw in lines:
        line = raw.strip()
        if pending is not None:
            if line and not RESULT.search(line) and not line.isupper() and ',' in line:
                pending['participants'] = build([], line, term, year)['participants']
                pending = None
                continue
            pending = None
        m = re.match(r'^F?(FALL|S?PRING)\s+(\d{4})\s+RESULTS', line, re.I)
        if m:
            term = 'Fall' if m.group(1).upper().startswith('FALL') else 'Spring'
            year = int(m.group(2))
            block = []
            continue
        if not line:
            continue
        mp = re.search(r'PARTICIPATING (?:SCHOOLS|TEAMS)\s*:?', line, re.I)
        if mp:
            if line[:mp.start()].strip():
                block.append(line[:mp.start()].strip())
            body = line[mp.end():]
            events.append(build(block, body, term, year))
            if not events[-1]['participants']:
                pending = events[-1]
            block = []
            continue
        block.append(line)
    return events


RESULT = re.compile(r'going to|advanc|\bwins?\b|semi-?\s?finalist|quarter-?\s?finalist|octo-?\s?final|\bfinalists?\b|going to finals|\bplace\b|champion|runner', re.I)


def build(block, participants, term, year):
    ev = {'term': term, 'year': year, 'season': season_of(term, year) if year else None, 'host': None, 'name': None, 'region': None,
          'dates': None, 'teams': None, 'schools': None, 'results': [], 'participants': [], 'unparsed': [], 'source': block[:]}
    header, res = [], []
    for ln in block:
        title_like = re.search(r'COMPETITION|CHALLENGE|TOURNAMENT|INVITATIONAL|CUP', ln) or (
            re.search(r'competition|tournament|championship|invitational', ln, re.I)
            and not re.search(r'\b(?:wins?|were|are|was|is|over|advanc\w*)\b', ln, re.I))
        (res if (res or (RESULT.search(ln) and not title_like)) else header).append(ln)
    title = []
    for ln in header:
        c = clean(ln)
        mt = re.search(r'\((\d+)\s*teams?(?:[,;]\s*(\d+)\s*schools?)?\)|\((\d+)\s*schools?[,;]\s*(\d+)\s*teams?\)', c, re.I)
        if mt:
            if mt.group(1):
                ev['teams'] = int(mt.group(1)); ev['schools'] = int(mt.group(2)) if mt.group(2) else None
            else:
                ev['schools'] = int(mt.group(3)); ev['teams'] = int(mt.group(4))
            c = clean(c[:mt.start()] + c[mt.end():])
        md = re.search(rf'(({MONTHS})\.? \d{{1,2}}(?:\s*[-–]\s*(?:({MONTHS})\.? )?\d{{1,2}})?(?:,? \d{{4}})?)', c)
        if md:
            ev['dates'] = md.group(1)
            c = clean(c[:md.start()] + c[md.end():])
        if not c:
            continue
        mr = re.match(r'^\(?([^()]*regional[^()]*)\)?$', c, re.I)
        if mr:
            ev['region'] = clean(mr.group(1)); continue
        mh = re.match(r'^(?:hosted by|hosts?:?\s*[—–-]?)\s*(.*)$', c, re.I)
        if mh:
            ev['host'] = clean(mh.group(1)); continue
        if re.search(r"'s$|\shosting$|\shosts?$", c, re.I) and not c.isupper():
            ev['host'] = clean(re.sub(r"(?:'s|\s+hosting|\s+hosts?)$", '', c, flags=re.I)); continue
        mreg = re.match(r'^REGION\s+(\w+)$', c, re.I)
        if mreg:
            ev['region'] = 'Region ' + mreg.group(1).upper(); continue
        if re.search(r"'S$", c) and c.isupper():
            ev['host'] = clean(c[:-2]).title(); continue
        # "Michigan State Bar's NATIONAL TRIAL ADVOCACY COMPETITION"
        mx = re.match(r"^(.*?'s)\s+([A-Z0-9][A-Z0-9 .&'’\-:]+)$", c)
        if mx and not mx.group(1).isupper():
            ev['host'] = clean(mx.group(1)[:-2]); title.append(mx.group(2)); continue
        title.append(c)
    ev['name'] = clean(' '.join(title)) or None
    if ev['name'] and ev['name'].isupper():
        ev['name'] = smart_title(ev['name'])

    def add(team_raw, finish, place=None):
        school, team = split_team(team_raw)
        if not school or len(school) > 60:
            return False
        ev['results'].append({'school': school, 'team': team, 'finish': finish, 'place': place})
        return True

    for ln in res:
        c = clean(ln)
        ok = False
        m = re.match(r'^(.+?)\s+wins?(?:\s+(?:over|against)\s+(.+?))?(?:\s+in the final.*)?(?:\s*\(.*\))?$', c, re.I)
        if m and not re.search(r'semi|quarter', c, re.I):
            for n in names(m.group(1)):
                ok = add(n, 'winner', 1) or ok
            if m.group(2):
                for n in names(re.sub(r'\s*\(.*$', '', m.group(2))):
                    add(n, 'finalist', 2)
        places = re.findall(r'(\d)(?:st|nd|rd|th) place:?\s*((?:St\.\s|[^.])+?)(?=\.|$|\s+\d(?:st|nd|rd|th) place)', c, re.I)
        for p, who in places:
            ok = add(who, 'winner' if p == '1' else 'finalist' if p == '2' else 'place', int(p)) or ok
        for kind, finish in (('quarter', 'quarterfinalist'), ('octo', 'octofinalist'), ('semi', 'semifinalist')):
            mm = re.match(rf'^(.+?)\s+(?:were|are|was|is)\s+(?:the\s+)?{kind}', c, re.I)
            if mm and not ok:
                for n in names(mm.group(1)):
                    ok = add(n, finish) or ok
        mco = re.match(r'^(.+?)\s+(?:are|were)\s+co-?\s?champions', c, re.I)
        if mco and not ok:
            for n in names(mco.group(1)):
                ok = add(n, 'winner', 1) or ok
        mad = re.match(r'^(.+?)\s+advances?\s+(?:to|as)\b(.*)$', c, re.I)
        if mad and not ok:
            fin = 'finalist' if re.search(r'runners?-up', mad.group(2), re.I) else 'advanced'
            for n in names(mad.group(1)):
                ok = add(n, fin) or ok
        ma = re.match(r'^(.+?)\s+(?:are|were|is|was)\s+(?:going to|advancing to|advance to|advanced to)\s+(?!(?:the )?finals)', c, re.I)
        if ma and not ok:
            for n in names(ma.group(1)):
                ok = add(n, 'advanced') or ok
        mf = re.match(r'^(.+?)\s+(?:are|were)\s+(?:going to (?:the )?finals|(?:the )?finalists)', c, re.I)
        if mf and not ok:
            for n in names(mf.group(1)):
                ok = add(n, 'finalist') or ok
        if not ok:
            mo = re.match(r'^(.+?)\s+over\s+(.+)$', c, re.I)
            if mo:
                ok = add(mo.group(1), 'winner', 1)
                add(mo.group(2), 'finalist', 2)
        if not ok and re.search(r'\d(?:st|nd|rd|th)\b|\b(second|third|fourth|fifth)\b', c, re.I):
            for seg in re.split(r'\.\s+|,\s+(?=[^,]*\d(?:st|nd|rd|th)|[^,]*\b(?:second|third|fourth|fifth)\b)', c):
                mm = re.match(r'^(.+?)\s+(?:(?:was|were|tied for|took)\s+)?(\d|second|third|fourth|fifth)(?:st|nd|rd|th)?\b', seg.strip(), re.I)
                if not mm:
                    continue
                word = mm.group(2).lower()
                place = {'second': 2, 'third': 3, 'fourth': 4, 'fifth': 5}.get(word) or int(word)
                for n in names(mm.group(1)):
                    ok = add(n, 'winner' if place == 1 else 'finalist' if place == 2 else 'place', place) or ok
        if not ok and re.match(r'^(champions?|semi-?finalists?|finalists?|winner|division \w+|region \w+)$', c, re.I):
            ok = True  # empty headings in the document
        if not ok:
            ev['unparsed'].append(c)
    seen = set()
    for n in names(participants):
        school, team = split_team(n)
        if team.lower() in seen:
            continue
        seen.add(team.lower())
        ev['participants'].append({'school': school, 'team': team})
    resolve_schools(ev)
    return ev


SMALL = {'of', 'the', 'and', 'in', 'on', 'at', 'for', 'a', 'to', 'vs', 'v'}
KEEP = {'ABA', 'AAJ', 'TYLA', 'NTC', 'STAC', 'LSU', 'UCLA', 'NYU', 'USC', 'SMU', 'UMKC', 'NACDL', 'CACJ', 'NCTC', 'TOC', 'II', 'III', 'NTL', 'BYU', 'DC', 'D.C.', 'ABOTA', 'TEX-ABOTA', 'MLK', 'UC', 'SF', 'FSU', 'NBLSA', 'HNBA', 'LGBTQ'}


def smart_title(s):
    words = s.split()
    out = []
    for i, w in enumerate(words):
        bare = re.sub(r'[^A-Za-z.\-]', '', w)
        if bare in KEEP or bare.rstrip("'S") in KEEP:
            out.append(w)
        elif i > 0 and w.lower() in SMALL:
            out.append(w.lower())
        else:
            out.append(w[:1].upper() + w[1:].lower())
    return ' '.join(out)


def apply_tcpr(evs, path):
    """Fill gaps in the record from the TCPR spreadsheet (see tcpr_gaps.json). Never replaces a result already there."""
    gaps = json.load(open(path, encoding='utf-8'))
    def find(m):
        name = lambda e: re.sub(r'\(\s*\)', '', e['name'] or '').strip()
        hits = [e for e in evs if e['season'] == m['season'] and e['term'] == m['term'] and name(e) == m['name']
                and (not m.get('host') or (e['host'] or '') == m['host'])]
        if len(hits) != 1:
            raise SystemExit(f"tcpr_gaps.json: {len(hits)} events match {m}")
        return hits[0]
    def row(r):
        school, team = split_team(r['team'])
        return {'school': school, 'team': team, 'finish': r['finish'], 'place': r.get('place'), 'source': 'TCPR'}
    for f in gaps['fill']:
        ev = find(f)
        for r in f['add']:
            new = row(r)
            if any(x['team'] == new['team'] for x in ev['results']):
                raise SystemExit(f"tcpr_gaps.json: {new['team']} already has a result at {ev['name']}")
            if new['place'] and any(x['place'] == new['place'] for x in ev['results']):
                raise SystemExit(f"tcpr_gaps.json: place {new['place']} already taken at {ev['name']}")
            ev['results'].append(new)
    for g in gaps['events']:
        at = evs.index(find(g['after'])) + 1
        d = g['event']
        ev = {'term': g['after']['term'], 'season': g['after']['season'], 'year': None, 'host': d['host'], 'name': d['name'],
              'region': None, 'dates': d['dates'], 'teams': d['teams'], 'schools': d['schools'],
              'results': [row(r) for r in d['results']], 'participants': [dict(zip(('school', 'team'), split_team(t))) for t in d['participants']],
              'unparsed': [], 'source': [], 'tcpr': True}
        evs.insert(at, ev)
    return evs


def apply_updates(evs, path):
    """Fill in results reported after the record was exported (see record_updates.json). Only for events with no results yet."""
    ups = json.load(open(path, encoding='utf-8'))
    for u in ups['fill']:
        name = lambda e: re.sub(r'\(\s*\)', '', e['name'] or '').strip()
        hits = [e for e in evs if e['season'] == u['season'] and e['term'] == u['term'] and name(e) == u['name']]
        if len(hits) != 1:
            raise SystemExit(f"record_updates.json: {len(hits)} events match {u['name']}")
        ev = hits[0]
        if ev['results'] or ev['participants']:
            raise SystemExit(f"record_updates.json: {u['name']} already has results in the record; remove it from the updates file")
        ev['teams'], ev['schools'] = u.get('teams'), u.get('schools')
        ev['results'] = [dict(zip(('school', 'team'), split_team(r['team'])), finish=r['finish'], place=r.get('place')) for r in u['results']]
        ev['participants'] = [dict(zip(('school', 'team'), split_team(t))) for t in u['participants']]
        resolve_schools(ev)
    return evs


def for_app(evs, level='law_school'):
    """Slim rows for the app and the past_events table."""
    out, used = [], set()
    for e in evs:
        if not e['name'] or not e['season']:
            continue
        if not e['results'] and not e['participants']:
            continue  # announced but not held yet
        name = re.sub(r'\(\s*\)', '', e['name']).strip()
        base = re.sub(r'[^a-z0-9]+', '-', f"{e['season']} {e['term']} {name} {e['region'] or ''}".lower()).strip('-')[:90]
        rid, n = base, 2
        while rid in used:
            rid, n = f'{base}-{n}', n + 1
        used.add(rid)
        out.append({
            'id': rid, 'level': level, 'season': e['season'], 'term': e['term'], 'name': name, 'host': e['host'], 'region': e['region'],
            'dates': e['dates'], 'teamCount': e['teams'], 'schoolCount': e['schools'],
            'results': [{k: r[k] for k in ('school', 'team', 'finish', 'place', 'source') if k in r} for r in e['results']],
            'participants': [p['team'] for p in e['participants']],
            'needsReview': bool(e['unparsed']),
            'ord': len(out),
            **({'source': 'TCPR'} if e.get('tcpr') else {}),
        })
    return out


if __name__ == '__main__':
    lines = open(sys.argv[1], encoding='utf-8').read().split('\n')
    evs = [e for e in parse(lines) if (e['season'], e['term'], re.sub(r'\(\s*\)', '', e['name'] or '').strip()) not in DUPLICATES]
    here = __file__.rsplit('/', 1)[0]
    evs = apply_updates(apply_tcpr(evs, here + '/tcpr_gaps.json'), here + '/record_updates.json')
    json.dump(evs, open(sys.argv[2], 'w'), indent=1, ensure_ascii=False)
    if len(sys.argv) > 3:
        json.dump(for_app(evs), open(sys.argv[3], 'w'), ensure_ascii=False, separators=(',', ':'))
