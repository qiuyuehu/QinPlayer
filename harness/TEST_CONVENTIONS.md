# QinPlayer 测试规范

> 创建：2026-07-01

---

## 一、命名规范

### 文件命名
- 测试文件：`<模块名>.test.ts` 或 `<模块名>.test.tsx`
- 放在 `tests/` 目录下
- 示例：`tests/lrcParser.test.ts`、`tests/colorExtract.test.ts`

### 用例命名
- 动词开头：`应该解析同时间戳双行歌词`、`过滤过亮的颜色`
- 中文描述，清晰表达预期行为

---

## 二、结构规范

```typescript
// 模块说明
describe('LRC 歌词解析器', () => {
  // 正常路径
  it('应该解析标准 LRC 格式', () => {
    // ...
  })

  // 边界情况
  it('应该处理空文件', () => {
    // ...
  })

  // 错误处理
  it('应该处理格式错误的时间戳', () => {
    // ...
  })
})
```

---

## 三、覆盖要求

### 必须测试
- 每个工具函数（`src/utils/` 下的所有模块）
- IPC 类型映射的完整性
- IPC tuple/result 必须用专用 TypeScript 配置验证合法调用和 `@ts-expect-error` 反例，不能只依赖运行时 Vitest transpile
- IPC Harness fixture 必须覆盖裸注册/发送、合同与注册漂移、重复/错方向/动态 channel、preload allowlist 漏项/多项和 event 无 sender
- thrown 与结构化 IPC 失败都必须注入含路径/堆栈标记的异常，证明 Renderer 只收到固定安全错误
- Zustand Store 的状态变更逻辑
- LRC 解析器的各种格式兼容
- 颜色提取的亮度过滤逻辑
- 时间格式化函数
- scanner 遍历/解析编排必须通过纯 core 和注入 adapter 覆盖访问失败、deletion-only、计数与消息顺序
- 删除对账必须覆盖 Windows path containment、unavailable scope、root 外路径和事务故障注入
- Worker 终止门必须覆盖 snapshot/done/exit 顺序、fatal/error、畸形消息、重复结算和跨 Worker 隔离
- 数据库生命周期必须覆盖每个初始化失败点、半初始化 singleton 不可见、失败后重试和幂等关闭
- 数据库候选验证必须覆盖核心表/列、关键 unique/cascade FK、quick check、foreign key check、可缺失及不兼容的 `listening_stats`
- 数据库导入必须覆盖 stage/marker/checkpoint/rename/init/quarantine/rollback/reopen/cleanup 的逐点故障，并证明失败时旧数据或完整恢复证据仍在
- 启动恢复必须覆盖四种 marker、prepared 前 orphan stage、rename 成功但下一 marker 未写入、committed 与 rollback 后清理各中断点、正常写入后 identity 稳定、合法文件替换冲突、残留事务重试门、多事务和损坏/矛盾 artifacts
- 本地资源 repository 必须覆盖参数绑定、正安全整数 ID、普通文件/扩展名、注册 root、path-aware containment 与 realpath 逃逸
- 自定义协议必须覆盖 host/method/query 拒绝、GET/HEAD、完整响应、三种单段 Range、所有越界/畸形 416 以及拒绝请求不创建文件流
- 异步 latest-wins、取消和竞态修复必须用可控 deferred Promise 覆盖乱序完成；测试要同时证明旧结果不能提交、旧请求只清理自己拥有的资源、clear/unmount 后迟到结果无效
- Error Boundary 测试只能在对应测试内部拦截 React/jsdom 的预期 render error 输出，并在测试后恢复；禁止在全局 setup 屏蔽 `console.error` 或 window error
- React act warning 和测试框架配置 warning 视为门禁失败；不得通过过滤 stderr、全局静音 `console.error` 或移除 StrictMode 消除输出
- `tests/setup.ts` 的 act guard 只匹配 `not wrapped in act` / `wrap-tests-with-act`，其余错误必须调用原始 `console.error`；升级 React 后应临时制造一个未包裹的异步 state update，确认用例失败后再删除 probe，若官方文案变化则同步更新这两个窄 matcher
- Electron main 的 UI 壳层优先抽取纯 controller/adapter，测试必须同时断言模板、callback 路由、Feature Flag 和 create/destroy 生命周期，不能只断言菜单文本
- Vitest 因 native ABI 无法加载 `better-sqlite3` 时可使用注入 adapter，但必须另报 Electron 隔离 smoke 状态，不得把 mock 宣称为真实 SQLite 集成

### 可以不测试
- React 组件的渲染细节（留给主人手动验证 UI）
- Electron 主进程的窗口创建（需要真实 Electron 环境）
- 真实 Worker 线程、磁盘权限和 Electron 生命周期联动（纯扫描 core 与终止状态机仍必须自动测试）

---

## 四、运行方式

```bash
# 标准入口：先运行 Harness 约束检查，再运行全部测试
npm test

# 完整验证：约束检查 + 生产构建 + 全量测试
npm run verify

# 定向调试（会绕过 pretest，最终验收前仍需运行 npm test）
npx vitest run tests/lrcParser.test.ts

# IPC 编译期合同（包括 @ts-expect-error 反例）
npx tsc -p tsconfig.ipc-contract.json --noEmit

# 监听模式（会绕过 pretest）
npm run test:watch
```

---

## 五、验收标准

- 全量测试通过（0 失败）
- 新增测试覆盖所有改动
- 不破坏现有测试
- 测试运行时间 < 30 秒

---

*测试是代码质量的最后一道防线。*
