#!/usr/bin/env bun
import { join } from 'node:path';
import {
  currentBranch,
  gitCommonDir,
  headSha,
  projectDirectory,
  workingTree,
} from './hook-utils.ts';
/**
 * レビュー記録はブランチごとに持つ。置き場所は主チェックアウトの .git 配下なので、linked
 * worktree から記録しても hook と同じファイルになり、別ブランチの記録とは混ざらない。git が
 * 使えない場所では CLAUDE_PROJECT_DIR 配下に置く。
 *
 * 対象ブランチは常に作業ツリーの現在のブランチで決める。`gh pr create --head <branch>`
 * で別ブランチを指定する場合は、そのブランチのディレクトリ（worktree）から記録・作成する
 * こと。コマンド文字列から --head を正規表現で拾う実装は、--title/--body の自由記述に
 * 同じ文字列が現れるとゲートを誤って通してしまうため採用しない。
 */
export async function reviewCountFile(input?: { cwd?: string } | null): Promise<string> {
  const tree = await workingTree(input);
  // encodeURIComponent は `/` を %2F にするなど可逆に符号化するので、feature/foo と
  // feature_foo が同じファイルを指すことがない。
  const branch = encodeURIComponent(await currentBranch(tree));
  const common = await gitCommonDir(tree);
  const base = common
    ? join(common, 'claude', 'pr-review')
    : join(await projectDirectory(), '.claude', 'pr-review');
  return join(base, `${branch}.rounds`);
}
export type Reviewer = 'codex' | 'other';
interface Round {
  /** レビュアーが挙げた指摘件数。accepted なラウンドでも実際の件数を残す（虚偽記録にしない）。 */
  count: number;
  /** このラウンドがレビューした HEAD の SHA。収束後に別のコミットが乗ったら無効にする。 */
  sha: string;
  reviewer: Reviewer;
  /**
   * 途中収束（直しても指摘の根本原因が変わらない）で、ユーザーが残る指摘を受け入れた
   * ラウンド。件数が 0 でなくても収束の対象になる。
   */
  accepted: boolean;
}
function parseLine(line: string): Round | null {
  // SHA-1(40桁)・SHA-256(64桁)のどちらでも読めるようにする。
  const match = line
    .trim()
    .match(/^(\d+)\s+([0-9a-f]{40}|[0-9a-f]{64})((?:\s+(?:codex|accepted))*)$/);
  if (!match) return null;
  const flags = match[3].trim().split(/\s+/).filter(Boolean);
  return {
    count: Number(match[1]),
    sha: match[2],
    reviewer: flags.includes('codex') ? 'codex' : 'other',
    accepted: flags.includes('accepted'),
  };
}
/** 記録済みラウンドを、古い順に返す。1 行 1 ラウンド: "<件数> <sha> [codex] [accepted]"。 */
export async function readRounds(input?: { cwd?: string } | null): Promise<Round[]> {
  const file = Bun.file(await reviewCountFile(input));
  if (!(await file.exists())) return [];
  return (await file.text())
    .split('\n')
    .map(parseLine)
    .filter((round): round is Round => round !== null);
}
export function formatRound(
  count: number,
  sha: string,
  reviewer: Reviewer,
  accepted: boolean,
): string {
  const flags = [reviewer === 'codex' ? 'codex' : null, accepted ? 'accepted' : null]
    .filter(Boolean)
    .join(' ');
  return flags ? `${count} ${sha} ${flags}` : `${count} ${sha}`;
}
/** レビュー対象になる HEAD の SHA。記録・判定の両方でこれを使う。 */
export async function reviewTargetSha(input?: { cwd?: string } | null): Promise<string> {
  return headSha(await workingTree(input));
}
/**
 * 収束の判定: 2 ラウンド以上あり、最後のラウンドが codex review で現在の HEAD をレビューした
 * ものであり、かつ「指摘 0 件」または「ユーザーが残る指摘を受け入れた(accepted)」（
 * `.claude/rules/pr-self-review.md` の必須条件）。
 *
 * 「いずれかのラウンドが codex」ではなく「最後のラウンドが codex」を要求する: 前者だと
 * 古いコミットに対する codex の指摘ありラウンドの後、別コミットへ進んだ状態を非 codex の
 * ラウンドだけで収束させられてしまい、codex が最終形を見ないまま通ってしまう。
 *
 * accepted を認めるのは、途中収束（直しても指摘の根本原因が変わらない）をユーザーが受け入れた
 * 場合に、実際には指摘が残っているのに 0 件と偽って記録させないため。
 */
export const MIN_ROUNDS = 2;
export function isConverged(rounds: Round[], currentSha: string): boolean {
  const last = rounds.at(-1);
  return (
    rounds.length >= MIN_ROUNDS &&
    (last?.count === 0 || last?.accepted === true) &&
    last?.sha === currentSha &&
    last?.reviewer === 'codex'
  );
}
