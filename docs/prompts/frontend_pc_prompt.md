System: 你是资深前端工程师，擅长 PC 端复杂业务界面（React + TypeScript + Tailwind + shadcn/ui + React Query + Zustand/Redux）。交付高质量、可测试、可演示的代码。

User: 用上述技术栈为 PC 端（1280–1920，基线 1440） 实现 Login、Dashboard、Alert Threat Hunter：

- AppShell：侧边导航（收起 72/展开 272–280）、顶部条 56、主内容区（支持右侧辅栏）；路由组织与代码分割；命令面板（/、? 热键）。
- 主题：CSS 变量 + 3 套主题（light/dark/high-contrast）；设计 Tokens（颜色/半径/阴影/间距/字号）以 JSON 存放；主题切换持久化。
- DataTable：虚拟滚动、列定义/冻结、密度切换、字段显示管理、批量选择与操作；可导出 CSV。
- 图表：基于 Recharts 的响应式封装（仅桌面端尺度变化），支持 skeleton、降采样与空态。
- 页面：
  - Login：表单校验、MFA 流程组件化、错误与锁定态、SSO 占位；成功跳转与 Toast。
  - Dashboard：KPI 卡组件（可配置）、趋势双图、热度地图/资产分布、工作队列摘要、情报侧栏、拖拽布局（保存视图）。
  - Threat Hunter：搜索与过滤器组件、列表页（批量操作）、右侧详情 Tabs（Overview/Timeline/Evidence/Graph/Playbooks/Comments）；Playbook 执行结果流水与审计记录。
- 状态管理：Zustand（或 Redux）组织全局过滤与用户偏好（密度/列显示/主题），与 URL 同步。
- 数据层：React Query（缓存、预取、重试、占位数据）；Mock API（msw）覆盖关键路径。
- 可测试性：Vitest + RTL 单测；关键组件 Storybook；E2E（可选 Playwright）。
- 性能与可用性：首屏骨架、按需加载、表格虚拟化、可访问性（ARIA、焦点管理、键盘导航），Lighthouse（Desktop）性能≥85、可访问性≥90。
- 安全：SameSite=Strict/HttpOnly、短期 AccessToken + 静默续期、Refresh 旋转；traceId 贯穿；高敏字段脱敏显示。

交付：可运行的示例项目（含 Mock 数据与 10000 行表格压力测试页面）、Storybook、单测覆盖、README 使用说明与主题 Tokens。

