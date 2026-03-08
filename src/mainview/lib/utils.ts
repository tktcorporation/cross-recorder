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
