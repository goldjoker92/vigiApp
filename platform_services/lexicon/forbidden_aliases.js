const FAMILIES = [];

// ---- Ajout familles: gangs brésiliens (noms/argot/variantes accentuées)
FAMILIES.push({
  family: 'gangs_br',
  terms: [
    // bloc nationaux + RJ/SP/RN/CE/AM/PA/SC/RS etc.
    'comando vermelho',
    'cv',
    'c.v.',
    'primeiro comando da capital',
    'primeiro comando',
    'pcc',
    'p.c.c.',
    'terceiro comando puro',
    'terceiro comando',
    'tcp',
    't.c.p.',
    'amigos dos amigos',
    'ada',
    'a.d.a.',
    'familia do norte',
    'família do norte',
    'fdn',
    'f.d.n.',
    'guardioes do estado',
    'guardiões do estado',
    'gde',
    'g.d.e.',
    'bonde dos 40',
    'b40',
    'b.40',
    'primeiro grupo catarinense',
    'pgc',
    'p.g.c.',
    'os manos',
    'bala na cara',
    // argot/obfus de rue (fréquent CE/NE)
    'okaida',
    'al qaeda',
    'alqaeda',
    'al-qaeda',
    'sindicato do crime',
    'sindicato',
    'crime organizado',
  ],
  exceptions: [
    // limite les faux positifs
    /\bsindicato (?!do crime)\b/i,
    /\bgrupo catarinense\b(?!.*primeiro)/i,
    /\bfamilia\b(?!.*do norte)/i,
  ],
});

// ---- Ajout aliases stricts: capturent sigles et versions espacées/punctuées
const _STRICT_ALIASES = [
  // Add your forbidden aliases here
  'foo',
  'bar',
  { family: 'gangs_br', patterns: ['c\\.v\\.', 'c v', 'comando\\s*vermelho'] },
  {
    family: 'gangs_br',
    patterns: ['p\\.c\\.c\\.', 'p c c', 'primeiro\\s*comando\\s*(?:da\\s*capital)?'],
  },
  { family: 'gangs_br', patterns: ['t\\.c\\.p\\.', 't c p', 'terceiro\\s*comando\\s*puro?'] },
  { family: 'gangs_br', patterns: ['a\\.d\\.a\\.', 'a d a', 'amigos\\s*dos\\s*amigos'] },
  { family: 'gangs_br', patterns: ['f\\.d\\.n\\.', 'f d n', 'famil[ií]a\\s*do\\s*norte'] },
  { family: 'gangs_br', patterns: ['g\\.d\\.e\\.', 'g d e', 'guardi[õo]es?\\s*do\\s*estado'] },
  { family: 'gangs_br', patterns: ['b\\.40', 'b 40', 'bonde\\s*dos\\s*40'] },
  { family: 'gangs_br', patterns: ['p\\.g\\.c\\.', 'p g c', 'primeiro\\s*grupo\\s*catarinense'] },
];
