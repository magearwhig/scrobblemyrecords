/** Formatting helpers shared by the Unresolved history components. */

const numberFormat = new Intl.NumberFormat();

export const formatCount = (value: number): string =>
  numberFormat.format(value);

export const pluralize = (
  count: number,
  singular: string,
  plural = `${singular}s`
): string => `${formatCount(count)} ${count === 1 ? singular : plural}`;

const dateOptions: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
};

/** Format a millisecond timestamp as a short date. */
export const formatDateMs = (ms: number): string =>
  new Date(ms).toLocaleDateString(undefined, dateOptions);

/** Format a first–last played range given Unix seconds. */
export const formatPlayedRange = (first: number, last: number): string => {
  const from = formatDateMs(first * 1000);
  const to = formatDateMs(last * 1000);
  return from === to ? from : `${from} – ${to}`;
};
