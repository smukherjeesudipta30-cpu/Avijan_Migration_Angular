/**
 * Types Bengali from an English keyboard.
 *
 * <p>The competition notice, the venue and both sets of rules are shown to parents in
 * Bengali, but the office machines have no Bengali keyboard, so those boxes could only
 * ever be filled by pasting text prepared somewhere else. This converts what is typed
 * in Roman letters: "ami" becomes "আমি".</p>
 *
 * <p>The scheme is the one people here already know from Avro — phonetic, longest match
 * first, so "kh" is খ rather than ক followed by হ. Two consonants with no vowel between
 * them join into a conjunct on their own ("kk" gives ক্ক), which is what makes ordinary
 * words come out right without anyone having to think about hasant.</p>
 *
 * <p>It runs in the browser with no service behind it. That is deliberate: the office
 * types these lists once a year, often on a slow line, and an input service that is
 * unreachable would leave the Bengali half of the poster empty.</p>
 */

/** Independent vowels, and the sign each one becomes after a consonant. */
const VOWELS: ReadonlyArray<readonly [string, string, string]> = [
  // roman, standalone, sign (kar)
  ['rri', 'ঋ', 'ৃ'],
  ['ou', 'ঔ', 'ৌ'],
  ['oi', 'ঐ', 'ৈ'],
  ['oo', 'ঊ', 'ূ'],
  ['ee', 'ঈ', 'ী'],
  ['aa', 'আ', 'া'],
  ['O', 'ও', 'ো'],
  ['I', 'ঈ', 'ী'],
  ['U', 'ঊ', 'ূ'],
  ['A', 'আ', 'া'],
  ['E', 'এ', 'ে'],
  ['a', 'আ', 'া'],
  ['i', 'ই', 'ি'],
  ['u', 'উ', 'ু'],
  ['e', 'এ', 'ে'],
  /* 'o' is the vowel Bengali already carries inside every consonant, so after a
     consonant it prints nothing at all -- "kok" is কক, not ক-something-ক. */
  ['o', 'অ', '']
];

/** Consonants and the few marks that behave like them. */
const CONSONANTS: ReadonlyArray<readonly [string, string]> = [
  ['kkh', 'ক্ষ'],
  ['ngg', 'ঙ্গ'],
  ['jnj', 'জ্ঞ'],
  ['NG', 'ঞ'],
  ['Ng', 'ঙ'],
  ['kh', 'খ'],
  ['gh', 'ঘ'],
  ['ch', 'ছ'],
  ['jh', 'ঝ'],
  ['Th', 'ঠ'],
  ['Dh', 'ঢ'],
  ['th', 'থ'],
  ['dh', 'ধ'],
  ['ph', 'ফ'],
  ['bh', 'ভ'],
  ['sh', 'শ'],
  ['Sh', 'ষ'],
  ['Rh', 'ঢ়'],
  ['ng', 'ং'],
  ['k', 'ক'],
  ['g', 'গ'],
  ['c', 'চ'],
  ['j', 'জ'],
  ['T', 'ট'],
  ['D', 'ড'],
  ['N', 'ণ'],
  ['t', 'ত'],
  ['d', 'দ'],
  ['n', 'ন'],
  ['p', 'প'],
  ['f', 'ফ'],
  ['b', 'ব'],
  ['v', 'ভ'],
  ['m', 'ম'],
  ['z', 'য'],
  ['y', 'য়'],
  ['r', 'র'],
  ['R', 'ড়'],
  ['l', 'ল'],
  ['S', 'ষ'],
  ['s', 'স'],
  ['h', 'হ'],
  ['w', 'ও'],
  ['x', 'ক্স'],
  ['q', 'ক']
];

/** Marks that stand on their own, and the punctuation Bengali writes differently. */
const SIGNS: ReadonlyArray<readonly [string, string]> = [
  ['^', 'ঁ'],
  [':', 'ঃ'],
  ['t9', 'ৎ'],
  [',,', '্'],
  ['$', '৳']
];

