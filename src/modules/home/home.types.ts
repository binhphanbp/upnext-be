export type HomeApiResponse<T> = {
  success: true;
  data: T;
};

export type HomeJobCard = {
  id: string;
  title: string;
  slug?: string;
  skills: Array<{
    id: string;
    name: string;
  }>;
  location: string;
  workMode: string;
  employmentType: string;
  experience: string;
  salary: {
    min?: number;
    max?: number;
    currency?: string;
    label: string;
  };
  company: {
    id: string;
    name: string;
    logo?: string;
    avatar?: string;
  };
  deadline: string | null;
  /** Aggregate public views supplied by the server; the client must not infer this value. */
  viewCount: number;
  publishedAt?: string | null;
  daysRemaining?: number | null;
  urgencyTone?: 'URGENT' | 'WARNING' | 'NORMAL' | null;
  badges?: Array<'NEW' | 'REMOTE'>;
  createdAt: string;
};

export type HomeLatestJobCard = {
  id: string;
  title: string;
  slug?: string;
  company: {
    id: string;
    name: string;
    logo?: string;
    avatar?: string;
  };
  location: string;
  workMode: string;
  employmentType: string;
  positionName?: string;
  createdAt: string;
  postedAtText?: string;
  publishedAt?: string | null;
};

export type HomePostCard = {
  id: string;
  title: string;
  slug: string;
  type: string;
  thumbnailUrl?: string;
  coverImageUrl?: string;
  metaDescription?: string;
  category?: {
    id: string;
    name: string;
    slug: string;
  };
  createdAt: string;
};

export type HomeData = {
  stats: {
    jobsCount: number;
    companiesCount: number;
    candidatesCount: number;
    openJobsCount: number;
    activeEmployersCount: number;
    newJobs7dCount: number;
  };
  jobsSection: {
    all: HomeJobsSectionTab;
    remote: HomeJobsSectionTab;
    partTime: HomeJobsSectionTab;
    latest: HomeJobsSectionTab;
    popular: HomeJobsSectionTab;
    expiring: HomeJobsSectionTab;
  };
  topCompanies: Array<{
    id: string;
    name: string;
    logo?: string;
    coverImage?: string;
    companyType: string;
    shortDescription: string;
    activeJobsCount: number;
    applicationsCount: number;
    latestPublishedAt?: string | null;
  }>;
  marketInsight: {
    summary: {
      month: number;
      year: number;
      newJobsCount: number;
      activeJobsCount: number;
      hiringCompaniesCount: number;
      openJobsCount: number;
      activeEmployersCount: number;
      newJobs7dCount: number;
      newJobs24hCount: number;
    };
    jobGrowthLineChart: {
      from: string;
      to: string;
      minValue: number;
      maxValue: number;
      growthPercent: number;
      points: Array<{
        date: string;
        jobsCount: number;
      }>;
    };
    salaryDemandBarChart: Array<{
      salaryRange: string;
      jobsCount: number;
    }>;
    latestJobs: HomeLatestJobCard[];
  };
  companyLogos: Array<{
    slug: string;
    name: string;
    logo: string;
  }>;
  latestPosts: HomePostCard[];
  personalization?: HomePersonalization;
  actions?: HomeAction[];
  recommendations?: HomeRecommendationSection;
};

export type HomePersonalization = {
  state: 'GUEST' | 'INSUFFICIENT' | 'ELIGIBLE' | 'NOT_LOOKING';
  signalGroups: string[];
  missingSignals: string[];
};

export type HomeRecommendation = {
  job: HomeJobCard;
  score: number;
  reasonCodes: string[];
  matchedSkills: string[];
};

export type HomeRecommendationSection = {
  title: 'RECOMMENDED' | 'LATEST';
  items: HomeRecommendation[];
};

export type HomeAction = {
  type:
    | 'APPLICATION_UPDATED'
    | 'SAVED_JOB_EXPIRING'
    | 'FOLLOWED_COMPANY_NEW_JOB'
    | 'MISSING_CV'
    | 'MISSING_PREFERENCES';
  jobId?: string;
  applicationId?: string;
  companyId?: string;
  status?: string;
  expiresAt?: string | null;
};

export type HomeJobsSectionTab = {
  items: HomeJobCard[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
};
