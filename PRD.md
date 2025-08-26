产品需求文档（PRD）

1. 产品概述

产品定位
一个面向全球企业的 SaaS 平台，提供 AI 驱动的安全运营中心（SOC）功能，帮助企业自动分析安全告警，减少误报，提高响应速度。
用户可通过上传日志、集成 SIEM/EDR 工具、或调用 API 接入数据，系统会自动完成告警调查并生成报告。

目标客户
	•	中小企业（没有完整 SOC 的 IT 团队）
	•	SaaS 公司 & 云原生企业（日志量大，缺乏安全人力）
	•	MSSP（托管安全服务商，需要提升效率）

⸻

2. 功能需求

2.1 用户 & 租户管理
	•	用户注册 / 登录（邮箱 + 密码 / SSO）
	•	多租户架构：每个企业用户的数据完全隔离
	•	角色权限：管理员 / 分析员 / 只读查看者

2.2 告警数据接入
	•	日志上传：CSV / JSON 文件上传
	•	API 集成：
	•	Splunk (REST API)
	•	Microsoft Sentinel (Log Analytics API)
	•	Okta (用户登录日志)
	•	自定义 API (Webhook)
	•	数据存储：
	•	Postgres（元数据）
	•	S3 / MinIO（日志文件）
	•	Milvus / Weaviate（向量化上下文）

2.3 AI 分析引擎
	•	工作流：Plan → Investigate → Report
	•	调用外部情报源：
	•	VirusTotal API（IP/Hash信誉）
	•	AbuseIPDB（IP信誉）
	•	输出内容：
	•	结论（真阳性 / 误报）
	•	关键调查证据
	•	建议行动（如隔离主机、封禁 IP）

2.4 报告与通知
	•	报告生成：中/英文双语
	•	格式：Web 查看 / PDF 导出 / 邮件推送
	•	内容：事件摘要、调查步骤、情报引用、处置建议

2.5 仪表盘
	•	总览：已处理告警数、平均响应时间、误报率
	•	时间线：安全事件趋势
	•	Drill-down：单条告警的详细分析过程

2.6 计费与套餐
	•	Free Tier：500 条告警/月，手动上传
	•	Pro：10,000 条告警/月，支持 API 集成，$99/月
	•	Enterprise：定制化（不限告警数，私有部署）

⸻

3. 用户流程（User Flow）

3.1 注册 & 登录
	1.	用户访问 SaaS 平台，注册账号
	2.	激活邮箱，进入 Dashboard
	3.	初始引导：上传日志 or 连接 Splunk

3.2 告警处理流程
	1.	用户上传 JSON/CSV，或配置 API Key
	2.	系统接收告警 → 存入数据库
	3.	AI 引擎分析：提取关键信息 → 调用外部情报 → 生成报告
	4.	报告存储 & 展示在 Dashboard

3.3 报告查看
	1.	用户进入 Dashboard → 告警列表
	2.	点击某条告警 → 查看 AI 分析结果
	3.	可导出 PDF / 发送邮件

3.4 付费升级
	1.	Free 用户用满 500 条告警后提示升级
	2.	用户进入 Billing → 选择套餐（Pro/Enterprise）
	3.	完成 Stripe/Paddle 支付

⸻

4. API 规格（初版）

4.1 用户认证

POST /auth/register
POST /auth/login
GET  /auth/me

4.2 告警上传

POST /alerts/upload
Content-Type: application/json
Body: { "alerts": [ { "src_ip": "1.2.3.4", "event": "failed login", ... } ] }

4.3 告警分析

POST /alerts/analyze/{alert_id}
Response: {
  "summary": "Suspicious login attempt from malicious IP",
  "verdict": "True Positive",
  "recommendation": "Block IP 1.2.3.4",
  "report_pdf_url": "https://.../report.pdf"
}

4.4 告警查询

GET /alerts?status=analyzed
Response: [ { "id": 123, "summary": "..." }, ... ]

4.5 计费系统

GET /billing/usage
POST /billing/upgrade


⸻

5. 非功能需求
	•	安全性：JWT 认证 + RBAC + 租户隔离
	•	性能：单条告警分析延迟 < 10 秒
	•	可扩展性：支持 1000+ 企业并发使用
	•	合规：日志数据加密存储（AES-256），传输全程 TLS

⸻

6. 未来扩展（V2+）
	•	集成更多 EDR（CrowdStrike、Defender ATP）
	•	自动响应（SOAR 集成：封 IP、隔离主机）
	•	AI 多代理协作（不同 Agent 分别负责情报、溯源、报告）
	•	团队协作功能（多人同时查看 & 标注告警）

