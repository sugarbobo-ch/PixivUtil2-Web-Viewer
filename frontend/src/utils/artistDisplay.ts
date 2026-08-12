export type PixivConfigSections = Record<string, Record<string, string>>;

const FANBOX_FILENAME_FORMAT_KEYS = new Set([
  'filenameformatfanboxcover',
  'filenameformatfanboxcontent',
  'filenameformatfanboxinfo',
]);

const normalizeConfigKey = (value: string) => value.replace(/[\s_-]/g, '').toLocaleLowerCase();

const getConfigSection = (
  sections: PixivConfigSections,
  targetSection: string,
): Record<string, string> | undefined => {
  const normalizedTarget = normalizeConfigKey(targetSection);
  const entry = Object.entries(sections).find(
    ([sectionName]) => normalizeConfigKey(sectionName) === normalizedTarget,
  );
  return entry?.[1];
};

/**
 * Read the literal folder prefix from PixivUtil2's FANBOX filename format.
 *
 * For example, `FANBOX %artist% (%member_id%)\\...` produces `FANBOX`, while
 * a format beginning directly with `%artist%` produces no display prefix.
 */
export const getFanboxFolderPrefix = (sections: PixivConfigSections): string => {
  const fanboxSection = getConfigSection(sections, 'FANBOX');
  if (!fanboxSection) return '';

  const format = Object.entries(fanboxSection).find(([key, value]) => (
    FANBOX_FILENAME_FORMAT_KEYS.has(normalizeConfigKey(key))
    && /%artist%/i.test(value)
  ))?.[1];
  if (!format) return '';

  const artistTokenIndex = format.search(/%artist%/i);
  if (artistTokenIndex < 0) return '';

  return format
    .slice(0, artistTokenIndex)
    .replace(/[\\/]+$/, '')
    .trim();
};

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Remove only a configured prefix from a display name; stored paths remain untouched. */
export const stripArtistFolderPrefix = (name: string, prefix: string): string => {
  const trimmedName = name.trim();
  const trimmedPrefix = prefix.trim();
  if (!trimmedName || !trimmedPrefix) return trimmedName;

  const prefixPattern = new RegExp(`^${escapeRegExp(trimmedPrefix)}(?=\\s|$)\\s*`, 'i');
  const strippedName = trimmedName.replace(prefixPattern, '').trim();
  return strippedName || trimmedName;
};
