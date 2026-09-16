#!/usr/bin/env bun
import { $ } from 'bun';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import {
  MIN_ROUNDS,
  formatRound,
  isConverged,
  readRounds,
  reviewCountFile,
  reviewTargetSha,
} from './review-count.ts';
import type { Reviewer } from './review-count.ts';
const [countArg, ...flagArgs] = process.argv.slice(2);
const knownFlags = new Set(['codex', 'accepted']);
const invalidFlag = flagArgs.find((flag) => !knownFlags.has(flag));
if (countArg === undefined || !/^\d+$/.test(countArg) || invalidFlag) {
  console.error(
    '使い方: bun .claude/hooks/record-pr-review.ts <このラウンドの指摘件数> [codex] [accepted]\n' +
      '指摘に対応し終えたラウンドだけを記録する。指摘 0 件のラウンドは 0 を渡す。\n' +
      'codex review でレビューしたラウンドは codex を渡す（自己申告であり、hook は実行の\n' +
      '有無を検証しない。虚偽の記録は .claude/rules/agent-work-discipline.md のツール結果の\n' +
      '捏造にあたる）。\n' +
      'ユーザーが残る指摘を受け入れて途中収束させる場合は accepted も渡す（このときは\n' +
      '実際の指摘件数をそのまま記録し、0 だと偽らない）。\n' +
      '対象はレビューを終えて修正をコミットした後の HEAD。未コミットの変更が残る状態で記録しない。',
  );
  process.exit(1);
}
const reviewer: Reviewer = flagArgs.includes('codex') ? 'codex' : 'other';
const accepted = flagArgs.includes('accepted');
// 追跡ファイルの変更だけを見る。レビュー対象は `git diff origin/main...HEAD` で、
// 未追跡ファイルはそこに含まれないため、無関係な作業ファイルの存在では止めない。
const status = await $`git status --porcelain --untracked-files=no`.quiet().nothrow();
if (status.exitCode === 0 && status.text().trim()) {
  console.error(
    '追跡ファイルに未コミットの変更があります。レビュー対象は「レビューを終えて修正をコミットした後の HEAD」なので、先にコミットしてから記録してください。',
  );
  process.exit(1);
}
const file = await reviewCountFile();
const sha = await reviewTargetSha();
const rounds = [...(await readRounds()), { count: Number(countArg), sha, reviewer, accepted }];
await mkdir(dirname(file), { recursive: true });
await Bun.write(
  file,
  `${rounds.map((r) => formatRound(r.count, r.sha, r.reviewer, r.accepted)).join('\n')}\n`,
);
const state = isConverged(rounds, sha)
  ? '収束。gh pr create に進める'
  : rounds.length < MIN_ROUNDS
    ? `あと ${MIN_ROUNDS - rounds.length} ラウンド以上必要`
    : reviewer !== 'codex'
      ? '未収束。最後は codex review である必要がある'
      : '未収束。指摘 0 件、または accepted のラウンドまで続ける';
console.log(
  `ラウンド ${rounds.length} を記録（指摘 ${countArg} 件${reviewer === 'codex' ? '、codex' : ''}${accepted ? '、accepted' : ''}）。${state}。`,
);
