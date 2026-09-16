import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Tailwind CSSのクラス名を安全にマージするユーティリティ。
 * shadcn/uiのコンポーネントで条件付きクラス適用に使用。
 * clxで条件分岐し、twMergeで重複するTailwindクラスを解決する。
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * オブジェクトから値が undefined のキーを除いたコピーを返す。
 * 部分的なレスポンス（一部フィールド欠落）を既存の state へ ...spread で
 * マージすると、undefined が正規の値を上書きしてしまう。マージ前にこれを
 * 通すと、欠けたフィールドは既存値のまま残る。
 */
export function omitUndefinedEntries<T extends object>(obj: T): Partial<T> {
  const result: Partial<T> = {};
  for (const key of Object.keys(obj) as Array<keyof T>) {
    const value = obj[key];
    if (value !== undefined) {
      result[key] = value;
    }
  }
  return result;
}
