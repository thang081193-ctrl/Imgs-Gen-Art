// PLAN-v3 §4 — policy-rules service barrel.
// Phase C1 ships the loader; C2 (scraper) and C3 (enforcement) extend
// from this entry point.

export {
  DEFAULT_POLICY_RULES_DIR,
  PolicyRulesLoaderError,
  getPolicyRules,
  loadPolicyRules,
  refreshPolicyRules,
  resetPolicyRulesCacheForTests,
} from "./loader"
export type { PolicyRulesLoaderOptions } from "./loader"
export {
  ALL_POLICY_PLATFORMS,
  POLICY_SOURCES,
  getSourcesFor,
} from "./sources"
export type { PolicyScrapeSource } from "./sources"
export {
  DEFAULT_SCRAPED_DIR,
  PolicyRulesScraperError,
  SCRAPER_HOST_DELAY_MS,
  SCRAPER_TIMEOUT_MS,
  SCRAPER_USER_AGENT,
  scrapeAll,
  scrapePlatform,
} from "./scraper"
export type {
  FetchFn,
  ScrapeAllOptions,
  ScrapeAllResult,
  ScrapeFailure,
  ScrapePlatformOptions,
  ScrapeResult,
} from "./scraper"
export {
  PolicyRuleSchema,
  PolicyPatternSchema,
  PolicyPlatformSchema,
  PolicySeveritySchema,
  PolicySourceSchema,
} from "@/core/schemas/policy-rule"
export type {
  PolicyPattern,
  PolicyPlatform,
  PolicyRule,
  PolicySeverity,
  PolicySource,
} from "@/core/schemas/policy-rule"
export {
  PolicyDecisionSchema,
  PolicyOverrideSchema,
  PolicyViolationSchema,
} from "@/core/schemas/policy-decision"
export type {
  PolicyDecision,
  PolicyOverride,
  PolicyViolation,
} from "@/core/schemas/policy-decision"
export { checkPolicy } from "./check-policy"
export type { CheckPolicyOptions } from "./check-policy"
export type { PolicyCheckInput, PolicyChecker } from "./checkers"
