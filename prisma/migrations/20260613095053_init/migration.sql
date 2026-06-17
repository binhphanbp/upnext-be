-- CreateEnum
CREATE TYPE "AuthProvider" AS ENUM ('default', 'google', 'github', 'linkedin');

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('active', 'banned', 'pending_verification');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('male', 'female');

-- CreateEnum
CREATE TYPE "JobSearchStatus" AS ENUM ('open_to_work', 'not_looking');

-- CreateEnum
CREATE TYPE "ProfileVisibility" AS ENUM ('public', 'private');

-- CreateEnum
CREATE TYPE "ProficiencyLevel" AS ENUM ('beginner', 'intermediate', 'advanced', 'expert');

-- CreateEnum
CREATE TYPE "CvSource" AS ENUM ('upload', 'builder');

-- CreateEnum
CREATE TYPE "CvStatus" AS ENUM ('draft', 'active', 'archived');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('submitted', 'viewed', 'shortlisted', 'interviewing', 'offered', 'hired', 'rejected', 'withdrawn');

-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('candidate', 'recruiter', 'admin', 'system');

-- CreateEnum
CREATE TYPE "InterviewType" AS ENUM ('online', 'onsite');

-- CreateEnum
CREATE TYPE "InterviewStatus" AS ENUM ('scheduled', 'rescheduled', 'completed', 'cancelled', 'no_show');

-- CreateEnum
CREATE TYPE "InterviewResult" AS ENUM ('pending', 'passed', 'failed');

-- CreateEnum
CREATE TYPE "WorkingModel" AS ENUM ('onsite', 'remote', 'hybrid');

-- CreateEnum
CREATE TYPE "SalaryPeriod" AS ENUM ('hour', 'day', 'month', 'year');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('draft', 'published', 'closed', 'expired', 'hidden');

