"""Builds src/data/school-enrollment.json: each rated law school's total JD enrollment and its
entering class's median LSAT and undergraduate GPA, from the ABA Standard 509 compilations (2025):
"JD Enrollment and Ethnicity" (TotalGrandTotal) and "First Year Class" (All50thPercentileLSAT,
All50thPercentileUGPA). Source TSV columns: ABA name, enrollment, median LSAT, median GPA.
Source TSV: scripts/enrollment/aba-2025-jd-enrollment.tsv. Run: python3 scripts/enrollment/build.py"""
import csv, json, os, re, sys
HERE = os.path.dirname(__file__)
ROOT = os.path.join(HERE, '..', '..')
aba = {}
for name, n, lsat, gpa in csv.reader(open(os.path.join(HERE, 'aba-2025-jd-enrollment.tsv')), delimiter='\t'):
    aba[name] = (int(n), int(lsat), float(gpa))

# Rating name -> ABA name, where the obvious match doesn't work.
MAP = {
    'UCLA': 'California-Los Angeles, University of', 'UC Berkeley': 'California-Berkeley, University of',
    'UC Law SF': 'California-San Francisco, University of', 'UC Davis': 'California-Davis, University of',
    'UC Irvine': 'California-Irvine, University of', 'USC': 'Southern California, University of',
    'NYU': 'New York University', 'CUNY': 'City University of New York, University of',
    'UNLV': 'Nevada-Las Vegas, University of', 'UMKC': 'Missouri-Kansas City, University of',
    'SMU': 'Southern Methodist University', 'BYU': 'Brigham Young University', 'LSU': 'Louisiana State University',
    'UDC': 'District of Columbia, University of', 'Texas': 'Texas, University of',
    'Ohio State': 'The Ohio State University', 'St. Thomas (FL)': 'St. Thomas University (Miami)',
    'St. Thomas (MN)': 'St. Thomas, (Minneapolis) University of', 'Cumberland': 'Samford University',
    'Chicago-Kent': 'Chicago-Kent, Illinois Institute of Technology', 'University of Chicago': 'Chicago, The University of',
    'Loyola LA': 'Loyola Marymount University-Los Angeles', 'Loyola Chicago': 'Loyola University-Chicago',
    'Loyola New Orleans': 'Loyola University-New Orleans', 'Cal Western': 'California Western School of Law',
    'Pacific McGeorge': 'Pacific, University of the', 'Washington University': 'Washington University (St. Louis)',
    'Washington': 'Washington, University of', 'Western State': 'Western State, Westcliff University',
    'Illinois Chicago': 'Illinois-Chicago, University of', 'St. Louis': 'Saint Louis University',
    'New England': 'New England Law/Boston', 'Case Western': 'Case Western Reserve University',
    'Cleveland State': 'Cleveland State University', 'Miami': 'Miami, University of',
    'Appalachian': 'Appalachian School of Law', 'South Texas': 'South Texas College of Law Houston',
    'UNT Dallas': 'North Texas at Dallas, University of', 'North Texas': 'North Texas at Dallas, University of',
    'Purdue Global': None, 'West LA': None, 'Birmingham': None, 'Golden Gate': None, 'Thomas Jefferson': None,
    'Loyola': None, 'St. Thomas': None,
    'Penn State': 'Penn State Dickinson Law', 'Penn State Dickinson': 'Penn State Dickinson Law',
    'Penn': 'Pennsylvania, University of', 'Cardozo': 'Cardozo, Yeshiva University', 'Yeshiva': 'Cardozo, Yeshiva University',
    'Mississippi College': 'Mississippi Christian University', 'Mississippi': 'Mississippi, The University of',
    'John Marshall Atlanta': "Atlanta's John Marshall Law School", 'Cooley': 'Cooley Law School',
    'InterAmerican Puerto Rico': 'Inter American University of Puerto Rico', 'University of Puerto Rico': 'Puerto Rico, University of',
    'Massachusetts': 'Massachusetts/Dartmouth, University of', 'Mitchell Hamline': 'Mitchell/Hamline School of Law',
    'Widener': 'Widener University Delaware Law School', 'Wilmington': 'Wilmington University School of Law',
    'Indiana': 'Indiana University-Bloomington', 'Lewis & Clark': 'Lewis & Clark Law School',
    'Southern': 'Southern University', 'Southwestern': 'Southwestern Law School', 'Capital': 'Capital University Law School',
    'Arkansas Little Rock': 'Arkansas at Little Rock, University of', 'Northern Kentucky': 'Northern Kentucky University',
    'Northern Illinois': 'Northern Illinois University', 'North Carolina Central': 'North Carolina Central University',
    'Albany': 'Albany Law School', 'Vermont': 'Vermont Law School', 'Maine': 'Maine, University of',
    'Charleston': 'Charleston School of Law', 'New York Law School': 'New York Law School',
    'Penn State Law': 'Penn State Dickinson Law', 'Buffalo': 'Buffalo, University at', 'Florida': 'Florida, University of',
    'Georgia': 'Georgia, University of', 'Michigan': 'Michigan, University of', 'Illinois': 'Illinois, University of',
    'Arizona': 'Arizona, The University of', 'Arkansas': 'Arkansas, University of', 'Kansas': 'Kansas, The University of',
    'Kentucky': 'Kentucky, University of', 'Missouri': 'Missouri, University of', 'Oklahoma': 'Oklahoma, University of',
    'Tennessee': 'Tennessee, University of', 'Virginia': 'Virginia, University of', 'Wisconsin': 'Wisconsin, University of',
    'Colorado': 'Colorado, University of', 'Iowa': 'Iowa, University of', 'Minnesota': 'Minnesota, University of',
    'Nebraska': 'Nebraska, University of', 'Maryland': 'Maryland, University of', 'Houston': 'Houston, University of',
    'Denver': 'Denver, University of', 'Memphis': 'Memphis, The University of', 'Alabama': 'Alabama, The University of',
    'Akron': 'Akron, The University of', 'Cincinnati': 'Cincinnati, University of', 'Dayton': 'Dayton, University of',
    'Louisville': 'Louisville, University of', 'Richmond': 'Richmond, University of', 'Tulsa': 'Tulsa, The University of',
    'Utah': 'Utah, The University of', 'Montana': 'Montana, University of', 'Hawaii': 'Hawaii, University of',
    'Oregon': 'Oregon, University of', 'Pittsburgh': 'Pittsburgh, University of', 'New Mexico': 'New Mexico, The University of',
    'North Dakota': 'North Dakota, University of', 'South Dakota': 'South Dakota, University of',
    'North Carolina': 'North Carolina, University of', 'South Carolina': 'South Carolina, University of',
    'New Hampshire': 'New Hampshire, University of', 'Connecticut': 'Connecticut, University of',
    'San Diego': 'San Diego, University of', 'San Francisco': 'San Francisco, University of', 'Baltimore': 'Baltimore, University of',
    'Notre Dame': 'Notre Dame, University of', 'Catholic': 'Catholic University of America, The',
    'George Washington': 'George Washington University, The', 'Texas Tech': 'Texas Tech University',
    'Texas A&M': 'Texas A&M University', 'American': 'American University', 'Columbia': 'Columbia University', 'Texas Southern': 'Texas Southern University',
}
UNRATED_NOTE = {
    'Purdue Global': 'Not ABA-approved (online, California-accredited); no 509 report.',
    'West LA': 'University of West Los Angeles is California-accredited, not ABA-approved; no 509 report.',
    'Birmingham': 'Birmingham School of Law is Alabama-accredited, not ABA-approved; no 509 report.',
    'Golden Gate': 'Closed its JD program (no 2025 509 report).',
    'Thomas Jefferson': 'No longer ABA-approved; no 2025 509 report.',
    'Loyola': 'Record does not say which Loyola (LA, Chicago or New Orleans).',
    'St. Thomas': 'Record does not say which St. Thomas (Miami or Minnesota).',
}
NOTE = {
    'Penn State': 'Penn State Law (University Park) and Dickinson Law merged in 2025; enrollment is the merged school.',
    'Penn State Dickinson': 'Merged with Penn State Law (University Park) in 2025; enrollment is the merged school.',
    'Widener': 'Assumed Widener Delaware (NTC Region 3, Philadelphia); Widener Commonwealth has 411.',
    'Yeshiva': 'Same school as Cardozo (Benjamin N. Cardozo School of Law, Yeshiva University).',
    'North Texas': 'Same school as UNT Dallas (UNT Dallas College of Law).',
    'Mississippi College': 'Renamed Mississippi Christian University.',
}