const DIGITS = '০১২৩৪৫৬৭৮৯';

const HASANT = '্';

/** Everything the engine can be asked to produce, for the palette on screen. */
export interface BengaliPaletteGroup {
  readonly title: string;
  readonly items: ReadonlyArray<{ readonly key: string; readonly glyph: string }>;
}

export const BENGALI_PALETTE: ReadonlyArray<BengaliPaletteGroup> = [
  {
    title: 'Vowels',
    items: [
      { key: 'o', glyph: 'অ' }, { key: 'a', glyph: 'আ' }, { key: 'i', glyph: 'ই' },
      { key: 'ee', glyph: 'ঈ' }, { key: 'u', glyph: 'উ' }, { key: 'oo', glyph: 'ঊ' },
      { key: 'rri', glyph: 'ঋ' }, { key: 'e', glyph: 'এ' }, { key: 'oi', glyph: 'ঐ' },
      { key: 'O', glyph: 'ও' }, { key: 'ou', glyph: 'ঔ' }
    ]
  },
  {
    title: 'Consonants',
    items: [
      { key: 'k', glyph: 'ক' }, { key: 'kh', glyph: 'খ' }, { key: 'g', glyph: 'গ' },
      { key: 'gh', glyph: 'ঘ' }, { key: 'Ng', glyph: 'ঙ' }, { key: 'c', glyph: 'চ' },
      { key: 'ch', glyph: 'ছ' }, { key: 'j', glyph: 'জ' }, { key: 'jh', glyph: 'ঝ' },
      { key: 'NG', glyph: 'ঞ' }, { key: 'T', glyph: 'ট' }, { key: 'Th', glyph: 'ঠ' },
      { key: 'D', glyph: 'ড' }, { key: 'Dh', glyph: 'ঢ' }, { key: 'N', glyph: 'ণ' },
      { key: 't', glyph: 'ত' }, { key: 'th', glyph: 'থ' }, { key: 'd', glyph: 'দ' },
      { key: 'dh', glyph: 'ধ' }, { key: 'n', glyph: 'ন' }, { key: 'p', glyph: 'প' },
      { key: 'f', glyph: 'ফ' }, { key: 'b', glyph: 'ব' }, { key: 'v', glyph: 'ভ' },
      { key: 'm', glyph: 'ম' }, { key: 'z', glyph: 'য' }, { key: 'r', glyph: 'র' },
      { key: 'l', glyph: 'ল' }, { key: 'sh', glyph: 'শ' }, { key: 'Sh', glyph: 'ষ' },
      { key: 's', glyph: 'স' }, { key: 'h', glyph: 'হ' }, { key: 'R', glyph: 'ড়' },
      { key: 'Rh', glyph: 'ঢ়' }, { key: 'y', glyph: 'য়' }, { key: 't9', glyph: 'ৎ' }
    ]
  },
  {
    title: 'Signs and digits',
    items: [
      { key: 'ng', glyph: 'ং' }, { key: ':', glyph: 'ঃ' }, { key: '^', glyph: 'ঁ' },
      { key: ',,', glyph: '্' }, { key: '.', glyph: '।' }, { key: '$', glyph: '৳' },
      { key: '0', glyph: '০' }, { key: '1', glyph: '১' }, { key: '2', glyph: '২' },
      { key: '3', glyph: '৩' }, { key: '4', glyph: '৪' }, { key: '5', glyph: '৫' },
      { key: '6', glyph: '৬' }, { key: '7', glyph: '৭' }, { key: '8', glyph: '৮' },
      { key: '9', glyph: '৯' }
    ]
  }
];

/* Longest first, so "kh" is never read as "k" then "h". */
const ORDERED_CONSONANTS = [...CONSONANTS].sort((a, b) => b[0].length - a[0].length);
const ORDERED_VOWELS = [...VOWELS].sort((a, b) => b[0].length - a[0].length);
const ORDERED_SIGNS = [...SIGNS].sort((a, b) => b[0].length - a[0].length);

