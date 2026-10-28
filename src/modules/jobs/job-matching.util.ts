import type {
  JobMatchKind,
  MatchableJob,
  MatchableService,
} from './job-matching.types.js';

const STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'by',
  'for',
  'from',
  'has',
  'have',
  'i',
  'in',
  'is',
  'it',
  'its',
  'me',
  'my',
  'of',
  'on',
  'or',
  'our',
  'please',
  'the',
  'to',
  'we',
  'with',
  'you',
  'your',
  'need',
  'needed',
  'looking',
  'want',
  'help',
  'service',
  'services',
]);

export function normalizeText(...parts: Array<string | null | undefined>): string {
  return parts
    .filter((part): part is string => Boolean(part && part.trim()))
    .join(' ')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenize(text: string): string[] {
  if (!text) return [];
  return text
    .split(/[\s-]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !STOPWORDS.has(token));
}

function serviceHaystack(service: MatchableService): string {
  return normalizeText(service.title, service.description, service.specialty);
}

function jobHaystack(job: MatchableJob): string {
  return normalizeText(job.title, job.description, job.specialty);
}

function keywordHits(haystack: string, keywords: string[]): number {
  let hits = 0;
  for (const keyword of keywords) {
    const needle = keyword.trim().toLowerCase();
    if (needle.length < 2) continue;
    if (haystack.includes(needle)) hits += 1;
  }
  return hits;
}

function tokenOverlap(left: string[], rightSet: Set<string>): number {
  let hits = 0;
  for (const token of left) {
    if (rightSet.has(token)) hits += 1;
  }
  return hits;
}

/**
 * Secondary relevance: job category keywords appear in service text,
 * or significant tokens from the service appear in the job text.
 * Never treats other-services as a universal match.
 */
export function isKeywordRelevant(
  job: MatchableJob,
  service: MatchableService,
): boolean {
  const jobText = jobHaystack(job);
  const serviceText = serviceHaystack(service);
  if (!jobText || !serviceText) return false;

  const jobCategoryKeywords = job.category?.keywords ?? [];
  if (keywordHits(serviceText, jobCategoryKeywords) >= 1) {
    return true;
  }

  // Service specialty/title tokens against job text (helps Other providers).
  const serviceTokens = tokenize(
    normalizeText(service.title, service.specialty, service.description),
  );
  const jobTokenSet = new Set(tokenize(jobText));
  if (tokenOverlap(serviceTokens, jobTokenSet) >= 2) {
    return true;
  }

  // Single strong specialty/title phrase hit (length >= 5) is enough.
  for (const token of serviceTokens) {
    if (token.length >= 5 && jobText.includes(token)) {
      return true;
    }
  }

  // Job specialty / title tokens against service category keywords on the service.
  if (
    service.category.slug !== 'other-services' &&
    keywordHits(jobText, service.category.keywords) >= 1
  ) {
    return true;
  }

  return false;
}

export function matchKindForServices(
  job: MatchableJob,
  services: MatchableService[],
): JobMatchKind | null {
  if (services.length === 0) return null;

  if (services.some((service) => service.categoryId === job.categoryId)) {
    return 'exact';
  }

  if (services.some((service) => isKeywordRelevant(job, service))) {
    return 'also_relevant';
  }

  return null;
}

/** Prefer an exact-category published service; else first keyword-relevant one. */
export function pickBookableService(
  job: MatchableJob,
  services: MatchableService[],
): MatchableService | null {
  const exact = services.find(
    (service) => service.categoryId === job.categoryId,
  );
  if (exact) return exact;

  return (
    services.find((service) => isKeywordRelevant(job, service)) ?? null
  );
}
