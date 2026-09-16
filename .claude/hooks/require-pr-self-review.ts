#!/usr/bin/env bun
import { readInput } from './hook-utils.ts';
import { MIN_ROUNDS, isConverged, readRounds, reviewTargetSha } from './review-count.ts';
const input = await readInput();
const [rounds, currentSha] = await Promise.all([readRounds(input), reviewTargetSha(input)]);
if (!isConverged(rounds, currentSha)) {
  const history =
    rounds.length === 0
      ? '記録なし'
      : `指摘件数の推移: ${rounds.map((r) => (r.reviewer === 'codex' ? `${r.count}(codex)` : r.count)).join(' → ')}`;
  const last = rounds.at(-1);
  const reason =
    rounds.length < MIN_ROUNDS
      ? `ラウンドが ${MIN_ROUNDS} 回に達していません`
      : last?.reviewer !== 'codex'
        ? '最後のラウンドが codex review ではありません'
        : (last.count === 0 || last.accepted) && last.sha !== currentSha
          ? '収束後に別のコミットが乗っています。現在の HEAD で codex review が必要です'
          : '最後のラウンドに指摘が残っています（ユーザーが受け入れた場合は accepted を付けて記録する）';
  console.log(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: `PR作成をブロックしました。このブランチのレビューループが収束していません（${reason}。${history}）。.claude/skills/pr-review-loop/SKILL.md の手順でレビューと修正を繰り返し、ラウンドごとに bun .claude/hooks/record-pr-review.ts <指摘件数> [codex] [accepted] で記録してください。${MIN_ROUNDS} ラウンド以上・最後のラウンドが codex review で現在の HEAD に対して 0 件（またはユーザー受け入れの accepted）、で通ります。`,
      },
    }),
  );
}
