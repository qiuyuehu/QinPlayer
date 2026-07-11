// =============================================================================
// QinPlayer — 专辑网格排序
// =============================================================================
// 职责：按专辑名或代表歌手生成本地化、稳定且不修改输入的派生列表
// =============================================================================

import type { Album, SortOrder } from '../types'

export type AlbumSortBy = 'name' | 'artist'

const albumCollator = new Intl.Collator(
  ['zh-CN-u-co-pinyin', 'zh-CN'],
  {
    usage: 'sort',
    sensitivity: 'base',
    numeric: true,
    ignorePunctuation: true,
  },
)

const UNKNOWN_VALUES: Record<AlbumSortBy, string> = {
  name: '未知专辑',
  artist: '未知歌手',
}

function compareAlbumField(
  first: Album,
  second: Album,
  field: AlbumSortBy,
  order: SortOrder,
): number {
  const firstValue = first[field].trim()
  const secondValue = second[field].trim()
  const unknownValue = UNKNOWN_VALUES[field]
  const firstUnknown = firstValue.length === 0 || firstValue === unknownValue
  const secondUnknown = secondValue.length === 0 || secondValue === unknownValue

  // 未知项不参与方向反转，升序和降序都固定在当前字段末尾。
  if (firstUnknown !== secondUnknown) return firstUnknown ? 1 : -1
  if (firstUnknown) return 0

  const comparison = albumCollator.compare(firstValue, secondValue)
  return order === 'asc' ? comparison : -comparison
}

/**
 * 创建专辑网格的排序副本，不修改专辑对象及其歌曲数组。
 */
export function sortAlbums(
  albums: readonly Album[],
  sortBy: AlbumSortBy,
  sortOrder: SortOrder,
): Album[] {
  const secondaryField: AlbumSortBy = sortBy === 'name' ? 'artist' : 'name'

  return [...albums].sort((first, second) => {
    const primaryComparison = compareAlbumField(first, second, sortBy, sortOrder)
    if (primaryComparison !== 0) return primaryComparison
    return compareAlbumField(first, second, secondaryField, sortOrder)
  })
}
