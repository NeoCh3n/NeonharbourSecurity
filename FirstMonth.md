🗂️ MVP 开发 Backlog（第 1 月）

📌 前端 (Frontend)
	1.	用户认证界面
	•	登录 / 注册页面（邮箱 + 密码）
	•	Session 管理（JWT）
✅ 验收：用户可注册账号并登录系统
	2.	告警工作台 – 列表视图
	•	表格字段：ID / 时间 / 来源 / 状态 / 严重级别
	•	筛选：按状态、严重级别过滤
✅ 验收：能看到上传或来自 Splunk 的告警
	3.	告警详情页
	•	显示 AI 总结（结论 + 严重性）
	•	显示时间轴（步骤/时间/动作/证据）
	•	显示证据详情（日志片段 / IP 情报）
	•	操作按钮：[确认威胁] [误报] [导出 PDF]
✅ 验收：用户点开告警可完整查看调查摘要与证据
	4.	Threat Hunter 对话界面
	•	输入框 + 提交按钮
	•	AI 回复（自然语言）
	•	附加证据卡片（日志、情报）
✅ 验收：用户提问“是否有恶意 IP 连接？”→ 得到答案
	5.	仪表盘
	•	图表：本月处理告警数量（柱状图）、严重级别分布（饼图）、平均调查耗时（数值卡片）
✅ 验收：页面展示实时更新的 3 项指标

⸻

📌 后端 (Backend)
	1.	认证 API
	•	POST /auth/register
	•	POST /auth/login
	•	GET /auth/me
✅ 验收：用户可注册登录，返回 JWT
	2.	告警管理 API
	•	POST /alerts/upload 上传 JSON/CSV 告警
	•	GET /alerts 列表
	•	GET /alerts/{id} 详情（AI 总结、时间轴、证据）
	•	POST /alerts/{id}/feedback 用户标注结果
✅ 验收：能成功上传并调用 AI 分析
	3.	Threat Hunter API
	•	POST /hunter/query
	•	输入：自然语言问题
	•	输出：AI 回答 + 证据数据
✅ 验收：调用接口能返回回答
	4.	仪表盘 API
	•	GET /metrics 返回 KPI（数量、分布、耗时）
✅ 验收：前端图表可正确展示

⸻

📌 AI 模块 (AI Engine)
	1.	告警分析 Prompt
	•	输入：告警 JSON
	•	输出：一句话总结 + 严重级别
✅ 验收：返回非空总结
	2.	调查时间轴生成
	•	输出：分步骤时间轴 + 证据引用
✅ 验收：详情页可展示至少 2-3 条步骤
	3.	Threat Hunter Prompt
	•	输入：自然语言问题 + 历史日志
	•	输出：自然语言回答 + 证据引用
✅ 验收：能返回回答，至少含 1 条证据
	4.	外部情报集成
	•	VirusTotal API（IP/Hash 查询）
✅ 验收：结果能在时间轴 / 证据详情展示

⸻

📌 测试 & 部署
	1.	单元测试
	•	后端 API 测试
	•	AI 输出检查（非空）
	2.	端到端测试
	•	上传 CSV → 触发 AI → 查看详情 → 导出报告
	3.	部署
	•	Docker Compose：后端 + 前端 + Postgres
✅ 验收：docker-compose up 可启动平台

⸻

✅ 第 1 月 交付物
	•	可运行的 MVP 系统：
	•	登录 → 上传告警 → 查看 AI 总结 / 时间轴 / 证据
	•	Threat Hunter 问答界面可用
	•	仪表盘显示指标
	•	提供 Docker Compose 文件 & 安装文档