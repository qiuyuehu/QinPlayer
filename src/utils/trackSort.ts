// =============================================================================
// QinPlayer — 歌曲排序
// =============================================================================
// 职责：生成本地化、稳定且不修改输入的歌曲排序副本
// =============================================================================

import type { SortOrder, Track } from '../types'

export type TrackSortBy = 'title' | 'artist' | 'playCount'

const trackCollator = new Intl.Collator(
  ['zh-CN-u-co-pinyin', 'zh-CN'],
  {
    usage: 'sort',
    sensitivity: 'base',
    numeric: true,
    ignorePunctuation: true,
  },
)

function isUnknownText(value: string, field: 'title' | 'artist'): boolean {
  const normalized = value.trim()
  return normalized.length === 0 || (field === 'artist' && normalized === '未知歌手')
}

function compareText(
  firstValue: string,
  secondValue: string,
  field: 'title' | 'artist',
  order: SortOrder,
): number {
  const firstUnknown = isUnknownText(firstValue, field)
  const secondUnknown = isUnknownText(secondValue, field)

  // 未知值不参与方向反转，升降序都固定在末尾。
  if (firstUnknown !== secondUnknown) return firstUnknown ? 1 : -1
  if (firstUnknown) return 0

  const comparison = trackCollator.compare(firstValue.trim(), secondValue.trim())
  return order === 'asc' ? comparison : -comparison
}

function compareTieBreak(first: Track, second: Track): number {
  const titleComparison = trackCollator.compare(first.title.trim(), second.title.trim())
  if (titleComparison !== 0) return titleComparison
  const artistComparison = trackCollator.compare(first.artist.trim(), second.artist.trim())
  if (artistComparison !== 0) return artistComparison
  return first.id - second.id
}

/** 创建歌曲排序副本；主键方向不影响固定升序的稳定决胜规则。 */
export function sortTracks(
  tracks: readonly Track[],
  sortBy: TrackSortBy,
  order: SortOrder,
): Track[] {
  return [...tracks].sort((first, second) => {
    let primaryComparison = 0

    if (sortBy === 'playCount') {
      const firstUnknown = !Number.isFinite(first.playCount)
      const secondUnknown = !Number.isFinite(second.playCount)
      if (firstUnknown !== secondUnknown) return firstUnknown ? 1 : -1
      if (!firstUnknown) {
        primaryComparison = first.playCount - second.playCount
        if (order === 'desc') primaryComparison *= -1
      }
    } else {
      primaryComparison = compareText(first[sortBy], second[sortBy], sortBy, order)
    }

    if (primaryComparison !== 0) return primaryComparison
    return compareTieBreak(first, second)
  })
}
