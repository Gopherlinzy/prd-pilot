/**
 * 端到端冒烟测试：飞书 PRD 解析 + Lint 扫描
 *
 * 用法：npx tsx src/test-smoke.ts
 * 需要环境变量：FEISHU_APP_ID, FEISHU_APP_SECRET
 */
import 'dotenv/config';
import { FeishuAdapter } from './adapters/feishu';
import { PRDLinter } from './analyzers/linter';
import type { PRDDocument, Requirement, LintIssue } from './types/prd';

// ── 配置 ──────────────────────────────────────────────
const TEST_URL = 'https://feishu.cn/docx/MYjXdmQvZo1Q7jxbpFocXKj5ngh';

const appId = process.env.FEISHU_APP_ID;
const appSecret = process.env.FEISHU_APP_SECRET;

if (!appId || !appSecret) {
  console.error('❌ 缺少飞书凭证。请设置环境变量：');
  console.error('   FEISHU_APP_ID=<your_app_id>');
  console.error('   FEISHU_APP_SECRET=<your_app_secret>');
  console.error('   或在 .env 文件中配置');
  process.exit(1);
}

// ── 主流程 ────────────────────────────────────────────
async function main() {
  console.log('='.repeat(60));
  console.log('PRD Pilot 冒烟测试');
  console.log('='.repeat(60));
  console.log(`测试文档: ${TEST_URL}\n`);

  // ── F1: 飞书 PRD 解析 ──
  console.log('▶ [F1] 初始化 FeishuAdapter...');
  const adapter = new FeishuAdapter({ appId, appSecret });

  console.log('▶ [F1] 解析飞书文档...');
  const startTime = Date.now();
  let prd: PRDDocument;
  try {
    prd = await adapter.analyze(TEST_URL);
  } catch (err) {
    console.error('❌ 解析失败:', err instanceof Error ? err.message : err);
    process.exit(2);
  }
  const elapsed = Date.now() - startTime;

  // ── 解析结果摘要 ──
  console.log('\n' + '─'.repeat(60));
  console.log('📊 解析结果摘要');
  console.log('─'.repeat(60));
  console.log(`  标题:         ${prd.title}`);
  console.log(`  版本:         ${prd.version}`);
  console.log(`  作者:         ${prd.author ?? '(未知)'}`);
  console.log(`  Sections:     ${prd.sections.length}`);
  console.log(`  Requirements: ${prd.requirements.length}`);
  console.log(`  DataModels:   ${prd.dataModels.length}`);
  console.log(`  Flows:        ${prd.flows.length}`);
  console.log(`  解析耗时:     ${elapsed}ms`);

  // ── 每个 Requirement 明细 ──
  if (prd.requirements.length > 0) {
    console.log('\n' + '─'.repeat(60));
    console.log('📋 Requirements 列表');
    console.log('─'.repeat(60));
    prd.requirements.forEach((req: Requirement, i: number) => {
      console.log(`  [${i + 1}] ${req.id} — ${req.title}`);
      console.log(`      优先级: ${req.priority ?? '(未设置)'}  AC数量: ${req.acceptanceCriteria.length}`);
    });
  }

  // ── F2: Lint 扫描 ──
  console.log('\n' + '─'.repeat(60));
  console.log('▶ [F2] 运行 PRDLinter...');
  console.log('─'.repeat(60));
  const linter = new PRDLinter();
  let issues: LintIssue[];
  try {
    issues = linter.lint(prd);
  } catch (err) {
    console.error('❌ Lint 失败:', err instanceof Error ? err.message : err);
    process.exit(3);
  }

  // ── Lint 结果详情 ──
  if (issues.length > 0) {
    console.log(`\n发现 ${issues.length} 条问题:\n`);
    issues.forEach((issue: LintIssue, i: number) => {
      const icon = issue.severity === 'error' ? '🔴' : issue.severity === 'warning' ? '🟡' : '🔵';
      const loc = issue.location
        ? ` [${issue.location.requirementId ?? issue.location.sectionId ?? ''}]`
        : '';
      console.log(`  ${icon} ${i + 1}. [${issue.severity.toUpperCase()}] ${issue.rule}${loc}`);
      console.log(`     ${issue.message}`);
      if (issue.suggestion) {
        console.log(`     💡 ${issue.suggestion}`);
      }
    });
  } else {
    console.log('\n✅ 无问题发现');
  }

  // ── Summary ──
  const summary = linter.summary(issues);
  console.log('\n' + '─'.repeat(60));
  console.log('📈 Lint Summary');
  console.log('─'.repeat(60));
  console.log(`  Errors:   ${summary.errors}`);
  console.log(`  Warnings: ${summary.warnings}`);
  console.log(`  Infos:    ${summary.infos}`);
  console.log(`  Total:    ${summary.total}`);

  console.log('\n' + '='.repeat(60));
  console.log('✅ 冒烟测试完成');
  console.log('='.repeat(60));
}

main().catch((err) => {
  console.error('💥 未捕获异常:', err);
  process.exit(99);
});
