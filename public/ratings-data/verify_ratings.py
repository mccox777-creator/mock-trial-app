"""Recompute the Mock Trial ELO Ratings from scratch and compare them with the published ones.

Written separately from the app's code, in a different language, so it is an independent check.
Usage (Python 3, no extra packages), in a folder holding events.json and ratings.csv from
https://app.mocktrialcentral.com/ratings-data/ :

    python3 verify_ratings.py

The rules are in https://app.mocktrialcentral.com/ratings (the "How ratings are calculated" page).
"""
import csv, json, re, sys

START, GAMES, PROVISIONAL = 1500, 8, 5
MONTHS = {m: i + 1 for i, m in enumerate('jan feb mar apr may jun jul aug sep oct nov dec'.split())}
TIER = {'winner': 0, 'advanced': 0, 'finalist': 1, 'semifinalist': 2, 'quarterfinalist': 3, 'octofinalist': 4}


def school_of(team):
    return re.sub(r'\s+(\d|I{1,3}|[AB])$', '', team)


def tier(r):
    if r['finish'] == 'place':
        return min(r['place'] - 1, 4.5) if r['place'] else 4.5
    return TIER[r['finish']]


def teams(e):
    """Every team with its finishing tier: each school's result tiers, plus 'took part' for each further team it entered."""
    res, entered = {}, {}
    for r in e['results']:
        res.setdefault(r['school'], []).append(tier(r))
    for p in e['participants']:
        entered[school_of(p)] = entered.get(school_of(p), 0) + 1
    out = []
    for s in set(res) | set(entered):
        t = res.get(s, [])
        out += [(s, x) for x in t] + [(s, 5)] * (entered.get(s, 0) - len(t))
    return out


def start_day(e):
    m = re.search(r'([A-Za-z]{3})[a-z]*\.?\s*(\d{1,2})', e['dates'] or '')
    if not m or m.group(1).lower() not in MONTHS:
        return None
    first = int(e['season'][:4])
    year = first if e['term'] == 'Fall' else first + 1
    return year * 10000 + MONTHS[m.group(1).lower()] * 100 + int(m.group(2))


def in_order(events):
    key, terms = {}, {}
    for e in events:
        terms.setdefault((e['season'], e['term']), []).append(e)
    for (season, term), lst in terms.items():
        lst.sort(key=lambda e: e['ord'])
        first = int(season[:4])
        last = first * 10000 + 801 if term == 'Fall' else (first + 1) * 10000 + 101
        for e in lst:
            last = start_day(e) or last
            key[e['id']] = last
    return sorted(events, key=lambda e: (key[e['id']], e['ord']))


def k_factor(rating, played):
    return 40 if played < 5 else (10 if rating >= 2400 else 20)


def compute(events):
    rating, played = {}, {}
    for e in in_order(events):
        field = teams(e)
        if len({t for _, t in field}) < 2:
            continue
        schools = {s for s, _ in field}
        pre = {s: rating.get(s, START) for s in schools}
        for s in schools:
            mine = [t for o, t in field if o == s]
            others = [(o, t) for o, t in field if o != s]
            if not others:
                continue
            weight = min(GAMES, len(others)) / len(others)
            score, games = 0.0, 0
            for t in mine:
                for o, ot in others:
                    if ot == t:
                        continue
                    score += (1 if t < ot else 0) - 1 / (1 + 10 ** ((pre[o] - pre[s]) / 400))
                    games += 1
            if games == 0:
                continue
            rating[s] = pre[s] + k_factor(pre[s], played.get(s, 0)) * weight * score / len(mine)
            played[s] = played.get(s, 0) + 1
    return rating, played


if __name__ == '__main__':
    events = json.load(open('events.json'))
    rating, played = compute(events)
    published = {r['school']: r for r in csv.DictReader(open('ratings.csv'))}
    bad = 0
    for s, r in rating.items():
        p = published.get(s)
        if not p or abs(float(p['rating']) - r) > 0.01 or int(p['competitions']) != played[s]:
            bad += 1
            print('MISMATCH', s, round(r, 2), played[s], p and (p['rating'], p['competitions']))
    if set(published) - set(rating):
        bad += 1
        print('Published but not computed:', sorted(set(published) - set(rating)))
    print(f'{len(rating)} schools checked, {bad} mismatches')
    sys.exit(1 if bad else 0)
