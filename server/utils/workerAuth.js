const stripWrappingQuotes = (value) => {
  if (!value) return '';
  const trimmed = String(value).trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
};

export const parseWorkerKeyList = (raw) => {
  if (!raw) return [];
  return String(raw)
    .split(',')
    .map((value) => stripWrappingQuotes(value))
    .map((value) => value.trim())
    .filter(Boolean);
};

export const getAllowedWorkerKeys = () => {
  const keysEnv = process.env.LINKING_WORKER_KEYS || process.env.LINKING_WORKER_KEY || '';
  return parseWorkerKeyList(keysEnv);
};

export const normalizeWorkerHeaderKey = (headerValue) => {
  const [first] = parseWorkerKeyList(headerValue);
  return first || '';
};

