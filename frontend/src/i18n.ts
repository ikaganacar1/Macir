// Simple identity tag — swap for a real i18n library later if needed
export const t = (strings: TemplateStringsArray, ...values: (string | number)[]): string =>
  strings.reduce((r, s, i) => r + s + (values[i] ?? ''), '');
