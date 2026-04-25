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
