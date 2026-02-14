/**
 * Reads the active tab from the current URL hash query parameters.
 * Validates against a list of allowed tab values and returns the default if invalid.
 *
 * @param validTabs - Array of valid tab identifier strings
 * @param defaultTab - Tab to return if no valid tab is found in the URL
 * @returns The active tab identifier
 */
export const getTabFromUrl = (
  validTabs: string[],
  defaultTab: string
): string => {
  const hash = window.location.hash;
  const queryStart = hash.indexOf('?');
  if (queryStart === -1) return defaultTab;
  const params = new URLSearchParams(hash.substring(queryStart));
  const tab = params.get('tab');
  return tab && validTabs.includes(tab) ? tab : defaultTab;
};
