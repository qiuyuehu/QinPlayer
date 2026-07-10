# Devlog — 2026-07-10 切歌歌词滚动归零

## 问题/目标
- 播放到中间切歌时，歌词会先跳到上一首歌的滚动位置，再回弹到第一句

## 排查过程
- 扫描 LyricsPanel.tsx、Lyrics.tsx、playerStore.ts 定位歌词滚动机制
- 发现 React 复用 DOM 节点导致 scrollTop 残留
- 发现歌词状态未与曲目身份绑定，新面板可拿到旧曲目歌词

## 错误假设
- 第一版方案假设 useEffect 在 lyrics=[] 时能重置 scrollTop，但此时 containerRef.current 是 null
- 第二版方案假设仅加 key 就够，但 useEffect 在绘制后才执行，新面板首次渲染拿到旧 props

## 最终根因/最终方案
- 根因：React 复用 DOM 节点 + 歌词状态未与 trackId 绑定
- 方案三层防线：
  1. 状态绑定：lyricsData 改为 { trackId, lines }，面板只在 trackId 匹配时拿歌词
  2. key 重建：key={currentTrack?.id}，切歌时 DOM 卸载重建，scrollTop 天然归零
  3. request token：lrcRequestRef 递增序号，A→B→A 竞态保护

## 修改内容
- `src/pages/Lyrics.tsx`：歌词状态绑定 trackId、request token、LyricsPanel 加 key
- `tests/LyricsPanel.test.tsx`：新增 4 个切歌回归测试
- `tests/setup.ts`：补充 setAlwaysOnTop 和 RAF mock

## 验证结果
- npx tsc --noEmit：通过
- npm test：14 个文件、162 个测试全绿
- npm run build：生产构建通过

## 新增测试或约束
- 切歌时旧歌词立即消失
- 切歌时 DOM 节点替换且 scrollTop 归零
- 快速 A→B→A 切歌只保留最后一次歌词
- 无 LRC 文件切歌不崩溃

## 下次接手注意
- 歌词状态结构从 LyricLine[] 改为 { trackId: number | null, lines: LyricLine[] }
- Promise 回调中必须检查 requestId !== lrcRequestRef.current
- 封面取色也用同一 request token 失效保护
