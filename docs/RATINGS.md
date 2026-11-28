# Mock Trial ELO Ratings: how they are calculated

The Mock Trial ELO Ratings rate law schools with the Elo system from chess. This page gives every rule, the data, and a way to check
every number yourself. The app shows the same explanation at https://app.mocktrialcentral.com/ratings.

## Check it yourself

Everything needed to recompute the ratings is published with the site:

| File | What it is |
| --- | --- |
| [events.json](https://app.mocktrialcentral.com/ratings-data/events.json) | Every competition used: finishes and participating teams |
| [ratings.csv](https://app.mocktrialcentral.com/ratings-data/ratings.csv) | Every school's current rating, class and number of competitions |
| [rating-changes.csv](https://app.mocktrialcentral.com/ratings-data/rating-changes.csv) | Every rating change in the order computed, with each input to the formula |
| [verify_ratings.py](https://app.mocktrialcentral.com/ratings-data/verify_ratings.py) | Recomputes every rating from events.json and compares it with ratings.csv |

Put the four files in one folder and run `python3 verify_ratings.py` (Python 3, nothing to install). The script was written
separately from the app's code, in a different language, using only the rules below. It prints `0 mismatches` when the
published ratings are exactly what the rules produce.

Any single line of rating-changes.csv can be checked by hand: `after = before + k * weight * (ahead - expected) / teams`.

In the repository, `npm run ratings:export` regenerates the files in `public/ratings-data/` and `npm run check:elo` fails if
they are out of date.

## The rules

1. **Start.** A school's rating starts at 2300 at its first competition in the record (Spring 2023 onward). (Chess starts at 1500; see "Change, 28 November 2026" below.)
2. **Teams.** Every team is its own competitor. A team's finish, from best to worst: won or qualified out of a regional
   (0), final (1), semifinal (2), quarterfinal (3), octofinal (4), took part (5). A numbered place counts as one less than
   the place (3rd = 2), capped at 4.5, so 4th beats 5th and every placed team beats those who only took part. A
   competition run in the app uses its full final standings: 1st beats 2nd beats 3rd and so on. Where the record names a
   school's result without saying which team, each further team the school entered counts as "took part".
3. **Games.** Each team plays every team from another school: finishing ahead is a win, finishing behind a loss, and
   finishing in the same round doesn't count. Teams from the same school never count against each other.
4. **Expected score.** For each game: `1 / (1 + 10^((their school's rating - your school's rating) / 400))`. Ratings from
   before the competition are used for everyone.
5. **Change.** `new = old + K * weight * (wins - expected) / teams`, where wins and expected are summed over all of the
   school's games at the competition and teams is how many teams it entered. In other words, the school moves by the
   average of its teams' results, so a strong team lifts it and a team that goes out early pulls it down.
   - `weight = min(8, n) / n`, where n is the number of teams from other schools, so each team's competition is worth at
     most 8 games however large it is.
   - `K` is 40 for a school's first 5 competitions, then 20, and 10 at 3200 or above (FIDE's 2400, moved up 800 with the scale).
   - A competition counts for a school only if one of its teams finished in a different round from a team of another
     school. A competition with no results changes nothing and doesn't count toward a school's total.
6. **Order.** Competitions are applied oldest first by start date. One with no date in the record takes the date of the one
   listed just before it in the same term. Competitions run in the app count once they close (finalized by the organizer,
   or 7 days after the last day) and their results are published.
7. **Labels.** Fewer than 5 competitions is provisional (`*`). Each school with ABA data gets a peer group (its size division,
   split at a median LSAT of 160) and a Tier 1–5 by its place in that group (see Peer groups and tiers, below).

The code is in [`src/lib/elo.ts`](../src/lib/elo.ts).

## Size divisions

Like college football, schools are also grouped by size, so a small school can see where it stands against schools its own size. **The rating math does not change.** Every school keeps one rating built from every competition it entered, so a small school's wins over large schools still count in full (and Elo already gives more points for beating a higher-rated school). Divisions only decide which extra list a school appears in, next to the overall list.

| Division | Total JD enrollment |
| --- | --- |
| Large | 800 and up |
| Mid-size | 500 to 799 |
| Small | under 500 |

Size is total JD enrollment (all class years, full and part time) from the ABA's Standard 509 compilation, "JD Enrollment and Ethnicity", 2025 report (https://www.abarequireddisclosures.org/requiredDisclosure/). The figures and how each rated school was matched to the ABA's name are in `src/data/school-enrollment.json`, built by `python3 scripts/enrollment/build.py` from `scripts/enrollment/aba-2025-jd-enrollment.tsv`.

Schools with no ABA figure appear only in the overall list: Purdue Global, West LA and Birmingham (not ABA-approved), Golden Gate and Thomas Jefferson (no 2025 report), and the record's unlabeled "Loyola" and "St. Thomas". Matching notes: Penn State and Penn State Dickinson use the merged school's 2025 figure; "Widener" is taken as Widener Delaware.

### Selectivity tiers (by median LSAT)

A second way to carve the same ratings, so "the elites are compared to the elites": schools grouped by the median LSAT of their entering class, from the ABA's 2025 Standard 509 "First Year Class" compilation (All50thPercentileLSAT; median GPA is shown too). As with size, the rating math does not change.

| Tier | Median LSAT |
| --- | --- |
| Elite | 168 and up |
| Selective | 160 to 167 |
| Others | under 160 |

The same 7 schools without ABA data appear only in the overall list. Cutoffs are `SELECTIVITY` in `src/lib/divisions.ts`.

**Merged names (Chris, 28 November 2026):** the record named two schools two ways, so each was rated twice. "Yeshiva" is now Cardozo (Yeshiva University's law school) and "North Texas" is now UNT Dallas (the only University of North Texas law school), via `ALIASES` in parse_results.py. At the Spring 2026 AAJ New York regional this also fixes a team that was counted twice: the participant list said Yeshiva and the results said Cardozo (semifinalist). 196 schools are rated after the merge.

The cutoffs are in `src/lib/divisions.ts`. Update the enrollment file once a year when the ABA publishes new 509 data (each December).

## The data

The results come from the circuit record of law school competitions, read by
[`scripts/history/parse_results.py`](../scripts/history/parse_results.py). The parser:

- maps short names and typos to one school name (for example "Johns" and "St, Mary's" to St. John's and St. Mary's,
  "Ole Miss" to Mississippi, "Boston" to Boston University, "Puerto Rico" to University of Puerto Rico);
- splits teams that ran together without a comma ("Hofstra 1 Hofstra 2", "Barry 2 Case Western");
- expands "Cumberland x 3" and "Case Western 1, 2, 3, 4, & 5" into separate teams;
- matches a result to the school named in the participant list ("St. Thomas" wins, "St. Thomas (FL)" took part), and treats
  an unqualified St. Thomas at a Florida competition as St. Thomas (FL) and at NTC Region 12 as St. Thomas (MN), and
  "Benjamin Crump" (St. Thomas (FL)'s law school) as St. Thomas (FL);
- treats the St. Thomas at the Gold Cup, Fall 2024, as St. Thomas (FL), which St. Thomas (FL)'s law school confirmed
  in its own post about reaching the national semifinals there (TCPR agrees);
- drops the Spring 2025 "St. John's Civil Rights" entry, a second copy of the Peter James Johnson Civil Rights
  competition from Fall 2024 (same final four). St. John's holds that competition each October.

### Results reported after the record

Competitions the record lists without results yet can be filled in from
[`scripts/history/record_updates.json`](../scripts/history/record_updates.json), for results reported directly
(for example the Cambridge Clash Invitational, Fall 2026). An event that already has results in the record is never
changed this way.

### Gaps filled from TCPR

Where the circuit record is missing a result, it is filled in from the Trial Competition Performance Rankings (TCPR)
spreadsheet, which is used as a backstop and not as ground truth. A result is added only where the record has no result
for that school at that competition and the place is open; nothing in the record is changed, and nothing earlier than
Spring 2023 is added. Every added row is marked `"source": "TCPR"` in `events.json` and shown as "from TCPR" in the app.
The additions are listed in [`scripts/history/tcpr_gaps.json`](../scripts/history/tcpr_gaps.json):

| Competition | Added from TCPR |
| --- | --- |
| National Civil Trial Competition (St. John's), Fall 2023 | Rutgers and William & Mary semifinalists |
| Syracuse's Military Law Trial, Spring 2025 | UMKC won over Texas Tech; Stetson and Illinois semifinalists (the record had no results) |
| National Criminal Trial Competition (Chapman), Spring 2025 | The whole competition, which the record leaves out: UCLA won over UCLA 2, Pepperdine semifinalist, 10 teams from 7 schools. Its date is not known, so it is placed beside the 2026 edition's date (March 20-22) |
| Chicago Cup, Fall 2025 | Maryland and Illinois 2 semifinalists |
| Estrella Trial Competition, Spring 2026 | Colorado semifinalist |

Where TCPR and the record disagree, the record stands. The main case is the Charleston Court-Martial Challenge
(Spring 2026), where TCPR lists a different field and Baylor as the winner.

### Known gaps

- A few results say only "St. Thomas" (3 competitions) or "Loyola" (2) without saying which school. They are rated as
  separate entries until the record is corrected.
- Online competitions split into divisions are rated as one competition, so a division winner counts as finishing ahead
  of other divisions' semifinalists.
- Some participant lists in the record are shorter than the stated team count: 52 competitions, about 340 of 4,860
  teams (7%), mostly schools' second teams. A missing team simply has no games there, so a school's unlisted extra
  team never counts against it.

## Audit, 27 November 2026

A review of the math and the data found and fixed these problems:

| Problem | Effect | Fix |
| --- | --- | --- |
| Competitions within a term were applied newest first (the record lists terms newest first but competitions within a term oldest first) | Ratings came out as if each term were played backwards | Order by each competition's start date |
| "Tournament of Champions" (Fall 2023) and "Online National Championship" (Spring 2024) were dropped because their titles contain the word champion | Two major competitions missing | Title lines are no longer mistaken for results |
| One school split into several names (St. Thomas (FL) under three names; Johns, John's, Mary's, St, Thomas, Ole Miss, Boston, Puerto Rico, run-together names) | 218 school names in the data, now 199 (198 once Benjamin Crump was matched to St. Thomas (FL)); St. Thomas (FL) was rated 1406 instead of 1782 | Name matching above |
| "4th place St. Thomas" was read as "St" | Wrong school credited | Fixed the place reader |
| 4th and 5th place counted as the same finish | Lost information | Places count by number |
| A competition with no results still counted toward a school's total | Wrong K factor and competition counts | Only competitions with games count |

### Change, 27 November 2026: every team counts

A school with several teams at a competition now has every team rated, and moves by the
average of its teams' results. Before, only its best team counted. This lowers schools that often send extra teams that
go out early (UCLA 2093 to 2021, San Diego 7th to 10th, Maryland 12th to 17th) and lifts schools that send one strong team.

The top 10 now (28 November 2026, after the fixes below):

| # | School | Rating (1500 scale) | Competitions |
| --- | --- | --- | --- |
| 1 | UCLA | 2033 | 83 |
| 2 | Drexel | 1871 | 54 |
| 3 | Stetson | 1804 | 87 |
| 4 | Harvard | 1787 | 43 |
| 5 | Boston College | 1776 | 12 |
| 6 | American | 1769 | 33 |
| 7 | Texas | 1768 | 44 |
| 8 | Mercer | 1759 | 67 |
| 9 | Georgetown | 1749 | 42 |
| 10 | Florida International | 1738 | 24 |

## Second audit, 28 November 2026

An independent re-implementation, written from the rules on this page alone, reproduces every published rating exactly
(198 schools, matching ratings.csv, the live `/api/ratings` feed, and verify_ratings.py). The data review found two
problems:

| Problem | Effect | Fix |
| --- | --- | --- |
| In "Charleston 2 was 5th", the team number was read as the place, so the team was credited with 2nd. Same for "Baylor 2 was 5th", "San Diego 2 and St. Mary's were 3rd" and "Drexel 2 was 3rd" (all Fall 2026 Premiere sites); "Illinois Chicago was 2nd and 3rd" lost the 3rd-place team | Illinois Chicago 1502 to 1542, Houston and Baylor swap 14th/15th, San Diego and Florida International swap 11th/12th, Charleston down 8 | A place now needs its ordinal ("5th"), and "2nd and 3rd" credits both teams |
| The AAJ regionals (Spring 2025 and Spring 2026) and AAJ Nationals (Spring 2025) had no dates, so they took the date of the competition listed before them. The 2026 regionals were rated after the 2026 national finals | Up to 16 points for schools that competed there (Syracuse, Colorado, NYU, UMKC) | Dates from AAJ: 2025 regionals March 6-9, finals April 3-6 (Atlanta); 2026 regionals March 5-8. Kept in `DATES` in parse_results.py |

## Change, 28 November 2026: a chess-like scale (start 2300)

Chris chose bigger, chess-like numbers. Every school now starts at 2300 instead of 1500, and the two rules that use an absolute rating move up by the same 800: K drops to 10 at 3200 (was 2400). (Class lines moved too at the time; classes were then replaced by rank tiers, below.) Elo only depends on the gaps between ratings, so this is a pure relabel: every rating, peak and before/after value is exactly 800 higher than before, and no order, gap or rating change moved. Checked against the previous published files: 196 schools and 4,041 rating changes, all exactly +800 (to floating-point rounding). Ratings quoted in the audit sections above are on the old 1500 scale.

Moving only the start, and leaving the K=10 line at 2400, would not have been a relabel: almost every established school would have crossed 2400 at once and moved half as fast from then on, which reorders the list (Mercer would pass Harvard) for no reason that happened in a courtroom.

## Change, 28 November 2026: peer groups and tiers instead of chess classes

Chris replaced the US Chess class names (Expert, Class A and so on) with tiers, and asked that the overall list stay a plain ranked list with one line under each school. He chose to set tiers inside peer groups, so that a large school with a low median LSAT (UIC: 1,015 JD students, median 153) is not tiered against Harvard.

- **Peer group:** the size division (Large 800+, Mid-size 500–799, Small under 500 JD students) split at a median LSAT of 160, for six groups: Large · 160+, Large · under 160, Mid-size · 160+, Mid-size · under 160, Small · 160+, Small · under 160 (`peerGroupOf` in divisions.ts).
- **Tier:** a school's place among the rated schools in its peer group, by shares because the groups differ in size: top 5% Tier 1, through 13% Tier 2, 25% Tier 3, 50% Tier 4, the rest Tier 5 (each cutoff rounded up; `tierInGroup` in elo.ts). For a group of 80 that is places 1–4, 5–11, 12–20, 21–40 and 41–80.
- Schools without ABA data (for example Purdue Global and West LA) have no peer group and no tier; they still appear in the overall list.
- Labels only: ratings are unchanged. `ratings.csv` drops the `class` column. `/api/ratings` sends `group` (`{id, label}`) and `groupTier` per row; the size and LSAT tab fields are unchanged.

## Fix, 28 November 2026: unlabeled "St. Thomas" and "Loyola" entries identified

- **2025-26 All Star Bracket Challenge, Region C: St. Thomas (FL).** In Chris's TCPR spreadsheet, St. Thomas (FL) is the only St. Thomas entered in that year's All Star.
- **2023-24 AAJ Region 9: St. Thomas (MN).** The field (Mitchell Hamline, Marquette, Creighton) is upper Midwest and West, and TCPR has St. Thomas (MN) entering AAJ that year.
- **2026-27 First Chair, Philadelphia: St. Thomas (FL).** The STU trial team's own post (screenshot from Chris) says its team reached the First Chair final at Drexel. With this, no unlabeled "St. Thomas" is left, so 195 schools are rated.
- **2026-27 Battle of the Experts: Loyola LA.** The participant list said "Loyola", but the results name Loyola LA as a semifinalist. The event had "10 teams, 10 schools", so the record was counting one Loyola LA team as two competitors.

The St. Thomas entries are pinned in `ST_THOMAS_AT` and the Loyola entry in `LOYOLA_AT`, both in parse_results.py. Effect: St. Thomas (FL) goes from 2536 (11th) to 2561 (8th), St. Thomas (MN) from 2143 to 2124, and no other named school moves more than 5 points.

<<<<<<< HEAD
Still unidentified: "Loyola" at the Cumberland/Mercer All Star site (Region C, Fall 2026). Elsewhere in the record, "Loyola LA" means Loyola Marymount (it hosts events in Los Angeles, and Loyola New Orleans is listed under its own name), so that label does not settle it. It is that entry's only competition.
=======
Still unidentified: "Loyola" at the Cumberland/Mercer All Star site (Fall 2026). It is that entry's only competition.
>>>>>>> parent of cb5dee8 (Ratings: All Star 2026 Cumberland/Mercer 'Loyola' is Loyola Marymount (Chris))
