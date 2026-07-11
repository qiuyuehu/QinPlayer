# 专辑排序触发器文案调整

> 创建：2026-07-11
> 状态：待确认

---

## 约束

- 不新增依赖、不新增 IPC、不改数据库查询
- 不新增 feature flag、不持久化排序偏好
- 不顺手重构专辑数据模型
- 代码加中文注释
- 不要自动 git commit
- 只改方案里明确列出的代码，不要主动优化其他部分

---

## 问题

排序触发器显示"排序：专辑名 升序"，"排序："两个字多余，显得生硬。

## 目标

改成"专辑名 升序"，直接显示当前状态，不需要前缀。

---

## 改动范围

| 文件 | 改动 |
|------|------|
| `src/components/AlbumSortMenu.tsx` | 第179行：删掉"排序：" |
| `tests/AlbumSortMenu.test.tsx` | 更新断言中的文字 |
| `tests/Albums.test.tsx` | 更新断言中的文字（如果有） |
| `docs/plans/PLAN-album-sort.md` | 更新UI契约描述 |

---

## Task 1: 修改触发器文案

**目标：** 删掉"排序："前缀

**文件：** `src/components/AlbumSortMenu.tsx`

**实现：**

第179行：
```tsx
// 当前
排序：{fieldLabel} · {orderLabel}

// 改为
{fieldLabel} · {orderLabel}
```

**完成标准：**
- [ ] `npx tsc --noEmit` 无报错

---

## Task 2: 更新测试断言

**目标：** 同步更新测试中的文字断言

**文件：** `tests/AlbumSortMenu.test.tsx`、`tests/Albums.test.tsx`

**实现：**

搜索所有包含"排序："的断言，改成不带前缀的格式。

**验证：**
```bash
npx vitest run tests/AlbumSortMenu.test.tsx tests/Albums.test.tsx
npm run verify
```

**完成标准：**
- [ ] `npm test` 通过
- [ ] `npm run verify` 通过（Harness 约束 + 生产构建 + 全量测试）

---

## Task 3: 更新方案文档

**目标：** 同步更新 PLAN-album-sort.md 中的UI契约描述

**文件：** `docs/plans/PLAN-album-sort.md`

**实现：**

第131行和第147行的示例文字删掉"排序："前缀。

**完成标准：**
- [ ] 文档和代码一致

---

## 验收标准

1. `npx tsc --noEmit` 无报错
2. `npm test` 全部通过
3. 触发器显示"专辑名 升序"而不是"排序：专辑名 升序"
4. 菜单功能不受影响

## 手动测试

1. `npm run dev` 启动
2. 进入专辑页面 → 触发器显示"专辑名 升序"
3. 点击菜单切换排序 → 触发器文字正确更新
4. 切换到"歌手 降序" → 触发器显示"歌手 降序"
5. 进入专辑详情 → 排序控件隐藏
6. 返回网格 → 排序状态保持
