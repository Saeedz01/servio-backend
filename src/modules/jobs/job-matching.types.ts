export type JobMatchKind = 'exact' | 'also_relevant';

export type MatchableJob = {
  id: string;
  categoryId: string;
  title: string;
  description: string;
  specialty: string | null;
  category?: {
    id: string;
    slug: string;
    keywords: string[];
  } | null;
};

export type MatchableService = {
  id: string;
  providerId: string;
  categoryId: string;
  title: string;
  description: string;
  specialty: string | null;
  category: {
    id: string;
    slug: string;
    keywords: string[];
  };
};

export type ProviderJobMatch = {
  providerId: string;
  matchKind: JobMatchKind;
};
