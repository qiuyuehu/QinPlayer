import { getDatabase } from '../db/database'
import {
  getListeningDays,
  getListeningRanking,
  incrementListeningSeconds,
  type ListeningIncrementInput,
} from '../db/listeningRepository'
import type { ListeningDay, ListeningRankingEntry } from '../../src/types/ipc'
import { handleIpc } from './typedIpc'

interface ListeningFeatureFlags {
  profile: boolean
  playback: boolean
}

export interface ListeningIPCRepository {
  increment: (input: ListeningIncrementInput) => void
  getDays: () => ListeningDay[]
  getRanking: (limit: number) => ListeningRankingEntry[]
}

function createListeningIPCRepository(): ListeningIPCRepository {
  return {
    increment: (input) => incrementListeningSeconds(getDatabase(), input),
    getDays: () => getListeningDays(getDatabase()),
    getRanking: (limit) => getListeningRanking(getDatabase(), limit),
  }
}

async function runListeningHandler<T>(context: string, action: () => T): Promise<T> {
  try {
    return action()
  } catch (error) {
    console.error(`[ListeningIPC] ${context}失败:`, error)
    throw error
  }
}

export function registerListeningIPC(
  getFeatureFlags: () => ListeningFeatureFlags,
  repository: ListeningIPCRepository = createListeningIPCRepository(),
): void {
  handleIpc('listening:addSeconds', async (_event, input: ListeningIncrementInput) => {
    return runListeningHandler('保存听歌时长', () => {
      const flags = getFeatureFlags()
      if (!flags.profile) throw new Error('个人统计功能已关闭')
      if (!flags.playback) throw new Error('播放功能已关闭')
      repository.increment(input)
    })
  })

  handleIpc('listening:getDays', async () => {
    return runListeningHandler('读取听歌日统计', () => {
      if (!getFeatureFlags().profile) throw new Error('个人统计功能已关闭')
      return repository.getDays()
    })
  })

  handleIpc('listening:getRanking', async (_event, { limit }: { limit: number }) => {
    return runListeningHandler('读取听歌排行榜', () => {
      if (!getFeatureFlags().profile) throw new Error('个人统计功能已关闭')
      return repository.getRanking(limit)
    })
  })
}