2. Agentic AI SOC 产品说明（增强版）

2.1 产品概览

定位：融合大模型智能代理（Agentic AI）与安全编排的下一代 SOC 平台。
核心理念：以具备自主决策与推理能力的 AI 代理（“AI 分析员”）自动完成告警分析研判 → 调查取证 → 响应建议/处置 → 报告复盘的闭环，替代传统高度依赖人工与静态 Playbook 的流程。
旗舰模块：
	•	Prophet AI SOC Analyst：被动告警处理与闭环分析
	•	Prophet AI Threat Hunter：主动威胁狩猎（自然语言查询驱动）
	•	Prophet AI Detection Advisor：检测优化与“降噪”建议

目标：显著提升处理速度与准确性，降低误报、清空积压、缩短 MTTR/MTTI。

⸻

2.2 核心工作流（Plan → Investigate → Respond → Adapt → Report）

(1) 计划 Plan
	•	告警归并去重与初步分流（严重性、类别）
	•	自动提取关键实体（IP、主机、账号、哈希、地理位置等）
	•	生成调查计划（要回答的关键问题清单），相当于资深分析师的思维框架

(2) 调查 Investigate
	•	由 AI 代理自主执行“推理—行动—再推理”循环（ReAct），跨数据源取证：
	•	SIEM（Splunk、Sentinel、Elastic、Sumo）
	•	EDR/XDR（CrowdStrike、Cortex XDR、Defender ATP）
	•	IAM（Okta、Entra ID）
	•	云安全（AWS/Azure/GCP、GuardDuty、Wiz）
	•	威胁情报（VirusTotal、AbuseIPDB 等）
	•	工单/协作（ServiceNow、Jira、Slack/Teams）、甚至代码仓/邮件网关
	•	并行检索与语义关联，快速形成证据链与因果链

(3) 响应 Respond
	•	产出结论（True Positive/False Positive）与严重级别
	•	处置建议：隔离主机、封禁 IP、重置凭据、篡改面迹排查等
	•	重复/关联告警合并（避免“同一威胁多处响铃”导致噪音）
	•	与既有流程无缝衔接：把结论与建议推回 SIEM/SOAR/工单/协作工具，人机协作、可审查

(4) 适应学习 Adapt
	•	持续学习：基于分析员反馈、历史标注、步骤级相关性评价进行自适应调优
	•	单租户隐私优先：每个客户实例独立优化，不混用跨租户数据；不以客户敏感日志训练通用模型
	•	越用越准，降低误报率与调查成本

(5) 报告 Report
	•	统一仪表盘与可视化：告警滞留时间、MTTI、MTTR、误报率、降噪来源
	•	时间轴复盘：AI 的每一步行动/证据/推理透明可追踪（“Show Your Work”）
	•	发现高噪声规则与信号源，指导检测工程优化（阈值/规则/数据质量）

⸻

2.3 Agentic 架构与关键技术
	•	LLM + 自主 Agent 引擎：
	•	LLM 负责语义理解与安全常识推理；Planner 生成调查步骤；Executor 调用外部工具；Memory 记忆环境与反馈
	•	ReAct/CoT：推理与行动交替，逐步求精
	•	向量检索 / RAG：
	•	将跨系统上下文标准化入库，向量化相似检索；历史相似事件召回 + 最新威胁情报增强
	•	编排与动作（轻 SOAR）：
	•	API 适配器库统一调度数据读取与动作下发（可选 HITL 人审）
	•	透明与可审计：
	•	全链路行动与证据可见、审计日志齐全、关键动作支持“人工确认”护栏

⸻

2.4 界面与交互
	•	告警工作台：
	•	列表：状态/严重性/AI 结论/是否自动关闭
	•	详情：调查摘要、证据、时间轴、处置建议、一键回推工单
	•	对话式威胁猎手：
	•	自然语言问题（如“过去 7 天是否有终端连接恶意 IP？”），自动编排查询并返回证据
	•	运营仪表盘：
	•	趋势图、KPI 卡片、Top 噪声规则/源、队列热力图

⸻

2.5 集成生态（首批与优先）
	•	SIEM/日志：Microsoft Sentinel、Splunk、Elastic、Sumo
	•	EDR/XDR：CrowdStrike、Cortex XDR、Defender ATP
	•	身份/IAM：Okta、Entra ID
	•	云/基础设施：AWS/Azure/GCP、GuardDuty、Wiz
	•	邮件安全：Proofpoint、Mimecast、Microsoft 365
	•	协作/运维：Slack、Teams、PagerDuty、ServiceNow、Jira
	•	威胁情报：VirusTotal、AbuseIPDB、OTX（可扩展）

