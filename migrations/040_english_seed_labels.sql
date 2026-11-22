-- Optional: English labels for the public starter catalog (fork i18n override).
-- Translates only user-visible seed names, descriptions, step/role/gate names of
-- the rows created by migrations/seed/*.sql. LLM prompts and rule content stay
-- unchanged. Each value is replaced only while it still equals the original
-- Chinese text, so operator edits are preserved and the script is re-runnable.
-- Run it manually after the earlier numbered migrations. Later upstream data
-- migrations that match these Chinese labels will skip translated rows.
SET NAMES utf8mb4;
START TRANSACTION;

UPDATE sandboxes
SET name = CASE name WHEN '本地执行（仅可信任务）' THEN 'Local execution (trusted tasks only)' WHEN 'Docker 隔离沙箱' THEN 'Docker sandbox' ELSE name END,
  payload = CAST(REPLACE(REPLACE(CAST(payload AS CHAR),
    '"name": "本地执行（仅可信任务）"', '"name": "Local execution (trusted tasks only)"'),
    '"name": "Docker 隔离沙箱"', '"name": "Docker sandbox"') AS JSON)
WHERE id IN ('local', 'generic-docker')
  AND (name IN ('本地执行（仅可信任务）', 'Docker 隔离沙箱')
    OR CAST(payload AS CHAR) REGEXP '"(name|description)": "[^"]*\\p{Han}');

UPDATE dockerfiles
SET name = CASE name WHEN '公共开发环境' THEN 'Shared development environment' ELSE name END,
  payload = CAST(REPLACE(CAST(payload AS CHAR),
    '"name": "公共开发环境"', '"name": "Shared development environment"') AS JSON),
  updated_at = UTC_TIMESTAMP()
WHERE id IN ('generic-backend')
  AND (name IN ('公共开发环境')
    OR CAST(payload AS CHAR) REGEXP '"(name|description)": "[^"]*\\p{Han}');

UPDATE rules
SET name = CASE name WHEN '工程与验证约束' THEN 'Engineering & verification rules' ELSE name END,
  payload = CAST(REPLACE(CAST(payload AS CHAR),
    '"name": "工程与验证约束"', '"name": "Engineering & verification rules"') AS JSON),
  updated_at = UTC_TIMESTAMP()
WHERE id IN ('public-engineering')
  AND (name IN ('工程与验证约束')
    OR CAST(payload AS CHAR) REGEXP '"(name|description)": "[^"]*\\p{Han}');

UPDATE agents
SET name = CASE name WHEN '基线对齐执行员' THEN 'Baseline Alignment Resolver' ELSE name END,
  payload = CAST(REPLACE(CAST(payload AS CHAR),
    '"name": "基线对齐执行员"', '"name": "Baseline Alignment Resolver"') AS JSON),
  updated_at = UTC_TIMESTAMP()
WHERE id IN ('baseline-align-resolver')
  AND (name IN ('基线对齐执行员')
    OR CAST(payload AS CHAR) REGEXP '"(name|description)": "[^"]*\\p{Han}');

UPDATE generic_templates
SET name = CASE name WHEN '通用后端交付 SOP' THEN 'Generic Backend Delivery SOP' WHEN '通用前端交付 SOP' THEN 'Generic Frontend Delivery SOP' WHEN '通用缺陷修复 SOP' THEN 'Generic Bugfix SOP' WHEN '通用产品方案 SOP' THEN 'Generic Product Spec SOP' ELSE name END,
  payload = CAST(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(CAST(payload AS CHAR),
    '"name": "通用后端交付 SOP"', '"name": "Generic Backend Delivery SOP"'),
    '"description": "后端需求从需求定型到独立评审与交付。"', '"description": "Backend requirements from clarification through independent review and delivery."'),
    '"name": "通用前端交付 SOP"', '"name": "Generic Frontend Delivery SOP"'),
    '"description": "前端需求从页面设计到交互与回归验证。"', '"description": "Frontend requirements from page design through interaction and regression testing."'),
    '"name": "通用缺陷修复 SOP"', '"name": "Generic Bugfix SOP"'),
    '"description": "先复现，再修复，独立评审并回归。"', '"description": "Reproduce first, then fix, with independent review and regression testing."'),
    '"name": "通用产品方案 SOP"', '"name": "Generic Product Spec SOP"'),
    '"description": "完成需求分析、产品方案文档与独立验收；无需代码仓库或 Git Token。"', '"description": "Requirement analysis, product spec, and independent acceptance; no code repository or Git token required."'),
    '"name": "工程与验证约束"', '"name": "Engineering & verification rules"'),
    '"name": "产品文档与验收约束"', '"name": "Product documentation & acceptance rules"'),
    '"name": "需求定型"', '"name": "Requirement Clarification"'),
    '"name": "方案设计"', '"name": "Solution Design"'),
    '"name": "开发实现"', '"name": "Implementation"'),
    '"name": "独立评审"', '"name": "Independent Review"'),
    '"name": "测试验证"', '"name": "Testing & Verification"'),
    '"name": "人工验收"', '"name": "Manual Acceptance"'),
    '"name": "交付汇总"', '"name": "Delivery Summary"'),
    '"name": "发起 MR"', '"name": "Open MR"'),
    '"name": "改动已提交并推送"', '"name": "Changes committed and pushed"'),
    '"name": "MR 已创建"', '"name": "MR created"') AS JSON),
  updated_at = UTC_TIMESTAMP()
WHERE id IN ('generic-backend-delivery', 'generic-frontend-delivery', 'issue-fix-production', 'generic-product-delivery')
  AND (name IN ('通用后端交付 SOP', '通用前端交付 SOP', '通用缺陷修复 SOP', '通用产品方案 SOP')
    OR CAST(payload AS CHAR) REGEXP '"(name|description)": "[^"]*\\p{Han}');

UPDATE workflows
SET name = CASE name WHEN '平台验收 · 脚本与审批' THEN 'Platform Acceptance · Script & Approval' ELSE name END,
  payload = CAST(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(CAST(payload AS CHAR),
    '"name": "平台验收 · 脚本与审批"', '"name": "Platform Acceptance · Script & Approval"'),
    '"description": "无需模型密钥。真实运行脚本、查看产物，在人工审批后继续执行。"', '"description": "No model key needed. Runs real scripts, shows artifacts, and continues after human approval."'),
    '"name": "生成验收报告"', '"name": "Generate Acceptance Report"'),
    '"name": "请确认验收报告"', '"name": "Confirm Acceptance Report"'),
    '"name": "完成验收"', '"name": "Complete Acceptance"') AS JSON),
  updated_at = UTC_TIMESTAMP()
WHERE id IN ('welcome-workflow')
  AND (name IN ('平台验收 · 脚本与审批')
    OR CAST(payload AS CHAR) REGEXP '"(name|description)": "[^"]*\\p{Han}');

UPDATE projects
SET name = CASE name WHEN 'LoopForge 体验项目' THEN 'LoopForge Demo Project' ELSE name END,
  payload = CAST(REPLACE(REPLACE(CAST(payload AS CHAR),
    '"name": "LoopForge 体验项目"', '"name": "LoopForge Demo Project"'),
    '"description": "从创建需求、选择 SOP 到查看运行与审批，体验完整交付流程。"', '"description": "Walk through the full delivery flow: create a requirement, pick an SOP, then follow the run and approval."') AS JSON),
  updated_at = UTC_TIMESTAMP()
WHERE id IN ('welcome')
  AND (name IN ('LoopForge 体验项目')
    OR CAST(payload AS CHAR) REGEXP '"(name|description)": "[^"]*\\p{Han}');

COMMIT;
