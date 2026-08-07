import { Prisma } from '@prisma/client';

export type JobPostForText = Prisma.JobPostGetPayload<{
  include: {
    jobCategory: true;
    employmentType: true;
    experienceLevel: true;
    jobPostSkills: { include: { skill: true } };
    jobPostSpecializations: { include: { specialization: true } };
    jobPostLocations: { include: { jobLocation: true } };
  };
}>;

export type CvVersionForText = Prisma.CVVersionGetPayload<{
  include: {
    sourceFile: true;
    cv: {
      include: {
        candidateProfile: {
          include: {
            account: { select: { fullName: true; email: true } };
            skills: { include: { skill: true } };
            experiences: true;
            projects: true;
            educations: true;
            certifications: true;
            jobPreference: true;
          };
        };
      };
    };
  };
}>;

export const JOB_TEXT_INCLUDE = {
  jobCategory: true,
  employmentType: true,
  experienceLevel: true,
  jobPostSkills: { include: { skill: true } },
  jobPostSpecializations: { include: { specialization: true } },
  jobPostLocations: { include: { jobLocation: true } },
} as const;

export const CV_TEXT_INCLUDE = {
  sourceFile: true,
  cv: {
    include: {
      candidateProfile: {
        include: {
          account: { select: { fullName: true, email: true } },
          skills: { include: { skill: true }, orderBy: { sortOrder: 'asc' } },
          experiences: { orderBy: { sortOrder: 'asc' } },
          projects: { orderBy: { sortOrder: 'asc' } },
          educations: { orderBy: { sortOrder: 'asc' } },
          certifications: { orderBy: { sortOrder: 'asc' } },
          jobPreference: true,
        },
      },
    },
  },
} as const;

export function buildJobText(jobPost: JobPostForText) {
  const skills = jobPost.jobPostSkills
    .map((item) =>
      [
        item.skill.name,
        item.priority ? `priority: ${item.priority}` : '',
        item.minYearsExperience ? `min years: ${item.minYearsExperience.toString()}` : '',
        item.proficiencyLevel ? `level: ${item.proficiencyLevel}` : '',
      ]
        .filter(Boolean)
        .join(' '),
    )
    .join(', ');

  const specializations = jobPost.jobPostSpecializations
    .map((item) => item.specialization.name)
    .join(', ');
  const locations = jobPost.jobPostLocations
    .map((item) =>
      [
        item.jobLocation.city,
        item.jobLocation.district,
        item.jobLocation.country,
        item.jobLocation.workingModel,
      ]
        .filter(Boolean)
        .join(', '),
    )
    .join('; ');

  return compactLines([
    `Job title: ${jobPost.title}`,
    `Category: ${jobPost.jobCategory?.name ?? ''}`,
    `Employment type: ${jobPost.employmentType?.name ?? ''}`,
    `Experience level: ${jobPost.experienceLevel?.name ?? ''}`,
    `Education level: ${jobPost.educationLevel}`,
    `Working days: ${jobPost.workingDays ?? ''}`,
    `Description: ${jobPost.description}`,
    `Requirements: ${jobPost.requirements ?? ''}`,
    `Benefits: ${jobPost.benefits ?? ''}`,
    `Required skills: ${skills}`,
    `Specializations: ${specializations}`,
    `Locations: ${locations}`,
  ]);
}

export function buildCvText(cvVersion: CvVersionForText) {
  const parsedText = cvVersion.parsedText?.trim();
  if (parsedText) {
    return parsedText;
  }

  const profile = cvVersion.cv.candidateProfile;
  const skills = profile.skills
    .map((item) =>
      [
        item.skill.name,
        item.proficiencyLevel,
        item.yearsOfExperience ? `${item.yearsOfExperience.toString()} years` : '',
      ]
        .filter(Boolean)
        .join(' '),
    )
    .join(', ');
  const experiences = profile.experiences
    .map((item) =>
      [item.positionTitle, item.companyName, item.technologies, item.description]
        .filter(Boolean)
        .join(' - '),
    )
    .join('\n');
  const projects = profile.projects
    .map((item) =>
      [item.name, item.role, item.technologies, item.description].filter(Boolean).join(' - '),
    )
    .join('\n');
  const educations = profile.educations
    .map((item) =>
      [item.schoolName, item.degree, item.major, item.description].filter(Boolean).join(' - '),
    )
    .join('\n');
  const certifications = profile.certifications
    .map((item) => [item.name, item.organization].filter(Boolean).join(' - '))
    .join(', ');

  return compactLines([
    `CV file: ${cvVersion.sourceFile?.originalName ?? cvVersion.cv.title}`,
    `Candidate name: ${profile.account.fullName}`,
    `Candidate email: ${profile.account.email}`,
    `Headline: ${profile.jobPreference?.desiredPosition ?? ''}`,
    `Profile summary: ${profile.description ?? ''}`,
    `Skills: ${skills}`,
    `Experience: ${experiences}`,
    `Projects: ${projects}`,
    `Education: ${educations}`,
    `Certifications: ${certifications}`,
  ]);
}

function compactLines(lines: string[]) {
  return lines
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter((line) => line && !line.endsWith(':'))
    .join('\n');
}
