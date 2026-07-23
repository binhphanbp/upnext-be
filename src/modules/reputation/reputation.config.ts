function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const REPUTATION_CONFIG = {
  MIN_SCORE: 0,
  MAX_SCORE: 100,
  MIN_SCORE_TO_PUBLISH: envNumber('REPUTATION_MIN_SCORE_TO_PUBLISH', 50),

  STATIC_TAX_CODE_BONUS: envNumber('REPUTATION_STATIC_TAX_CODE_BONUS', 15),
  STATIC_COMPANY_INFO_BONUS: envNumber('REPUTATION_STATIC_COMPANY_INFO_BONUS', 10),

  CV_MIN_APPLICATIONS: envNumber('REPUTATION_CV_MIN_APPLICATIONS', 5),
  CV_EVAL_WINDOW_DAYS: envNumber('REPUTATION_CV_EVAL_WINDOW_DAYS', 7),
  CV_PROCESSING_MIN_HOURS: envNumber('REPUTATION_CV_PROCESSING_MIN_HOURS', 2),

  // Ngưỡng tỷ lệ CV xử lý hợp lệ (đã đổi status khác SUBMITTED sau > CV_PROCESSING_MIN_HOURS)
  // trong cửa sổ đánh giá, dùng bởi scoreForProcessingRate().
  CV_PENALTY_RATE_THRESHOLD: envNumber('REPUTATION_CV_PENALTY_RATE_THRESHOLD', 0.45),
  CV_NEUTRAL_RATE_THRESHOLD: envNumber('REPUTATION_CV_NEUTRAL_RATE_THRESHOLD', 0.5),
  CV_GOOD_RATE_THRESHOLD: envNumber('REPUTATION_CV_GOOD_RATE_THRESHOLD', 0.8),
  CV_PENALTY_SCORE: envNumber('REPUTATION_CV_PENALTY_SCORE', -5),
  CV_ADEQUATE_SCORE: envNumber('REPUTATION_CV_ADEQUATE_SCORE', 2),
  CV_GOOD_SCORE: envNumber('REPUTATION_CV_GOOD_SCORE', 5),

  EXPIRY_UNRESOLVED_PENALTY: envNumber('REPUTATION_EXPIRY_UNRESOLVED_PENALTY', 10),
  HIRING_RESULT_REPORT_BONUS: envNumber('REPUTATION_HIRING_RESULT_REPORT_BONUS', 10),

  APPEAL_WINDOW_DAYS: envNumber('REPUTATION_APPEAL_WINDOW_DAYS', 14),
} as const;

export function clampScore(score: number): number {
  return Math.min(REPUTATION_CONFIG.MAX_SCORE, Math.max(REPUTATION_CONFIG.MIN_SCORE, score));
}

export function scoreForProcessingRate(rate: number): number {
  const {
    CV_PENALTY_RATE_THRESHOLD,
    CV_NEUTRAL_RATE_THRESHOLD,
    CV_GOOD_RATE_THRESHOLD,
    CV_PENALTY_SCORE,
    CV_ADEQUATE_SCORE,
    CV_GOOD_SCORE,
  } = REPUTATION_CONFIG;

  if (rate < CV_PENALTY_RATE_THRESHOLD) return CV_PENALTY_SCORE;
  if (rate < CV_NEUTRAL_RATE_THRESHOLD) return 0;
  if (rate <= CV_GOOD_RATE_THRESHOLD) return CV_ADEQUATE_SCORE;
  return CV_GOOD_SCORE;
}
