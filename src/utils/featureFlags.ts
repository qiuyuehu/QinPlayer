// =============================================================================
// QinPlayer — Feature Flags 工具
// =============================================================================
// 职责：集中管理功能开关默认值、解析规则和导航守卫
// =============================================================================

import type { FeatureFlagKey, FeatureFlags } from '../types/ipc'

export const FEATURE_FLAG_KEYS: readonly FeatureFlagKey[] = [
  'playback',
  'equalizer',
  'lyrics',
  'albums',
  'recent',
  'liked',
  'search',
  'miniMode',
  'tray',
  'playlists',
  'settings',
  'fadeEffect',
  'mediaSession',
]

export const DEFAULT_FEATURE_FLAGS: FeatureFlags = {
  playback: true,
  equalizer: true,
  lyrics: true,
  albums: true,
  recent: true,
  liked: true,
  search: true,
  miniMode: true,
  tray: true,
  playlists: true,
  settings: true,
  fadeEffect: true,
  mediaSession: true,
}

const NAV_FLAG_MAP: Partial<Record<string, FeatureFlagKey>> = {
  search: 'search',
  recent: 'recent',
  albums: 'albums',
  playlists: 'playlists',
  liked: 'liked',
  lyrics: 'lyrics',
  settings: 'settings',
}

function isFeatureFlagKey(key: string): key is FeatureFlagKey {
  return FEATURE_FLAG_KEYS.includes(key as FeatureFlagKey)
}

export function normalizeFeatureFlags(raw: unknown): FeatureFlags {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...DEFAULT_FEATURE_FLAGS }
  }

  const cleaned: Partial<FeatureFlags> = {}
  for (const [key, value] of Object.entries(raw)) {
    if (isFeatureFlagKey(key) && typeof value === 'boolean') {
      cleaned[key] = value
    }
  }

  return { ...DEFAULT_FEATURE_FLAGS, ...cleaned }
}

export function parseFeatureFlagsText(text: string | null): FeatureFlags {
  if (!text) return { ...DEFAULT_FEATURE_FLAGS }

  try {
    return normalizeFeatureFlags(JSON.parse(text))
  } catch {
    return { ...DEFAULT_FEATURE_FLAGS }
  }
}

export function hasFeature(flags: FeatureFlags, key: FeatureFlagKey): boolean {
  return flags[key] === true
}

export function canPlay(flags: FeatureFlags): boolean {
  return flags.playback === true
}

export function isNavAllowed(nav: string, flags: FeatureFlags): boolean {
  const flagKey = NAV_FLAG_MAP[nav]
  if (!flagKey) return true
  return hasFeature(flags, flagKey)
}
