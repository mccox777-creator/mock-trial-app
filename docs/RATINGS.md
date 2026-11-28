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

1. **Start.** A school's rating starts at 1500 at its first competition in the record (Spring 2023 onward).
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
   - `K` is 40 for a school's first 5 competitions, then 20, and 10 at 2400 or above (as in FIDE chess).
   - A competition counts for a school only if one of its teams finished in a different round from a team of another
     school. A competition with no results changes nothing and doesn't count toward a school's total.
6. **Order.** Competitions are applied oldest first by start date. One with no date in the record takes the date of the one
   listed just before it in the same term. Competitions run in the app count once they close (finalized by the organizer,
   or 7 days after the last day) and their results are published.
7. **Labels.** Fewer than 5 competitions is provisional (`*`). Classes follow US Chess: Senior Master 2400+, Master 2200+,
   Expert 2000+, Class A 1800+, Class B 1600+, Class C 1400+, Class D 1200+, Class E below.

The code is in [`src/lib/elo.ts`](../src/lib/elo.ts).

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
- Some participant lists in the record are shorter than the stated team count, so a few schools that took part may be
  missing from those competitions. A missing school simply has no games there.

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

The top 10 now (28 November 2026, after the fix below):

| # | School | Rating | Class | Competitions |
| --- | --- | --- | --- | --- |
| 1 | UCLA | 2034 | Expert | 83 |
| 2 | Drexel | 1871 | Class A | 54 |
| 3 | Stetson | 1808 | Class A | 87 |
| 4 | Harvard | 1791 | Class B | 43 |
| 5 | Boston College | 1775 | Class B | 12 |
| 6 | American | 1773 | Class B | 33 |
| 7 | Texas | 1769 | Class B | 44 |
| 8 | Mercer | 1759 | Class B | 67 |
| 9 | Georgetown | 1748 | Class B | 42 |
| 10 | Ohio State | 1738 | Class B | 20 |

## Second audit, 28 November 2026

An independent re-implementation, written from the rules on this page alone, reproduces every published rating exactly
(198 schools, matching ratings.csv, the live `/api/ratings` feed, and verify_ratings.py). The data review found one
parser bug:

| Problem | Effect | Fix |
| --- | --- | --- |
| In "Charleston 2 was 5th", the team number was read as the place, so the team was credited with 2nd. Same for "Baylor 2 was 5th", "San Diego 2 and St. Mary's were 3rd" and "Drexel 2 was 3rd" (all Fall 2026 Premiere sites); "Illinois Chicago was 2nd and 3rd" lost the 3rd-place team | Illinois Chicago 1502 to 1542, Houston and Baylor swap 14th/15th, San Diego and Florida International swap 11th/12th, Charleston down 8 | A place now needs its ordinal ("5th"), and "2nd and 3rd" credits both teams |