-- CreateEnum
CREATE TYPE "ModerationStatus" AS ENUM ('pending', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "SkillPriority" AS ENUM ('required', 'nice_to_have', 'bonus');

-- CreateEnum
CREATE TYPE "FilePurpose" AS ENUM ('cv', 'avatar', 'company_logo', 'business_license', 'certificate', 'post_thumbnail', 'post_cover', 'report_evidence', 'appeal_evidence', 'other');

-- CreateEnum
CREATE TYPE "FileVisibility" AS ENUM ('public', 'private');

-- CreateEnum
CREATE TYPE "CompanyType" AS ENUM ('product', 'outsourcing', 'startup', 'agency', 'other');

-- CreateEnum
CREATE TYPE "CompanyVerificationStatus" AS ENUM ('unverified', 'pending', 'verified', 'rejected');

-- CreateEnum
CREATE TYPE "CompanyStatus" AS ENUM ('active', 'locked');

-- CreateEnum
CREATE TYPE "ShortlistStatus" AS ENUM ('active', 'archived');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('in_app', 'email', 'sms');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('pending', 'sent', 'read', 'failed');

-- CreateEnum
CREATE TYPE "CompanyReviewStatus" AS ENUM ('pending', 'approved', 'rejected', 'hidden');

-- CreateEnum
CREATE TYPE "PostStatus" AS ENUM ('draft', 'published', 'archived');

-- CreateEnum
CREATE TYPE "PostType" AS ENUM ('blog', 'news', 'faq');

-- CreateEnum
CREATE TYPE "AdminStatus" AS ENUM ('active', 'inactive', 'locked');

-- CreateEnum
CREATE TYPE "RoleStatus" AS ENUM ('active', 'inactive');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('active', 'inactive', 'expired', 'cancelled');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('stripe', 'momo', 'sepay');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('pending', 'paid', 'failed', 'refunded');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('pending', 'reviewing', 'resolved', 'rejected');

-- CreateEnum
CREATE TYPE "AppealStatus" AS ENUM ('pending', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "JobBoostStatus" AS ENUM ('scheduled', 'active', 'ended', 'cancelled');

-- CreateEnum
CREATE TYPE "CompanyMemberStatus" AS ENUM ('active', 'invited', 'removed');

-- CreateEnum
CREATE TYPE "MockInterviewStatus" AS ENUM ('started', 'completed', 'canceled');

-- CreateTable
CREATE TABLE "candidate_accounts" (
    "id" UUID NOT NULL,
    "full_name" VARCHAR(150) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password_hash" VARCHAR(255),
    "auth_provider" "AuthProvider" NOT NULL DEFAULT 'default',
    "provider_user_id" VARCHAR(255),
    "candidate_account_status" "AccountStatus" NOT NULL DEFAULT 'active',
    "email_verified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "candidate_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidate_profiles" (
    "id" UUID NOT NULL,
    "candidate_account_id" UUID NOT NULL,
    "phone_number" VARCHAR(30),
    "gender" "Gender",
    "address" VARCHAR(255),
    "birthdate" DATE,
    "description" TEXT,
    "job_search_status" "JobSearchStatus" NOT NULL DEFAULT 'not_looking',
    "profile_visibility" "ProfileVisibility" NOT NULL DEFAULT 'public',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "candidate_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidate_educations" (
    "id" UUID NOT NULL,
    "candidate_profile_id" UUID NOT NULL,
    "school_name" VARCHAR(200) NOT NULL,
    "degree" VARCHAR(150),
    "major" VARCHAR(150),
    "start_date" DATE,
    "end_date" DATE,
    "is_current" BOOLEAN NOT NULL DEFAULT false,
    "gpa" DECIMAL(4,2),
    "description" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "candidate_educations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidate_experiences" (
    "id" UUID NOT NULL,
    "candidate_profile_id" UUID NOT NULL,
    "company_name" VARCHAR(200) NOT NULL,
    "position_title" VARCHAR(150) NOT NULL,
    "employment_type" VARCHAR(80),
    "start_date" DATE,
    "end_date" DATE,
    "is_current" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "technologies" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "candidate_experiences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidate_skills" (
    "id" UUID NOT NULL,
    "candidate_profile_id" UUID NOT NULL,
    "skill_id" UUID NOT NULL,
    "proficiency_level" "ProficiencyLevel" NOT NULL DEFAULT 'intermediate',
    "years_of_experience" DECIMAL(4,1),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "candidate_skills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidate_experience_skills" (
    "id" UUID NOT NULL,
    "candidate_experience_id" UUID NOT NULL,
    "skill_id" UUID NOT NULL,

    CONSTRAINT "candidate_experience_skills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidate_projects" (
    "id" UUID NOT NULL,
    "candidate_profile_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "role" VARCHAR(150),
    "description" TEXT,
    "project_url" VARCHAR(500),
    "technologies" TEXT,
    "deploy_url" VARCHAR(500),
    "start_date" DATE,
    "end_date" DATE,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "candidate_projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidate_certifications" (
    "id" UUID NOT NULL,
    "candidate_profile_id" UUID NOT NULL,
    "certificate_file_id" UUID,
    "name" VARCHAR(200) NOT NULL,
    "organization" VARCHAR(200),
    "issued_date" DATE,
    "expired_date" DATE,
    "credential_url" VARCHAR(500),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "candidate_certifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidate_languages" (
    "id" UUID NOT NULL,
    "candidate_profile_id" UUID NOT NULL,
    "language" VARCHAR(80) NOT NULL,
    "proficiency" VARCHAR(80) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "candidate_languages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidate_links" (
    "id" UUID NOT NULL,
    "candidate_profile_id" UUID NOT NULL,
    "type" VARCHAR(50) NOT NULL,
    "url" VARCHAR(500) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "candidate_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidate_job_preferences" (
    "id" UUID NOT NULL,
    "candidate_profile_id" UUID NOT NULL,
    "desired_position" VARCHAR(150),
    "desired_salary_min" DECIMAL(12,2),
    "desired_salary_max" DECIMAL(12,2),
    "salary_currency" VARCHAR(10) NOT NULL DEFAULT 'VND',
    "working_model" "WorkingModel",
    "desired_level_id" UUID,
    "notice_period_days" INTEGER,
    "is_relocate" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "candidate_job_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "files" (
    "id" UUID NOT NULL,
    "owner_type" VARCHAR(50),
    "owner_id" UUID,
    "purpose" "FilePurpose" NOT NULL DEFAULT 'other',
    "visibility" "FileVisibility" NOT NULL DEFAULT 'private',
    "storage_key" VARCHAR(500) NOT NULL,
    "original_name" VARCHAR(255) NOT NULL,
    "mime_type" VARCHAR(120) NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "public_url" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cvs" (
    "id" UUID NOT NULL,
    "candidate_profile_id" UUID NOT NULL,
    "title" VARCHAR(150) NOT NULL,
    "source" "CvSource" NOT NULL DEFAULT 'builder',
    "status" "CvStatus" NOT NULL DEFAULT 'active',
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cvs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cv_versions" (
    "id" UUID NOT NULL,
    "source_file_id" UUID,
    "cv_id" UUID NOT NULL,
    "template_id" UUID,
    "version_no" INTEGER NOT NULL,
    "content_json" JSONB,
    "parsed_text" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cv_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cv_templates" (
    "id" UUID NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "description" TEXT,
    "preview_image_url" VARCHAR(500),
    "layout_key" VARCHAR(80) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cv_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skill_categories" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "skill_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skills" (
    "id" UUID NOT NULL,
    "category_id" UUID,
    "name" VARCHAR(120) NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "skills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_categories" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employment_types" (
    "id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employment_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "experience_levels" (
    "id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "experience_levels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "specializations" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "slug" VARCHAR(150) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "specializations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "companies" (
    "id" UUID NOT NULL,
    "logo_file_id" UUID,
    "business_license_file_id" UUID,
    "type" "CompanyType" NOT NULL DEFAULT 'other',
    "name" VARCHAR(200) NOT NULL,
    "tax_code" VARCHAR(50),
    "address" VARCHAR(255),
    "email" VARCHAR(255),
    "phone" VARCHAR(30),
    "website" VARCHAR(500),
    "description" TEXT,
    "company_size" VARCHAR(80),
    "verification_status" "CompanyVerificationStatus" NOT NULL DEFAULT 'unverified',
    "reputation_score" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "status" "CompanyStatus" NOT NULL DEFAULT 'active',
    "locked_reason" TEXT,
    "locked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recruiter_roles" (
    "id" UUID NOT NULL,
    "code" VARCHAR(80) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recruiter_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recruiter_permissions" (
    "id" UUID NOT NULL,
    "code" VARCHAR(100) NOT NULL,
    "module" VARCHAR(80) NOT NULL,
    "action" VARCHAR(80) NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recruiter_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recruiter_role_permissions" (
    "id" UUID NOT NULL,
    "recruiter_role_id" UUID NOT NULL,
    "recruiter_permissions_id" UUID NOT NULL,

    CONSTRAINT "recruiter_role_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recruiter_accounts" (
    "id" UUID NOT NULL,
    "company_id" UUID,
    "recruiter_role_id" UUID,
    "email" VARCHAR(255) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "status" "AccountStatus" NOT NULL DEFAULT 'active',
    "email_verified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recruiter_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recruiter_profiles" (
    "id" UUID NOT NULL,
    "recruiter_account_id" UUID NOT NULL,
    "full_name" VARCHAR(150) NOT NULL,
    "phone_number" VARCHAR(30),
    "gender" "Gender",
    "avatar_url" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recruiter_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_members" (
    "id" UUID NOT NULL,
    "recruiter_account_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "role_id" UUID,
    "status" "CompanyMemberStatus" NOT NULL DEFAULT 'active',
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_posts" (
    "id" UUID NOT NULL,
    "created_by_recruiter_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "job_category_id" UUID,
    "experience_level_id" UUID,
    "employment_type_id" UUID,
    "title" VARCHAR(200) NOT NULL,
    "slug" VARCHAR(220) NOT NULL,
    "description" TEXT NOT NULL,
    "requirements" TEXT,
    "benefits" TEXT,
    "salary_min" DECIMAL(12,2),
    "salary_max" DECIMAL(12,2),
    "salary_currency" VARCHAR(10) NOT NULL DEFAULT 'VND',
    "salary_period" "SalaryPeriod" NOT NULL DEFAULT 'month',
    "salary_is_negotiable" BOOLEAN NOT NULL DEFAULT false,
    "salary_is_visible" BOOLEAN NOT NULL DEFAULT true,
    "vacancies_count" INTEGER NOT NULL DEFAULT 1,
    "status" "JobStatus" NOT NULL DEFAULT 'draft',
    "moderation_status" "ModerationStatus" NOT NULL DEFAULT 'pending',
    "moderation_note" TEXT,
    "reason" TEXT,
    "published_at" TIMESTAMP(3),
    "expired_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "job_posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_post_skills" (
    "id" UUID NOT NULL,
    "skill_id" UUID NOT NULL,
    "job_post_id" UUID NOT NULL,
    "min_years_experience" DECIMAL(4,1),
    "proficiency_level" "ProficiencyLevel",
    "priority" "SkillPriority" NOT NULL DEFAULT 'required',

    CONSTRAINT "job_post_skills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_post_specializations" (
    "id" UUID NOT NULL,
    "job_post_id" UUID NOT NULL,
    "specialization_id" UUID NOT NULL,
    "is_required" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "job_post_specializations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_locations" (
    "id" UUID NOT NULL,
    "country" VARCHAR(100) NOT NULL DEFAULT 'Vietnam',
    "working_model" "WorkingModel" NOT NULL,
    "city" VARCHAR(100),
    "district" VARCHAR(100),
    "address" VARCHAR(255),
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_post_locations" (
    "id" UUID NOT NULL,
    "job_post_id" UUID NOT NULL,
    "job_location_id" UUID NOT NULL,

    CONSTRAINT "job_post_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_jobs" (
    "id" UUID NOT NULL,
    "candidate_profile_id" UUID NOT NULL,
    "job_post_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_views" (
    "id" UUID NOT NULL,
    "candidate_profile_id" UUID,
    "job_post_id" UUID NOT NULL,
    "visitor_key" VARCHAR(120),
    "ip_address" VARCHAR(45),
    "user_agent" TEXT,
    "viewed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_views_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_follows" (
    "id" UUID NOT NULL,
    "candidate_profile_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "company_follows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recruiter_candidate_shortlists" (
    "id" UUID NOT NULL,
    "candidate_profile_id" UUID NOT NULL,
    "recruiter_account_id" UUID NOT NULL,
    "job_post_id" UUID,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "status" "ShortlistStatus" NOT NULL DEFAULT 'active',
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recruiter_candidate_shortlists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "applications" (
    "id" UUID NOT NULL,
    "job_post_id" UUID NOT NULL,
    "candidate_profile_id" UUID NOT NULL,
    "cv_version_id" UUID NOT NULL,
    "cover_letter" TEXT,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'submitted',
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "viewed_at" TIMESTAMP(3),
    "rejected_at" TIMESTAMP(3),
    "hired_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_status_logs" (
    "id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "actor_type" "ActorType" NOT NULL,
    "actor_id" UUID,
    "old_status" "ApplicationStatus",
    "new_status" "ApplicationStatus" NOT NULL,
    "reason" TEXT,
    "note" TEXT,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "application_status_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interviews" (
    "id" UUID NOT NULL,
    "recruiter_profile_id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "interview_round" INTEGER NOT NULL DEFAULT 1,
    "type" "InterviewType" NOT NULL DEFAULT 'online',
    "scheduled_start_at" TIMESTAMP(3) NOT NULL,
    "scheduled_end_at" TIMESTAMP(3) NOT NULL,
    "meeting_url" VARCHAR(500),
    "recruiter_note" TEXT,
    "location" VARCHAR(255),
    "status" "InterviewStatus" NOT NULL DEFAULT 'scheduled',
    "reschedule_count" INTEGER NOT NULL DEFAULT 0,
    "result" "InterviewResult" NOT NULL DEFAULT 'pending',
    "max_reschedule_count" INTEGER NOT NULL DEFAULT 3,
    "candidate_note" TEXT,
    "calendar_event_id" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "interviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interview_logs" (
    "id" UUID NOT NULL,
    "interview_id" UUID NOT NULL,
    "old_status" "InterviewStatus",
    "new_status" "InterviewStatus" NOT NULL,
    "proposed_start_at" TIMESTAMP(3),
    "proposed_end_at" TIMESTAMP(3),
    "actor_type" "ActorType" NOT NULL,
    "actor_id" UUID,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "interview_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "recipient_type" VARCHAR(50) NOT NULL,
    "recipient_id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "type" VARCHAR(80) NOT NULL,
    "target_type" VARCHAR(80),
    "target_id" UUID,
    "channel" "NotificationChannel" NOT NULL DEFAULT 'in_app',
    "status" "NotificationStatus" NOT NULL DEFAULT 'pending',
    "read_at" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_reviews" (
    "id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "overall_rating" INTEGER NOT NULL,
    "summary" TEXT,
    "overtime_satisfaction" INTEGER,
    "overtime_reason" TEXT,
    "what_i_love" TEXT,
    "improvement_suggestion" TEXT,
    "salary_benefits_rating" INTEGER,
    "training_learning_rating" INTEGER,
    "management_care_rating" INTEGER,
    "culture_fun_rating" INTEGER,
    "office_workspace_rating" INTEGER,
    "status" "CompanyReviewStatus" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "posts" (
    "id" UUID NOT NULL,
    "thumbnail_file_id" UUID,
    "cover_image_file_id" UUID,
    "category_id" UUID,
    "admin_id" UUID,
    "title" VARCHAR(255) NOT NULL,
    "slug" VARCHAR(280) NOT NULL,
    "content" TEXT NOT NULL,
    "status" "PostStatus" NOT NULL DEFAULT 'draft',
    "type" "PostType" NOT NULL DEFAULT 'blog',
    "meta_title" VARCHAR(255),
    "meta_description" TEXT,
    "meta_keywords" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "post_categories" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "slug" VARCHAR(150) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "post_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tags" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "slug" VARCHAR(150) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "post_tags" (
    "id" UUID NOT NULL,
    "post_id" UUID NOT NULL,
    "tag_id" UUID NOT NULL,

    CONSTRAINT "post_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin" (
    "id" UUID NOT NULL,
    "role_id" UUID,
    "created_by_admin_id" UUID,
    "full_name" VARCHAR(150) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "status" "AdminStatus" NOT NULL DEFAULT 'active',
    "avatar_url" VARCHAR(500),
    "last_login_at" TIMESTAMP(3),
    "phone" VARCHAR(30),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_roles" (
    "id" UUID NOT NULL,
    "created_by_admin_id" UUID,
    "role_name" VARCHAR(120) NOT NULL,
    "description" TEXT,
    "status" "RoleStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_permissions" (
    "id" UUID NOT NULL,
    "permission_name" VARCHAR(120) NOT NULL,
    "permission_code" VARCHAR(120) NOT NULL,
    "module" VARCHAR(80) NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_role_permissions" (
    "id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,

    CONSTRAINT "admin_role_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_audit_logs" (
    "id" UUID NOT NULL,
    "admin_id" UUID,
    "action" VARCHAR(120) NOT NULL,
    "target_id" UUID,
    "target_type" VARCHAR(80),
    "ip_address" VARCHAR(45),
    "old_value" JSONB,
    "new_value" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" UUID NOT NULL,
    "evidence_file_id" UUID,
    "reporter_candidate_id" UUID,
    "handled_by_admin_id" UUID,
    "target_type" VARCHAR(80) NOT NULL,
    "target_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appeals" (
    "id" UUID NOT NULL,
    "handled_by_admin_id" UUID,
    "recruiter_account_id" UUID NOT NULL,
    "evidence_file_id" UUID,
    "target_type" VARCHAR(80) NOT NULL,
    "target_id" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "status" "AppealStatus" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "appeals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_plans" (
    "id" UUID NOT NULL,
    "created_by_admin_id" UUID,
    "subscription_name" VARCHAR(150) NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "description" TEXT,
    "duration_days" INTEGER NOT NULL,
    "boost_credit_limit" INTEGER NOT NULL DEFAULT 0,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'active',
    "job_post_limit" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscription_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_subscriptions" (
    "id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "job_post_limit" INTEGER NOT NULL,
    "job_post_used" INTEGER NOT NULL DEFAULT 0,
    "boost_credit_total" INTEGER NOT NULL DEFAULT 0,
    "boost_credit_used" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expired_at" TIMESTAMP(3) NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" UUID NOT NULL,
    "subscription_plan_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "invoice_code" VARCHAR(80) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "payment_method" "PaymentMethod",
    "payment_status" "PaymentStatus" NOT NULL DEFAULT 'pending',
    "paid_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_boost" (
    "id" UUID NOT NULL,
    "created_by_recruiter_id" UUID NOT NULL,
    "company_subscription_id" UUID NOT NULL,
    "job_post_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "status" "JobBoostStatus" NOT NULL DEFAULT 'scheduled',
    "credit_cost" INTEGER NOT NULL,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_boost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_boost_metrics" (
    "id" UUID NOT NULL,
    "job_boost_id" UUID NOT NULL,
    "job_post_id" UUID NOT NULL,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "applications" INTEGER NOT NULL DEFAULT 0,
    "saved_count" INTEGER NOT NULL DEFAULT 0,
    "date" DATE NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_boost_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_reputation_activities" (
    "id" UUID NOT NULL,
    "reason" TEXT,
    "company_id" UUID NOT NULL,
    "action_type" VARCHAR(80) NOT NULL,
    "score" DECIMAL(6,2) NOT NULL,
    "by_admin_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "company_reputation_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_interview_configs" (
    "id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "tech_stack" VARCHAR(255),
    "experience_level" VARCHAR(80),
    "max_questions" INTEGER NOT NULL DEFAULT 10,
    "time_limit_minute" INTEGER,
    "is_adaptive" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_interview_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mock_interviews" (
    "id" UUID NOT NULL,
    "candidate_profile_id" UUID NOT NULL,
    "job_post_id" UUID,
    "config_id" UUID NOT NULL,
    "status" "MockInterviewStatus" NOT NULL DEFAULT 'started',
    "overall_score" DECIMAL(5,2),
    "ai_general_feedback" TEXT,
    "raw_llm_metadata" JSONB,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "canceled_at" TIMESTAMP(3),
    "total_questions" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mock_interviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interview_questions" (
    "id" UUID NOT NULL,
    "mock_interview_id" UUID NOT NULL,
    "question_text" TEXT NOT NULL,
    "focus_domain" VARCHAR(120),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "interview_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interview_answers" (
    "id" UUID NOT NULL,
    "interview_question_id" UUID NOT NULL,
    "answer_text_raw" TEXT,
    "audio_url" VARCHAR(500),
    "video_url" VARCHAR(500),
    "latency_seconds" DECIMAL(8,2),
    "duration_seconds" DECIMAL(8,2),
    "filler_words_count" INTEGER,
    "speaking_rate_wpm" INTEGER,
    "ai_score" DECIMAL(5,2),
    "ai_feedback_detail" JSONB,
    "suggested_answer" TEXT,
    "transcript_text" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "interview_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interview_score_dimensions" (
    "id" UUID NOT NULL,
    "mock_interview_id" UUID NOT NULL,
    "dimension_code" VARCHAR(120) NOT NULL,
    "dimension_score" DECIMAL(5,2),
    "dimension_feedback" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "interview_score_dimensions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "candidate_accounts_email_key" ON "candidate_accounts"("email");

-- CreateIndex
CREATE UNIQUE INDEX "candidate_accounts_auth_provider_provider_user_id_key" ON "candidate_accounts"("auth_provider", "provider_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "candidate_profiles_candidate_account_id_key" ON "candidate_profiles"("candidate_account_id");

-- CreateIndex
CREATE INDEX "candidate_profiles_job_search_status_idx" ON "candidate_profiles"("job_search_status");

-- CreateIndex
CREATE INDEX "candidate_profiles_profile_visibility_idx" ON "candidate_profiles"("profile_visibility");

-- CreateIndex
CREATE INDEX "candidate_educations_candidate_profile_id_sort_order_idx" ON "candidate_educations"("candidate_profile_id", "sort_order");

-- CreateIndex
CREATE INDEX "candidate_experiences_candidate_profile_id_sort_order_idx" ON "candidate_experiences"("candidate_profile_id", "sort_order");

-- CreateIndex
CREATE INDEX "candidate_skills_skill_id_idx" ON "candidate_skills"("skill_id");

-- CreateIndex
CREATE UNIQUE INDEX "candidate_skills_candidate_profile_id_skill_id_key" ON "candidate_skills"("candidate_profile_id", "skill_id");

-- CreateIndex
CREATE INDEX "candidate_experience_skills_skill_id_idx" ON "candidate_experience_skills"("skill_id");

-- CreateIndex
CREATE UNIQUE INDEX "candidate_experience_skills_candidate_experience_id_skill_i_key" ON "candidate_experience_skills"("candidate_experience_id", "skill_id");

-- CreateIndex
CREATE INDEX "candidate_projects_candidate_profile_id_sort_order_idx" ON "candidate_projects"("candidate_profile_id", "sort_order");

-- CreateIndex
CREATE INDEX "candidate_certifications_candidate_profile_id_sort_order_idx" ON "candidate_certifications"("candidate_profile_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "candidate_languages_candidate_profile_id_language_key" ON "candidate_languages"("candidate_profile_id", "language");

-- CreateIndex
CREATE UNIQUE INDEX "candidate_links_candidate_profile_id_type_url_key" ON "candidate_links"("candidate_profile_id", "type", "url");

-- CreateIndex
CREATE UNIQUE INDEX "candidate_job_preferences_candidate_profile_id_key" ON "candidate_job_preferences"("candidate_profile_id");

-- CreateIndex
CREATE INDEX "candidate_job_preferences_desired_level_id_idx" ON "candidate_job_preferences"("desired_level_id");

-- CreateIndex
CREATE INDEX "files_owner_type_owner_id_idx" ON "files"("owner_type", "owner_id");

-- CreateIndex
CREATE INDEX "files_purpose_visibility_idx" ON "files"("purpose", "visibility");

-- CreateIndex
CREATE INDEX "cvs_candidate_profile_id_is_default_idx" ON "cvs"("candidate_profile_id", "is_default");

-- CreateIndex
CREATE INDEX "cv_versions_source_file_id_idx" ON "cv_versions"("source_file_id");

-- CreateIndex
CREATE INDEX "cv_versions_template_id_idx" ON "cv_versions"("template_id");

-- CreateIndex
CREATE UNIQUE INDEX "cv_versions_cv_id_version_no_key" ON "cv_versions"("cv_id", "version_no");

-- CreateIndex
CREATE UNIQUE INDEX "cv_templates_layout_key_key" ON "cv_templates"("layout_key");

-- CreateIndex
CREATE UNIQUE INDEX "skill_categories_name_key" ON "skill_categories"("name");

-- CreateIndex
CREATE UNIQUE INDEX "skills_name_key" ON "skills"("name");

-- CreateIndex
CREATE INDEX "skills_category_id_idx" ON "skills"("category_id");

-- CreateIndex
CREATE UNIQUE INDEX "job_categories_name_key" ON "job_categories"("name");

-- CreateIndex
CREATE UNIQUE INDEX "employment_types_name_key" ON "employment_types"("name");

-- CreateIndex
CREATE UNIQUE INDEX "experience_levels_code_key" ON "experience_levels"("code");

-- CreateIndex
CREATE UNIQUE INDEX "specializations_slug_key" ON "specializations"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "companies_tax_code_key" ON "companies"("tax_code");

-- CreateIndex
CREATE INDEX "companies_verification_status_idx" ON "companies"("verification_status");

-- CreateIndex
CREATE INDEX "companies_status_idx" ON "companies"("status");

-- CreateIndex
CREATE UNIQUE INDEX "recruiter_roles_code_key" ON "recruiter_roles"("code");

-- CreateIndex
CREATE UNIQUE INDEX "recruiter_permissions_code_key" ON "recruiter_permissions"("code");

-- CreateIndex
CREATE UNIQUE INDEX "recruiter_role_permissions_recruiter_role_id_recruiter_perm_key" ON "recruiter_role_permissions"("recruiter_role_id", "recruiter_permissions_id");

-- CreateIndex
CREATE UNIQUE INDEX "recruiter_accounts_email_key" ON "recruiter_accounts"("email");

-- CreateIndex
CREATE INDEX "recruiter_accounts_company_id_idx" ON "recruiter_accounts"("company_id");

-- CreateIndex
CREATE INDEX "recruiter_accounts_recruiter_role_id_idx" ON "recruiter_accounts"("recruiter_role_id");

-- CreateIndex
CREATE UNIQUE INDEX "recruiter_profiles_recruiter_account_id_key" ON "recruiter_profiles"("recruiter_account_id");

-- CreateIndex
CREATE INDEX "company_members_company_id_idx" ON "company_members"("company_id");

-- CreateIndex
CREATE INDEX "company_members_role_id_idx" ON "company_members"("role_id");

-- CreateIndex
CREATE UNIQUE INDEX "company_members_recruiter_account_id_company_id_key" ON "company_members"("recruiter_account_id", "company_id");

-- CreateIndex
CREATE UNIQUE INDEX "job_posts_slug_key" ON "job_posts"("slug");

-- CreateIndex
CREATE INDEX "job_posts_company_id_idx" ON "job_posts"("company_id");

-- CreateIndex
CREATE INDEX "job_posts_job_category_id_idx" ON "job_posts"("job_category_id");

-- CreateIndex
CREATE INDEX "job_posts_experience_level_id_idx" ON "job_posts"("experience_level_id");

-- CreateIndex
CREATE INDEX "job_posts_employment_type_id_idx" ON "job_posts"("employment_type_id");

-- CreateIndex
CREATE INDEX "job_posts_status_moderation_status_published_at_idx" ON "job_posts"("status", "moderation_status", "published_at");

-- CreateIndex
CREATE INDEX "job_post_skills_skill_id_idx" ON "job_post_skills"("skill_id");

-- CreateIndex
CREATE UNIQUE INDEX "job_post_skills_job_post_id_skill_id_key" ON "job_post_skills"("job_post_id", "skill_id");

-- CreateIndex
CREATE INDEX "job_post_specializations_specialization_id_idx" ON "job_post_specializations"("specialization_id");

-- CreateIndex
CREATE UNIQUE INDEX "job_post_specializations_job_post_id_specialization_id_key" ON "job_post_specializations"("job_post_id", "specialization_id");

-- CreateIndex
CREATE INDEX "job_locations_city_district_idx" ON "job_locations"("city", "district");

-- CreateIndex
CREATE INDEX "job_locations_working_model_idx" ON "job_locations"("working_model");

-- CreateIndex
CREATE INDEX "job_post_locations_job_location_id_idx" ON "job_post_locations"("job_location_id");

-- CreateIndex
CREATE UNIQUE INDEX "job_post_locations_job_post_id_job_location_id_key" ON "job_post_locations"("job_post_id", "job_location_id");

-- CreateIndex
CREATE INDEX "saved_jobs_job_post_id_idx" ON "saved_jobs"("job_post_id");

-- CreateIndex
CREATE UNIQUE INDEX "saved_jobs_candidate_profile_id_job_post_id_key" ON "saved_jobs"("candidate_profile_id", "job_post_id");

-- CreateIndex
CREATE INDEX "job_views_job_post_id_viewed_at_idx" ON "job_views"("job_post_id", "viewed_at");

-- CreateIndex
CREATE INDEX "job_views_visitor_key_job_post_id_idx" ON "job_views"("visitor_key", "job_post_id");

-- CreateIndex
CREATE INDEX "company_follows_company_id_idx" ON "company_follows"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "company_follows_candidate_profile_id_company_id_key" ON "company_follows"("candidate_profile_id", "company_id");

-- CreateIndex
CREATE INDEX "recruiter_candidate_shortlists_recruiter_account_id_idx" ON "recruiter_candidate_shortlists"("recruiter_account_id");

-- CreateIndex
CREATE INDEX "recruiter_candidate_shortlists_job_post_id_idx" ON "recruiter_candidate_shortlists"("job_post_id");

-- CreateIndex
CREATE UNIQUE INDEX "recruiter_candidate_shortlists_candidate_profile_id_recruit_key" ON "recruiter_candidate_shortlists"("candidate_profile_id", "recruiter_account_id", "job_post_id");

-- CreateIndex
CREATE INDEX "applications_job_post_id_status_idx" ON "applications"("job_post_id", "status");

-- CreateIndex
CREATE INDEX "applications_candidate_profile_id_status_idx" ON "applications"("candidate_profile_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "applications_candidate_profile_id_job_post_id_key" ON "applications"("candidate_profile_id", "job_post_id");

-- CreateIndex
CREATE INDEX "application_status_logs_application_id_changed_at_idx" ON "application_status_logs"("application_id", "changed_at");

-- CreateIndex
CREATE INDEX "interviews_application_id_idx" ON "interviews"("application_id");

-- CreateIndex
CREATE INDEX "interviews_recruiter_profile_id_scheduled_start_at_idx" ON "interviews"("recruiter_profile_id", "scheduled_start_at");

-- CreateIndex
CREATE INDEX "interview_logs_interview_id_created_at_idx" ON "interview_logs"("interview_id", "created_at");

-- CreateIndex
CREATE INDEX "notifications_recipient_type_recipient_id_status_idx" ON "notifications"("recipient_type", "recipient_id", "status");

-- CreateIndex
CREATE INDEX "notifications_target_type_target_id_idx" ON "notifications"("target_type", "target_id");

-- CreateIndex
CREATE UNIQUE INDEX "company_reviews_application_id_key" ON "company_reviews"("application_id");

-- CreateIndex
CREATE INDEX "company_reviews_company_id_status_idx" ON "company_reviews"("company_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "posts_slug_key" ON "posts"("slug");

-- CreateIndex
CREATE INDEX "posts_category_id_idx" ON "posts"("category_id");

-- CreateIndex
CREATE INDEX "posts_status_type_idx" ON "posts"("status", "type");

-- CreateIndex
CREATE UNIQUE INDEX "post_categories_slug_key" ON "post_categories"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "tags_slug_key" ON "tags"("slug");

-- CreateIndex
CREATE INDEX "post_tags_tag_id_idx" ON "post_tags"("tag_id");

-- CreateIndex
CREATE UNIQUE INDEX "post_tags_post_id_tag_id_key" ON "post_tags"("post_id", "tag_id");

-- CreateIndex
CREATE UNIQUE INDEX "admin_email_key" ON "admin"("email");

-- CreateIndex
CREATE INDEX "admin_role_id_idx" ON "admin"("role_id");

-- CreateIndex
CREATE UNIQUE INDEX "admin_roles_role_name_key" ON "admin_roles"("role_name");

-- CreateIndex
CREATE UNIQUE INDEX "admin_permissions_permission_code_key" ON "admin_permissions"("permission_code");

-- CreateIndex
CREATE INDEX "admin_role_permissions_permission_id_idx" ON "admin_role_permissions"("permission_id");

-- CreateIndex
CREATE UNIQUE INDEX "admin_role_permissions_role_id_permission_id_key" ON "admin_role_permissions"("role_id", "permission_id");

-- CreateIndex
CREATE INDEX "admin_audit_logs_admin_id_created_at_idx" ON "admin_audit_logs"("admin_id", "created_at");

-- CreateIndex
CREATE INDEX "admin_audit_logs_target_type_target_id_idx" ON "admin_audit_logs"("target_type", "target_id");

-- CreateIndex
CREATE INDEX "reports_target_type_target_id_idx" ON "reports"("target_type", "target_id");

-- CreateIndex
CREATE INDEX "reports_status_idx" ON "reports"("status");

-- CreateIndex
CREATE INDEX "appeals_recruiter_account_id_idx" ON "appeals"("recruiter_account_id");

-- CreateIndex
CREATE INDEX "appeals_target_type_target_id_idx" ON "appeals"("target_type", "target_id");

-- CreateIndex
CREATE INDEX "company_subscriptions_company_id_status_idx" ON "company_subscriptions"("company_id", "status");

-- CreateIndex
CREATE INDEX "company_subscriptions_expired_at_idx" ON "company_subscriptions"("expired_at");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_invoice_code_key" ON "invoices"("invoice_code");

-- CreateIndex
CREATE INDEX "invoices_company_id_payment_status_idx" ON "invoices"("company_id", "payment_status");

-- CreateIndex
CREATE INDEX "job_boost_job_post_id_status_idx" ON "job_boost"("job_post_id", "status");

-- CreateIndex
CREATE INDEX "job_boost_company_id_idx" ON "job_boost"("company_id");

-- CreateIndex
CREATE INDEX "job_boost_metrics_job_post_id_date_idx" ON "job_boost_metrics"("job_post_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "job_boost_metrics_job_boost_id_date_key" ON "job_boost_metrics"("job_boost_id", "date");

-- CreateIndex
CREATE INDEX "company_reputation_activities_company_id_created_at_idx" ON "company_reputation_activities"("company_id", "created_at");

-- CreateIndex
CREATE INDEX "mock_interviews_candidate_profile_id_created_at_idx" ON "mock_interviews"("candidate_profile_id", "created_at");

-- CreateIndex
CREATE INDEX "mock_interviews_job_post_id_idx" ON "mock_interviews"("job_post_id");

-- CreateIndex
CREATE INDEX "interview_questions_mock_interview_id_sort_order_idx" ON "interview_questions"("mock_interview_id", "sort_order");

-- CreateIndex
CREATE INDEX "interview_answers_interview_question_id_idx" ON "interview_answers"("interview_question_id");

-- CreateIndex
CREATE UNIQUE INDEX "interview_score_dimensions_mock_interview_id_dimension_code_key" ON "interview_score_dimensions"("mock_interview_id", "dimension_code");

-- AddForeignKey
ALTER TABLE "candidate_profiles" ADD CONSTRAINT "candidate_profiles_candidate_account_id_fkey" FOREIGN KEY ("candidate_account_id") REFERENCES "candidate_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_educations" ADD CONSTRAINT "candidate_educations_candidate_profile_id_fkey" FOREIGN KEY ("candidate_profile_id") REFERENCES "candidate_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_experiences" ADD CONSTRAINT "candidate_experiences_candidate_profile_id_fkey" FOREIGN KEY ("candidate_profile_id") REFERENCES "candidate_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_skills" ADD CONSTRAINT "candidate_skills_candidate_profile_id_fkey" FOREIGN KEY ("candidate_profile_id") REFERENCES "candidate_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_skills" ADD CONSTRAINT "candidate_skills_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_experience_skills" ADD CONSTRAINT "candidate_experience_skills_candidate_experience_id_fkey" FOREIGN KEY ("candidate_experience_id") REFERENCES "candidate_experiences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_experience_skills" ADD CONSTRAINT "candidate_experience_skills_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_projects" ADD CONSTRAINT "candidate_projects_candidate_profile_id_fkey" FOREIGN KEY ("candidate_profile_id") REFERENCES "candidate_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_certifications" ADD CONSTRAINT "candidate_certifications_candidate_profile_id_fkey" FOREIGN KEY ("candidate_profile_id") REFERENCES "candidate_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_certifications" ADD CONSTRAINT "candidate_certifications_certificate_file_id_fkey" FOREIGN KEY ("certificate_file_id") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_languages" ADD CONSTRAINT "candidate_languages_candidate_profile_id_fkey" FOREIGN KEY ("candidate_profile_id") REFERENCES "candidate_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_links" ADD CONSTRAINT "candidate_links_candidate_profile_id_fkey" FOREIGN KEY ("candidate_profile_id") REFERENCES "candidate_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_job_preferences" ADD CONSTRAINT "candidate_job_preferences_candidate_profile_id_fkey" FOREIGN KEY ("candidate_profile_id") REFERENCES "candidate_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_job_preferences" ADD CONSTRAINT "candidate_job_preferences_desired_level_id_fkey" FOREIGN KEY ("desired_level_id") REFERENCES "experience_levels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cvs" ADD CONSTRAINT "cvs_candidate_profile_id_fkey" FOREIGN KEY ("candidate_profile_id") REFERENCES "candidate_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cv_versions" ADD CONSTRAINT "cv_versions_source_file_id_fkey" FOREIGN KEY ("source_file_id") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cv_versions" ADD CONSTRAINT "cv_versions_cv_id_fkey" FOREIGN KEY ("cv_id") REFERENCES "cvs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cv_versions" ADD CONSTRAINT "cv_versions_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "cv_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skills" ADD CONSTRAINT "skills_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "skill_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "companies" ADD CONSTRAINT "companies_logo_file_id_fkey" FOREIGN KEY ("logo_file_id") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "companies" ADD CONSTRAINT "companies_business_license_file_id_fkey" FOREIGN KEY ("business_license_file_id") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recruiter_role_permissions" ADD CONSTRAINT "recruiter_role_permissions_recruiter_role_id_fkey" FOREIGN KEY ("recruiter_role_id") REFERENCES "recruiter_roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recruiter_role_permissions" ADD CONSTRAINT "recruiter_role_permissions_recruiter_permissions_id_fkey" FOREIGN KEY ("recruiter_permissions_id") REFERENCES "recruiter_permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recruiter_accounts" ADD CONSTRAINT "recruiter_accounts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recruiter_accounts" ADD CONSTRAINT "recruiter_accounts_recruiter_role_id_fkey" FOREIGN KEY ("recruiter_role_id") REFERENCES "recruiter_roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recruiter_profiles" ADD CONSTRAINT "recruiter_profiles_recruiter_account_id_fkey" FOREIGN KEY ("recruiter_account_id") REFERENCES "recruiter_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_members" ADD CONSTRAINT "company_members_recruiter_account_id_fkey" FOREIGN KEY ("recruiter_account_id") REFERENCES "recruiter_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_members" ADD CONSTRAINT "company_members_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_members" ADD CONSTRAINT "company_members_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "recruiter_roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_posts" ADD CONSTRAINT "job_posts_created_by_recruiter_id_fkey" FOREIGN KEY ("created_by_recruiter_id") REFERENCES "recruiter_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_posts" ADD CONSTRAINT "job_posts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_posts" ADD CONSTRAINT "job_posts_job_category_id_fkey" FOREIGN KEY ("job_category_id") REFERENCES "job_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_posts" ADD CONSTRAINT "job_posts_experience_level_id_fkey" FOREIGN KEY ("experience_level_id") REFERENCES "experience_levels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_posts" ADD CONSTRAINT "job_posts_employment_type_id_fkey" FOREIGN KEY ("employment_type_id") REFERENCES "employment_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_post_skills" ADD CONSTRAINT "job_post_skills_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_post_skills" ADD CONSTRAINT "job_post_skills_job_post_id_fkey" FOREIGN KEY ("job_post_id") REFERENCES "job_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_post_specializations" ADD CONSTRAINT "job_post_specializations_job_post_id_fkey" FOREIGN KEY ("job_post_id") REFERENCES "job_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_post_specializations" ADD CONSTRAINT "job_post_specializations_specialization_id_fkey" FOREIGN KEY ("specialization_id") REFERENCES "specializations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_post_locations" ADD CONSTRAINT "job_post_locations_job_post_id_fkey" FOREIGN KEY ("job_post_id") REFERENCES "job_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_post_locations" ADD CONSTRAINT "job_post_locations_job_location_id_fkey" FOREIGN KEY ("job_location_id") REFERENCES "job_locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_jobs" ADD CONSTRAINT "saved_jobs_candidate_profile_id_fkey" FOREIGN KEY ("candidate_profile_id") REFERENCES "candidate_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_jobs" ADD CONSTRAINT "saved_jobs_job_post_id_fkey" FOREIGN KEY ("job_post_id") REFERENCES "job_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_views" ADD CONSTRAINT "job_views_candidate_profile_id_fkey" FOREIGN KEY ("candidate_profile_id") REFERENCES "candidate_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_views" ADD CONSTRAINT "job_views_job_post_id_fkey" FOREIGN KEY ("job_post_id") REFERENCES "job_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_follows" ADD CONSTRAINT "company_follows_candidate_profile_id_fkey" FOREIGN KEY ("candidate_profile_id") REFERENCES "candidate_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_follows" ADD CONSTRAINT "company_follows_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recruiter_candidate_shortlists" ADD CONSTRAINT "recruiter_candidate_shortlists_candidate_profile_id_fkey" FOREIGN KEY ("candidate_profile_id") REFERENCES "candidate_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recruiter_candidate_shortlists" ADD CONSTRAINT "recruiter_candidate_shortlists_recruiter_account_id_fkey" FOREIGN KEY ("recruiter_account_id") REFERENCES "recruiter_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recruiter_candidate_shortlists" ADD CONSTRAINT "recruiter_candidate_shortlists_job_post_id_fkey" FOREIGN KEY ("job_post_id") REFERENCES "job_posts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_job_post_id_fkey" FOREIGN KEY ("job_post_id") REFERENCES "job_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_candidate_profile_id_fkey" FOREIGN KEY ("candidate_profile_id") REFERENCES "candidate_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_cv_version_id_fkey" FOREIGN KEY ("cv_version_id") REFERENCES "cv_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_status_logs" ADD CONSTRAINT "application_status_logs_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_recruiter_profile_id_fkey" FOREIGN KEY ("recruiter_profile_id") REFERENCES "recruiter_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_logs" ADD CONSTRAINT "interview_logs_interview_id_fkey" FOREIGN KEY ("interview_id") REFERENCES "interviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_reviews" ADD CONSTRAINT "company_reviews_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_reviews" ADD CONSTRAINT "company_reviews_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_thumbnail_file_id_fkey" FOREIGN KEY ("thumbnail_file_id") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_cover_image_file_id_fkey" FOREIGN KEY ("cover_image_file_id") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "post_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_tags" ADD CONSTRAINT "post_tags_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_tags" ADD CONSTRAINT "post_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin" ADD CONSTRAINT "admin_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "admin_roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin" ADD CONSTRAINT "admin_created_by_admin_id_fkey" FOREIGN KEY ("created_by_admin_id") REFERENCES "admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_roles" ADD CONSTRAINT "admin_roles_created_by_admin_id_fkey" FOREIGN KEY ("created_by_admin_id") REFERENCES "admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_role_permissions" ADD CONSTRAINT "admin_role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "admin_roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_role_permissions" ADD CONSTRAINT "admin_role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "admin_permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_audit_logs" ADD CONSTRAINT "admin_audit_logs_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_evidence_file_id_fkey" FOREIGN KEY ("evidence_file_id") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_candidate_id_fkey" FOREIGN KEY ("reporter_candidate_id") REFERENCES "candidate_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_handled_by_admin_id_fkey" FOREIGN KEY ("handled_by_admin_id") REFERENCES "admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appeals" ADD CONSTRAINT "appeals_handled_by_admin_id_fkey" FOREIGN KEY ("handled_by_admin_id") REFERENCES "admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appeals" ADD CONSTRAINT "appeals_recruiter_account_id_fkey" FOREIGN KEY ("recruiter_account_id") REFERENCES "recruiter_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appeals" ADD CONSTRAINT "appeals_evidence_file_id_fkey" FOREIGN KEY ("evidence_file_id") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_plans" ADD CONSTRAINT "subscription_plans_created_by_admin_id_fkey" FOREIGN KEY ("created_by_admin_id") REFERENCES "admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_subscriptions" ADD CONSTRAINT "company_subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "subscription_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_subscriptions" ADD CONSTRAINT "company_subscriptions_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_subscription_plan_id_fkey" FOREIGN KEY ("subscription_plan_id") REFERENCES "subscription_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_boost" ADD CONSTRAINT "job_boost_created_by_recruiter_id_fkey" FOREIGN KEY ("created_by_recruiter_id") REFERENCES "recruiter_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_boost" ADD CONSTRAINT "job_boost_company_subscription_id_fkey" FOREIGN KEY ("company_subscription_id") REFERENCES "company_subscriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_boost" ADD CONSTRAINT "job_boost_job_post_id_fkey" FOREIGN KEY ("job_post_id") REFERENCES "job_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_boost" ADD CONSTRAINT "job_boost_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_boost_metrics" ADD CONSTRAINT "job_boost_metrics_job_boost_id_fkey" FOREIGN KEY ("job_boost_id") REFERENCES "job_boost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_boost_metrics" ADD CONSTRAINT "job_boost_metrics_job_post_id_fkey" FOREIGN KEY ("job_post_id") REFERENCES "job_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_reputation_activities" ADD CONSTRAINT "company_reputation_activities_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_reputation_activities" ADD CONSTRAINT "company_reputation_activities_by_admin_id_fkey" FOREIGN KEY ("by_admin_id") REFERENCES "admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mock_interviews" ADD CONSTRAINT "mock_interviews_candidate_profile_id_fkey" FOREIGN KEY ("candidate_profile_id") REFERENCES "candidate_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mock_interviews" ADD CONSTRAINT "mock_interviews_job_post_id_fkey" FOREIGN KEY ("job_post_id") REFERENCES "job_posts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mock_interviews" ADD CONSTRAINT "mock_interviews_config_id_fkey" FOREIGN KEY ("config_id") REFERENCES "ai_interview_configs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_questions" ADD CONSTRAINT "interview_questions_mock_interview_id_fkey" FOREIGN KEY ("mock_interview_id") REFERENCES "mock_interviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_answers" ADD CONSTRAINT "interview_answers_interview_question_id_fkey" FOREIGN KEY ("interview_question_id") REFERENCES "interview_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_score_dimensions" ADD CONSTRAINT "interview_score_dimensions_mock_interview_id_fkey" FOREIGN KEY ("mock_interview_id") REFERENCES "mock_interviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;