授权方式：OAuth / API Key。目标接入时长：≤ 60 分钟 完成核心数据源对接。

⸻

2.6 部署模式与合规
	•	SaaS（多租户/或隔离实例）：极速上线、弹性扩展（按告警流量自动伸缩）
	•	企业版（On-Prem / 私有云）：数据不出域；GPU/推理节点可本地化
	•	隐私与审计：不将客户日志用于通用模型训练；全量审计日志；SOC 2 Type 2（SaaS）
	•	HITL 与 Guardrails：关键阻断动作可要求人工确认；策略可按租户级定制

⸻

2.7 典型应用场景
	1.	大型企业/金融 SOC：清空积压、减少 L1 重复劳动、让 T2/T3 聚焦高价值案件
	2.	中型/初创团队：无 7×24 SOC 的情况下获得“类大厂能力”，自动降噪与聚焦
	3.	工具孤岛整合：作为“黏合剂与大脑”，把 SIEM/EDR/云/IAM/工单贯通
	4.	MSSP：多租户并行处理与一致性提升，相当于“无限扩展的 L1 团队”

⸻

2.8 关键指标（纳入产品度量与报表）
	•	效率：平均调查时长（MTTI）、平均响应时长（MTTR）、队列积压量
	•	质量：误报降低率、AI 与人工结论一致率、复核通过率
	•	覆盖：已接入数据源数量、调查覆盖面（跨系统命中率）
	•	运营：自动关闭占比、需人工确认占比、建议被采纳率

目标（MVP 指标建议）：
	•	调查耗时较人工缩短 ≥ 80%
	•	误报降低 ≥ 90%（以样本集或早期 PoC 统计）
	•	自动关闭可控在低/中风险类，关键动作需 HITL

⸻

2.9 对现有 PRD 的接口/需求映射（落地到工程）

A. 新增/细化后端能力
	•	Investigations API
	•	POST /investigations/{alert_id}/plan 生成计划（Plan Steps）
	•	POST /investigations/{alert_id}/execute 执行单步/批量步骤（含外部连接器调用）
	•	GET /investigations/{alert_id}/timeline 返回时间轴（行动、证据、推理片段引用）
	•	POST /investigations/{alert_id}/feedback 写入反馈（结论认可/修正、步骤相关性评分）
	•	Connectors API
	•	POST /connectors/{type} 创建/验证连接（OAuth/API Key）
	•	GET /connectors / DELETE /connectors/{id} 管理连接器
	•	Actions API（可选 HITL）
	•	POST /actions/quarantine、POST /actions/block_ip 等（带 requires_human_approval 标记）
	•	POST /actions/approve/{action_id} 人工放行
	•	Reporting API
	•	GET /reports/metrics?kpi=mttr,tti,false_positive_rate
	•	GET /reports/noise-sources 高噪声规则与来源
	•	POST /reports/export 生成 PDF（中/英）

与现有的 /alerts/upload、/alerts/analyze/{id} 对齐：analyze 内部调用 Plan→Investigate→Respond→Report，时间轴与证据通过 timeline 暴露给前端。

B. 数据模型补充（示例字段）
	•	Alert：id, tenant_id, severity, dedup_key, entities{ip,host,user,hash}, sources, created_at, status
	•	PlanStep：id, alert_id, intent, tool, input, expected_signal, status, result_ref
	•	TimelineEvent：id, alert_id, ts, actor{AI/Human}, action, tool, output_ref, reasoning_snippet
	•	Recommendation：id, alert_id, type, confidence, requires_human_approval
	•	Feedback：id, alert_id, scope{alert/step/recommendation}, label, note, rater

C. 前端 UX 关键界面
	•	工作台列表：状态筛选、合并事件呈现、自动关闭标识
	•	告警详情：
	•	顶部卡片：结论/严重性/建议/置信度
	•	时间轴：步骤、外部调用、证据片段、推理摘要
	•	反馈区：一键“认可/修正”、步骤相关性评分
	•	动作区：一键下发动作（带 HITL 审批流）
	•	猎手对话：问题历史、证据卡片、可一键转为调查

⸻

2.10 SaaS / 企业版差异化要求
	•	SaaS：多租户隔离、速配连接器模板、区域化部署（低延迟）
	•	企业版：离线推理节点、日志本地驻留、合规模块（审计导出、事件上报模板）