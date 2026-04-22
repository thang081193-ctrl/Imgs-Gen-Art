// Barrel for src/server/templates/. Server-side consumers (routes, workflow
// runners) import getters + preloadAllTemplates from here. Raw loader +
// TemplateName union are re-exported for tests that exercise the pure
// loadTemplate() fn against fixture directories.

export {
  ALL_TEMPLATE_NAMES,
  DEFAULT_TEMPLATES_DIR,
  loadTemplate,
  type LoadTemplateOptions,
  type TemplateName,
} from "./loader"

export {
  getAdLayouts,
  getArtworkGroups,
  getCopyTemplates,
  getCountryProfiles,
  getI18n,
  getStyleDna,
  preloadAllTemplates,
  _resetTemplateCacheForTests,
} from "./cache"
