"""Compare ranking methods on past results: circuit points, RPI-style strength of schedule, and a
head-to-head rating (Bradley-Terry over finish tiers). Usage: python3 rank_models.py history.json out.csv"""
import csv, json, math, sys
from collections import defaultdict

DECAY = 0.7  # each season back counts 70% of the one after it
TIER = {'winner': 0, 'advanced': 0, 'finalist': 1, 'semifinalist': 2, 'quarterfinalist': 3, 'octofinalist': 4}
POINTS = {0: 3, 1: 2, 2: 1}
PRIOR_GAMES = 2.0  # virtual even games vs an average school, so 1-2 entries don't top the list


def tier(r):
    if r['finish'] == 'place':
        return {1: 0, 2: 1, 3: 2}.get(r['place'], 3)
    return TIER[r['finish']]


def school_of(team):
    import re
    return re.sub(r'\s+(\d|I{1,3}|[AB])$', '', team)


def fields(events):
    seasons = sorted({e['season'] for e in events})
    newest = seasons[-1]
    for e in events:
        back = int(newest[:4]) - int(e['season'][:4])
        w = DECAY ** max(0, back - 0) if back > 0 else 1.0
        best = {}
        for r in e['results']:
            best[r['school']] = min(best.get(r['school'], 9), tier(r))
        for p in e['participants']:
            best.setdefault(school_of(p), 5)  # entered, didn't place
        if len(best) >= 2:
            yield e, best, w


def points_and_rates(events):
    pts, ent, placed, wins = defaultdict(float), defaultdict(float), defaultdict(float), defaultdict(int)
    for e, best, w in fields(events):
        for s, t in best.items():
            ent[s] += w
            pts[s] += w * POINTS.get(t, 0)
            if t <= 2:
                placed[s] += w
            if t == 0:
                wins[s] += 1
    return pts, ent, placed, wins


def rpi(events, ent, placed):
    wp = {s: (placed[s] + 0.5) / (ent[s] + 2) for s in ent}  # smoothed placement rate
    opp_sum, opp_w = defaultdict(float), defaultdict(float)
    evs = list(fields(events))
    for e, best, w in evs:
        for s in best:
            for o in best:
                if o != s:
                    opp_sum[s] += w * wp[o]; opp_w[s] += w
    owp = {s: opp_sum[s] / opp_w[s] if opp_w[s] else 0 for s in ent}
    oo_sum, oo_w = defaultdict(float), defaultdict(float)
    for e, best, w in evs:
        for s in best:
            for o in best:
                if o != s:
                    oo_sum[s] += w * owp[o]; oo_w[s] += w
    oowp = {s: oo_sum[s] / oo_w[s] if oo_w[s] else 0 for s in ent}
    return {s: 0.25 * wp[s] + 0.5 * owp[s] + 0.25 * oowp[s] for s in ent}, wp, owp


def bradley_terry(events):
    wins = defaultdict(float)  # weighted wins
    games = defaultdict(lambda: defaultdict(float))
    for e, best, w in fields(events):
        n = len(best)
        k = w / max(1, n - 1)  # each competition carries similar total weight, whatever its size
        items = list(best.items())
        for i, (a, ta) in enumerate(items):
            for b, tb in items[i + 1:]:
                if ta == tb:
                    continue
                win, lose = (a, b) if ta < tb else (b, a)
                wins[win] += k
                games[a][b] += k; games[b][a] += k
    schools = list(games)
    p = {s: 1.0 for s in schools}
    for _ in range(500):
        new = {}
        for s in schools:
            denom = sum(n / (p[s] + p[o]) for o, n in games[s].items()) + PRIOR_GAMES / (p[s] + 1.0)
            new[s] = (wins[s] + PRIOR_GAMES / 2) / denom
        g = math.exp(sum(math.log(v) for v in new.values()) / len(new))
        diff = max(abs(math.log(new[s] / g) - math.log(p[s])) for s in schools)
        p = {s: new[s] / g for s in schools}
        if diff < 1e-7:
            break
    return {s: 1500 + 400 * math.log10(v) for s, v in p.items()}


def ranks(score):
    order = sorted(score, key=lambda s: -score[s])
    return {s: i + 1 for i, s in enumerate(order)}


if __name__ == '__main__':
    events = json.load(open(sys.argv[1]))
    pts, ent, placed, wins = points_and_rates(events)
    r, wp, owp = rpi(events, ent, placed)
    bt = bradley_terry(events)
    raw_ent = defaultdict(int)
    for e, best, w in fields(events):
        for s in best:
            raw_ent[s] += 1
    rk_bt, rk_rpi, rk_pts = ranks(bt), ranks(r), ranks(pts)
    rows = []
    for s in sorted(bt, key=lambda s: -bt[s]):
        rows.append({'school': s, 'h2h_rank': rk_bt[s], 'h2h_rating': round(bt[s]), 'rpi_rank': rk_rpi.get(s), 'rpi': round(r.get(s, 0), 3),
                     'points_rank': rk_pts.get(s), 'points': round(pts.get(s, 0), 1), 'entered': raw_ent[s], 'wins': wins[s],
                     'place_rate': round(placed[s] / ent[s], 2) if ent[s] else 0, 'field_strength': round(owp.get(s, 0), 3)})
    with open(sys.argv[2], 'w', newline='') as f:
        wr = csv.DictWriter(f, fieldnames=list(rows[0]))
        wr.writeheader(); wr.writerows(rows)
    for row in rows[:30]:
        print(row)
