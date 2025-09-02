System: 你是企业安全产品的资深 UX/UI 设计师，长期服务 SOC 团队与威胁猎手工作台，擅长高信息密度、桌面端复杂界面设计。严格输出设计规范与可交付物。

User: 为企业安全平台生成 Login、Dashboard、Alert Threat Hunter 三个页面的 PC 端高保真设计，遵循以下硬性要求：

- 桌面端范围：只考虑 1280–1920px 屏宽；基线 1440（内容最大宽 1280）。>1920 时保持居中留白或密度提升模式；<1280 允许横向滚动与紧凑模式。
- 主题：light / dark / high-contrast 三主题（可切换）；统一设计 Tokens（颜色/阴影/圆角/间距/字号）。
- 视觉：极简、专业；8px 基线；卡片圆角 16px；柔和阴影；信息分组明确；空/错/加载态完整。
- 排版：Inter/Source Han Sans；标题 600、正文 400、行高 1.5；字号阶梯 12/14/16/20/24/32；对比度达 WCAG AA。
- 布局：左侧垂直导航（收起 72 / 展开 272–280）、顶部工具条 56；最多三栏（导航/主内容/右侧辅栏）。
- 交互：悬停/焦点态明显；动效≤200ms；关键操作二次确认；提供键盘快捷键清单（/ 搜索、? 命令面板、j/k 行导航、o 打开详情、a 批量指派）。
- 组件：Button、Input、Select、Tabs、Badge、Popover、Tooltip、Toast、Modal、Drawer、DataTable（列冻结/密度切换/字段管理/虚拟滚动/批量选择）、Card、EmptyState、Skeleton、Command Palette、图表（Bar/Line/Area/Donut、Sparkline、Heatmap）。
- 导出：Assets 与标注完整；提供 Tokens（JSON）、栅格/间距、状态说明（默认/悬停/按下/禁用/加载）。

页面要求：
1) Login（PC）：左右分屏（40% 品牌 + 60% 表单）；用户名/密码（显示密码、CapsLock 检测、粘贴检测）；MFA（TOTP/SMS/硬件 Key）；错误分层（字段/锁定/MFA 必要）；上次登录时间与位置；SSO 与隐私/条款；traceId；成功后跳转 Dashboard 并显示登录统计 Toast。
2) Dashboard（PC）：顶部全局过滤（时间/业务线/环境/租户 + 保存视图）；KPI 卡 6–8 张（两行）；趋势图双图（近 7/30 天 & 攻击类型，支持框选联动过滤）；热度地图/资产分布（地理/资产/用户 Tab）；工作队列摘要（我负责/团队待办）；右侧情报侧栏可折叠；卡片可拖拽排序、导出 PNG/CSV；KPI 可钻取到 Threat Hunter。
3) Alert Threat Hunter（PC）：顶部搜索 + Saved Queries + 时间范围 + 过滤维度（Severity、Status、Source、Asset、Tactic/Technique、Playbook Tag）；
   - 左侧列表 DataTable：列含 Severity 色条、Alert ID、Title、Source、Asset/User、Tactic/Technique、First/Last Seen、Status、Owner、Confidence、Risk Score；支持批量（指派/改状态/打标签/触发剧本/合并/导出）。
   - 右侧详情 Tabs：Overview（TL;DR、风险评分、上下文与相似告警）/ Timeline（生命周期）/ Evidence（日志片段、PCAP 摘要、IOC/哈希、截图）/ Graph（实体关系与 MITRE 映射）/ Playbooks（执行按钮+结果输出+审计记录）/ Comments & Tasks（@提及、分配、Jira/ServiceNow 联动）。
   - 高级：NL→Query 辅助、去重与聚类（可回滚与规则可见）、优先级建议（风险×业务影响）、视图快照分享。

可访问性与性能：键盘全覆盖；ARIA 标签；表格可达性；首屏骨架屏；图表降采样；虚拟滚动；TTFB <200ms 指标目标。

输出内容（交付格式）：
- 三主题的组件与页面版式（桌面端 1280/1440/1920 三档标注）
- 状态图与动效规格（≤200ms，缓动曲线建议）
- Tokens（颜色/排版/间距/阴影/半径，JSON 与标注）
- 空/错/加载态定义
- 可访问性说明与对比度校验截图
- 资源切片与导出清单（命名规范、1x/2x、SVG 优先）

