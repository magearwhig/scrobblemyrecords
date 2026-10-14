/**
 * Display casing for names that are stored lowercased (history index keys).
 *
 * Only a fallback: prefer real casing from the collection or artist name
 * mappings, since title-casing gets some names wrong ("lcd soundsystem"
 * becomes "Lcd Soundsystem"). Names that already contain a capital letter are
 * returned unchanged.
 */

/** Short words kept lowercase unless they start or end the name */
const MINOR_WORDS = new Set([
  'a',
  'an',
  'and',
  'as',
  'at',
  'but',
  'by',
  'de',
  'for',
  'from',
  'in',
  'into',
  'nor',
  'of',
  'on',
  'or',
  'over',
  'the',
  'to',
  'vs',
  'with',
]);

/** Roman numerals such as "ii" or "xiv" are written in capitals */
const ROMAN_NUMERAL = /^(?=[ivxlc]+$)c{0,3}(xc|xl|l?x{0,3})(ix|iv|v?i{0,3})$/;

function capitalizeWord(word: string): string {
  if (ROMAN_NUMERAL.test(word)) return word.toUpperCase();
  // Capitalize the first letter, and the first letter after a hyphen, slash,
  // opening bracket or quote ("go-betweens", "(live)", "'til")
  return word.replace(
    /(^|[-/([{"'‘“])(\p{L})/gu,
    (_match, before: string, letter: string) => before + letter.toUpperCase()
  );
}

export function toDisplayName(name: string): string {
  if (!name || /\p{Lu}/u.test(name)) return name;
  const words = name.split(' ');
  return words
    .map((word, i) => {
      const isEdge = i === 0 || i === words.length - 1;
      // A word after a colon or dash starts a new phrase ("Live: At The Bbc")
      const startsPhrase = i > 0 && /[:–—-]$/.test(words[i - 1]);
      if (!isEdge && !startsPhrase && MINOR_WORDS.has(word)) return word;
      return capitalizeWord(word);
    })
    .join(' ');
}