function matchAt(
  source: string,
  at: number,
  table: ReadonlyArray<readonly string[]>
): readonly string[] | null {
  for (const row of table) {
    if (source.startsWith(row[0], at)) return row;
  }
  return null;
}

/**
 * Converts one run of Roman letters to Bengali.
 *
 * <p>Anything the tables do not recognise — a bracket, a stray English word — is passed
 * through untouched rather than dropped, so a line that mixes a Bengali sentence with a
 * phone number or "40%" survives intact.</p>
 */
export function toBengali(roman: string): string {
  let out = '';
  let at = 0;

  /* True while the last thing written was a consonant that has not yet been given a
     vowel. It is what decides between a vowel's sign and its standalone letter, and
     it is what makes two consonants in a row join up. */
  let consonantOpen = false;

  while (at < roman.length) {
    /* Whichever table offers the longest match wins, rather than the tables being
       tried in a fixed order: "rri" is the vowel ঋ, but a consonants-first pass would
       take the "r" off the front of it and leave ন্র্রি where নৃ was meant. */
    const sign = matchAt(roman, at, ORDERED_SIGNS);
    const consonantMatch = matchAt(roman, at, ORDERED_CONSONANTS);
    const vowelMatch = matchAt(roman, at, ORDERED_VOWELS);

    const longest = Math.max(
      sign?.[0].length ?? 0,
      consonantMatch?.[0].length ?? 0,
      vowelMatch?.[0].length ?? 0
    );

    if (sign && sign[0].length === longest) {
      out += sign[1];
      at += sign[0].length;
      consonantOpen = false;
      continue;
    }

    const consonant = consonantMatch && consonantMatch[0].length === longest
      ? consonantMatch
      : null;

    if (consonant) {
      if (consonantOpen) out += HASANT;
      out += consonant[1];
      at += consonant[0].length;
      /* ং, ঃ and ঁ hang off the letter before them; they never take a vowel and must
         not pull a hasant out of the next consonant. */
      consonantOpen = !'ংঃঁ'.includes(consonant[1]);
      continue;
    }

    const vowel = vowelMatch;
    if (vowel) {
      out += consonantOpen ? vowel[2] : vowel[1];
      at += vowel[0].length;
      consonantOpen = false;
      continue;
    }

    const ch = roman[at];

    if (ch >= '0' && ch <= '9') {
      out += DIGITS[Number(ch)];
      at += 1;
      consonantOpen = false;
      continue;
    }

    /* A full stop closing a Bengali word is a daari. One inside "40.5" is not. */
    if (ch === '.' && consonantOpen) {
      out += '।';
      at += 1;
      consonantOpen = false;
      continue;
    }

    out += ch;
    at += 1;
    consonantOpen = false;
  }

  return out;
}

/**
 * Converts only the word the caret is sitting in, leaving the rest of the box alone.
 *
 * <p>Converting the whole box on every keystroke would re-convert text that is already
 * Bengali and destroy it. Only the run of Roman characters immediately before the caret
 * is touched, so pasted Bengali, and everything typed earlier, is safe.</p>
 *
 * @returns the new text and where the caret should sit afterwards
 */
export function convertWordAtCaret(
  text: string,
  caret: number
): { text: string; caret: number } {
  let start = caret;
  while (start > 0 && isTypeable(text[start - 1])) start -= 1;

  const word = text.slice(start, caret);
  if (!word) return { text, caret };

  const bengali = toBengali(word);
  const next = text.slice(0, start) + bengali + text.slice(caret);

  return { text: next, caret: start + bengali.length };
}

/** The characters that belong to the word being typed. */
function isTypeable(ch: string): boolean {
  return /[A-Za-z0-9^:,$.]/.test(ch);
}
