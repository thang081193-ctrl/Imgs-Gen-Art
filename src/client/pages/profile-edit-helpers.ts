// Session #30 Step 4 — ProfileEdit form-state helpers. Split from
// ProfileEdit.tsx so the page component stays under the LOC cap.
//
// EditableSlice is the subset of AppProfile the form controls directly:
// identity + visual + positioning + context. Assets are mutated by the
// AssetsSection against the backend directly (upload/delete → server
// mutates the profile), and re-sync into the editor via a refetch.

import type {
  ProfileContextDto,
  ProfileCreateInput,
  ProfileDto,
  ProfilePositioningDto,
  ProfileVisualDto,
  ProfileCategory,
} from "@/core/dto/profile-dto"
import type { ProfileUpdateInput } from "@/core/dto/profile-dto"

export interface EditableSlice {
  name: string
  tagline: string
  category: ProfileCategory
  visual: ProfileVisualDto
  positioning: ProfilePositioningDto
  context: ProfileContextDto
}

export const BLANK_PROFILE: ProfileCreateInput = {
  name: "",
  tagline: "",
  category: "utility",
  assets: {
    appLogoAssetId: null,
    storeBadgeAssetId: null,
    screenshotAssetIds: [],
  },
  visual: {
    primaryColor: "#3b82f6",
    secondaryColor: "#6366f1",
    accentColor: "#f59e0b",
    tone: "minimal",
    doList: [],
    dontList: [],
  },
  positioning: {
    usp: "",
    targetPersona: "",
    marketTier: "global",
  },
  context: {
    features: [],
    keyScenarios: [],
    forbiddenContent: [],
  },
}

export function sliceFromCreateInput(input: ProfileCreateInput): EditableSlice {
  return {
    name: input.name,
    tagline: input.tagline,
    category: input.category,
    visual: input.visual,
    positioning: input.positioning,
    context: input.context,
  }
}

export function sliceFromDto(dto: ProfileDto): EditableSlice {
  return {
    name: dto.name,
    tagline: dto.tagline,
    category: dto.category,
    visual: dto.visual,
    positioning: dto.positioning,
    context: dto.context,
  }
}

// Create payload: blank assets; first save can't carry assets because
// /api/profiles/:id/upload-asset targets an existing id.
export function buildCreateInput(slice: EditableSlice): ProfileCreateInput {
  return {
    name: slice.name.trim(),
    tagline: slice.tagline.trim(),
    category: slice.category,
    assets: {
      appLogoAssetId: null,
      storeBadgeAssetId: null,
      screenshotAssetIds: [],
    },
    visual: slice.visual,
    positioning: slice.positioning,
    context: slice.context,
  }
}

// Update payload: omit assets entirely so server mergeUpdate preserves them
// (AssetsSection handles asset changes out-of-band). expectedVersion is the
// server's reported version — v1 literal(1) makes this a placeholder, but
// the contract stays stable for v2 migration.
export function buildUpdateInput(
  slice: EditableSlice,
  expectedVersion: number,
): ProfileUpdateInput {
  return {
    expectedVersion,
    name: slice.name.trim(),
    tagline: slice.tagline.trim(),
    category: slice.category,
    visual: slice.visual,
    positioning: slice.positioning,
    context: slice.context,
  }
}

// Deep equality via JSON canonicalization — slices are flat enough that
// a stable stringify over sorted keys isn't necessary (we always construct
// them via the same helpers above so key order is stable).
export function slicesEqual(a: EditableSlice, b: EditableSlice): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}