def norm(s): return re.sub(r'[^a-z]', '', s.lower())
schools = [r['school'] for r in csv.DictReader(open(os.path.join(ROOT, 'public/ratings-data/ratings.csv')))]
out, missing = {}, []
for s in schools:
    if s in MAP: a = MAP[s]
    else:
        c = [n for n in aba if norm(n).startswith(norm(s)) or norm(s + ' University') == norm(n) or norm(s) in norm(n)]
        a = c[0] if len(c) == 1 else 'AMBIG:' + '; '.join(c)
    if a is None:
        out[s] = {'enrollment': None, 'lsat': None, 'gpa': None, 'note': UNRATED_NOTE[s]}
    elif a not in aba:
        missing.append((s, a))
    else:
        n, lsat, gpa = aba[a]
        out[s] = {'enrollment': n, 'lsat': lsat, 'gpa': gpa, 'aba': a, **({'note': NOTE[s]} if s in NOTE else {})}
if missing:
    for m in missing: print('UNMATCHED', m)
    sys.exit(1)
doc = {
    'source': 'ABA Standard 509 Information Report compilations: "JD Enrollment and Ethnicity" (total JD enrollment, all years, full and part time) and "First Year Class" (median LSAT and undergraduate GPA of the entering class)',
    'sourceUrl': 'https://www.abarequireddisclosures.org/requiredDisclosure/',
    'year': 2025,
    'schools': dict(sorted(out.items())),
}
json.dump(doc, open(os.path.join(ROOT, 'src/data/school-enrollment.json'), 'w'), indent=1, ensure_ascii=False)
print(len(out), 'schools;', sum(1 for v in out.values() if v['enrollment'] is None), 'without ABA data')
