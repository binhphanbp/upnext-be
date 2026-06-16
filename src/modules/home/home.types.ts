import { HomeJobTab } from './dto/home-query.dto';

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
};

export type HomeData = {
  stats: {
    jobsCount: number;
    companiesCount: number;
    candidatesCount: number;
  };
  jobsSection: {
    all: HomeJobsSectionTab;
    remote: HomeJobsSectionTab;
    partTime: HomeJobsSectionTab;
    latest: HomeJobsSectionTab;
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
  }>;
  marketInsight: {
    summary: {
      month: number;
      year: number;
      newJobsCount: number;
      activeJobsCount: number;
      hiringCompaniesCount: number;
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
