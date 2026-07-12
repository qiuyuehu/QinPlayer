import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { IconUser } from '../components/Icons'
import { usePlayerStore } from '../stores/playerStore'
import { useUIStore } from '../stores/uiStore'
import { buildListeningSummary, formatListeningDuration } from '../utils/listeningStats'
import { listeningTracker } from '../utils/listeningTracker'
import type { ListeningDay, ListeningRankingEntry } from '../types/ipc'

interface DashboardData {
  days: ListeningDay[]
  ranking: ListeningRankingEntry[]
}

function formatRecordDate(date: string | null): string {
  return date ? date.replaceAll('-', '.') : '尚无记录'
}

function formatTrendLabel(date: string): string {
  const [year, month, day] = date.split('-').map(Number)
  return new Intl.DateTimeFormat('zh-CN', { weekday: 'short' })
    .format(new Date(year, month - 1, day))
    .replace('周', '')
}

function MyProfile() {
  const playbackEnabled = useUIStore((state) => state.featureFlags.playback)
  const setPlaylist = usePlayerStore((state) => state.setPlaylist)
  const playTrack = usePlayerStore((state) => state.playTrack)
  const [dashboard, setDashboard] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const mountedRef = useRef(false)
  const generationRef = useRef(0)
  const hasDataRef = useRef(false)

  const refreshDashboard = useCallback(async () => {
    const generation = ++generationRef.current
    if (!hasDataRef.current) setLoading(true)
    setError(false)

    try {
      await listeningTracker.flush()
      const [days, ranking] = await Promise.all([
        window.electronAPI.invoke('listening:getDays'),
        window.electronAPI.invoke('listening:getRanking', { limit: 10 }),
      ])
      if (!mountedRef.current || generation !== generationRef.current) return
      hasDataRef.current = true
      setDashboard({ days, ranking })
      setLoading(false)
    } catch (loadError) {
      console.error('[MyProfile] 加载听歌统计失败:', loadError)
      if (!mountedRef.current || generation !== generationRef.current) return
      setError(true)
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true
    void refreshDashboard()
    const refreshTimer = setInterval(() => {
      void refreshDashboard()
    }, 30_000)

    return () => {
      mountedRef.current = false
      generationRef.current++
      clearInterval(refreshTimer)
    }
  }, [refreshDashboard])

  const summary = useMemo(
    () => buildListeningSummary(dashboard?.days ?? []),
    [dashboard?.days],
  )

  const handlePlay = useCallback((entry: ListeningRankingEntry) => {
    if (!playbackEnabled || !dashboard) return
    setPlaylist(dashboard.ranking.map((item) => item.track))
    playTrack(entry.track)
  }, [dashboard, playbackEnabled, playTrack, setPlaylist])

  if (loading && !dashboard) {
    return (
      <section className="profile-page profile-page--status" aria-label="我的听歌统计">
        <p>正在加载听歌统计...</p>
      </section>
    )
  }

  if (error && !dashboard) {
    return (
      <section className="profile-page profile-page--status" aria-label="我的听歌统计">
        <p>听歌统计加载失败</p>
        <button type="button" className="profile-page__retry" onClick={() => void refreshDashboard()}>
          重试
        </button>
      </section>
    )
  }

  const ranking = dashboard?.ranking ?? []
  const cards = [
    { label: '累计听歌', value: summary.totalSeconds },
    { label: '本月听歌', value: summary.monthSeconds },
    { label: '本周听歌', value: summary.weekSeconds },
    { label: '今日听歌', value: summary.todaySeconds },
  ]
  const ringAngle = `${summary.activeRatio * 360}deg`

  return (
    <section className="profile-page" aria-label="我的听歌统计">
      <h1 className="profile-page__title">我的</h1>

      <div className="profile-hero">
        <div className="profile-identity">
          <div className="profile-identity__avatar" aria-hidden="true">
            <IconUser width={30} height={30} />
          </div>
          <div className="profile-identity__copy">
            <strong className="profile-identity__name">秋月</strong>
            <span className="profile-identity__subtitle">QinPlayer 本地听歌档案</span>
            <span className="profile-identity__date">
              {summary.firstDate ? `自 ${formatRecordDate(summary.firstDate)} 开始记录` : '尚无记录'}
            </span>
          </div>
        </div>

        <div className="profile-activity">
          <span className="profile-activity__title">本周活跃</span>
          <div
            className="profile-activity__ring"
            style={{ '--profile-ring-angle': ringAngle } as React.CSSProperties}
            aria-label={`本周活跃 ${summary.activeDaysThisWeek}/7`}
          >
            <div className="profile-activity__inner">
              <strong>{summary.activeDaysThisWeek}/7</strong>
              <span>活跃天数</span>
            </div>
          </div>
        </div>

        <div className="profile-highlights" aria-label="本周摘要">
          <div className="profile-highlight">
            <strong>{formatListeningDuration(summary.todaySeconds)}</strong>
            <span>今天</span>
          </div>
          <div className="profile-highlight">
            <strong>{formatListeningDuration(summary.weekSeconds)}</strong>
            <span>本周</span>
          </div>
          <div className="profile-highlight">
            <strong>连续 {summary.streakDays} 天</strong>
            <span>听歌记录</span>
          </div>
        </div>

        <div className="profile-trend" aria-label="近 7 天听歌趋势">
          <span className="profile-trend__title">近 7 天</span>
          <div className="profile-trend__bars">
            {summary.lastSevenDays.map((day) => (
              <div className="profile-trend__column" key={day.date}>
                <div
                  className="profile-trend__bar"
                  style={{ height: `${Math.max(4, day.ratio * 72)}px` }}
                  aria-label={`${day.date} ${formatListeningDuration(day.seconds)}`}
                />
                <span>{formatTrendLabel(day.date)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="profile-cards" aria-label="听歌时长统计">
        {cards.map((card) => (
          <article className="profile-card" key={card.label}>
            <span className="profile-card__label">{card.label}</span>
            <strong className="profile-card__value">{formatListeningDuration(card.value)}</strong>
          </article>
        ))}
      </div>

      <section className="profile-ranking" aria-labelledby="profile-ranking-title">
        <div className="profile-ranking__header">
          <div>
            <h2 id="profile-ranking-title">播放排行</h2>
            <p>全部时间 Top 10</p>
          </div>
          {error && <button type="button" className="profile-page__retry" onClick={() => void refreshDashboard()}>刷新失败，重试</button>}
        </div>

        {ranking.length === 0 ? (
          <div className="profile-ranking__empty">暂无播放记录</div>
        ) : (
          <div className="profile-ranking__scroll">
            <table className="profile-ranking__table">
              <tbody>
                {ranking.map((entry, index) => (
                  <tr
                    key={entry.track.id}
                    tabIndex={playbackEnabled ? 0 : undefined}
                    onDoubleClick={() => handlePlay(entry)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') handlePlay(entry)
                    }}
                    title={playbackEnabled ? '双击或按 Enter 播放' : undefined}
                  >
                    <td className="profile-ranking__rank">{index + 1}</td>
                    <td className="profile-ranking__title" title={entry.track.title}>{entry.track.title}</td>
                    <td className="profile-ranking__artist" title={entry.track.artist}>{entry.track.artist}</td>
                    <td className="profile-ranking__count">{entry.playCount} 次</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  )
}

export default MyProfile
