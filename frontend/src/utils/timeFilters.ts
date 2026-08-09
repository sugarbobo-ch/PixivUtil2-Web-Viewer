const YEAR_KEY_PATTERN = /^\d{4}$/;
const MONTH_KEY_PATTERN = /^(\d{4})-(\d{2})$/;
const MONTH_NUMBERS = Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, '0'));

export const isYearTimeFilter = (value: string) => YEAR_KEY_PATTERN.test(value.trim());

export const getYearFromTimeFilter = (value: string) => {
  const trimmedValue = value.trim();
  if (YEAR_KEY_PATTERN.test(trimmedValue)) return trimmedValue;

  const monthMatch = trimmedValue.match(MONTH_KEY_PATTERN);
  return monthMatch?.[1] ?? null;
};

export const getMonthKeysForYear = (year: string) => (
  MONTH_NUMBERS.map(month => `${year}-${month}`)
);

export const hasCompleteYearSelection = (values: string[], year: string) => {
  const selectedValues = new Set(values);
  return getMonthKeysForYear(year).every(month => selectedValues.has(month));
};

/**
 * Keep a year as the canonical filter whenever it represents the whole year.
 * This makes the URL and API request small while the UI can still render all
 * child months as selected from the year token.
 */
export const normalizeSelectedMonths = (values: string[]) => {
  const uniqueValues = Array.from(new Set(
    values
      .map(value => value.trim())
      .filter(Boolean),
  ));
  const explicitYears = new Set(uniqueValues.filter(isYearTimeFilter));
  const completeYears = new Set(
    uniqueValues
      .map(getYearFromTimeFilter)
      .filter((year): year is string => year !== null)
      .filter(year => hasCompleteYearSelection(uniqueValues, year)),
  );
  const collapsedYears = new Set([...explicitYears, ...completeYears]);
  const normalizedValues: string[] = [];
  const addedYears = new Set<string>();

  uniqueValues.forEach(value => {
    const year = getYearFromTimeFilter(value);
    if (year && collapsedYears.has(year)) {
      if (!addedYears.has(year)) {
        normalizedValues.push(year);
        addedYears.add(year);
      }
      return;
    }

    normalizedValues.push(value);
  });

  return normalizedValues;
};
