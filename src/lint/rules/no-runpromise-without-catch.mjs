/**
 * Effect.runPromise() がエラーハンドリングなしで使われていないかチェックする。
 *
 * 「エラーハンドリング済み」と判定する条件:
 * 1. 外側に try/catch がある（従来の判定）
 * 2. runPromise の引数の Effect パイプライン内に catchAll / catchTag / match がある
 *
 * パイプライン内でエラーが処理されていれば runPromise は reject しないため安全。
 *
 * @type {import('eslint').Rule.RuleModule}
 */
export default {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Warn when Effect.runPromise() is used without error handling",
    },
    messages: {
      noRunPromiseWithoutCatch:
        "Effect.runPromise() can throw. Handle errors in the Effect pipeline (catchAll/match) or use runPromiseExit.",
    },
    schema: [],
  },
  create(context) {
    return {
      CallExpression(node) {
        if (!isEffectRunPromise(node)) return;

        // 1. Effect パイプライン内にエラーハンドリングがあるかチェック
        if (hasEffectPipelineErrorHandling(node)) return;

        // 2. 外側に try/catch があるかチェック（従来の判定）
        if (isInsideTryCatch(node)) return;

        context.report({
          node,
          messageId: "noRunPromiseWithoutCatch",
        });
      },
    };
  },
};

/** node が Effect.runPromise(...) の呼び出しかどうか */
function isEffectRunPromise(node) {
  return (
    node.callee.type === "MemberExpression" &&
    node.callee.object.type === "Identifier" &&
    node.callee.object.name === "Effect" &&
    node.callee.property.type === "Identifier" &&
    node.callee.property.name === "runPromise"
  );
}

/**
 * runPromise の引数 Effect パイプライン内に、エラーを網羅的に処理するメソッドがあるか。
 *
 * 検出パターン:
 * - effect.pipe(Effect.catchAll(...))
 * - effect.pipe(Effect.match(...))
 * - Effect.match(effect, ...)
 * - Effect.catchAll(effect, ...)
 *
 * AST を再帰的に探索し、Effect.catchAll / Effect.catchTag / Effect.match /
 * Effect.matchEffect の呼び出しを探す。
 */
function hasEffectPipelineErrorHandling(node) {
  const arg = node.arguments[0];
  if (!arg) return false;
  return containsEffectErrorHandler(arg);
}

/** Effect のエラーハンドリングメソッド名 */
const EFFECT_ERROR_HANDLERS = new Set([
  "catchAll",
  "catchTag",
  "match",
  "matchEffect",
]);

/**
 * AST ノードを再帰的に探索し、Effect.<errorHandler>(...) の呼び出しを含むか判定。
 * .pipe() チェーンや関数呼び出しの引数を辿る。
 */
function containsEffectErrorHandler(node) {
  if (!node || typeof node !== "object") return false;

  // Effect.catchAll(...) / Effect.match(...) 等の直接呼び出し
  if (
    node.type === "CallExpression" &&
    node.callee.type === "MemberExpression" &&
    node.callee.object.type === "Identifier" &&
    node.callee.object.name === "Effect" &&
    node.callee.property.type === "Identifier" &&
    EFFECT_ERROR_HANDLERS.has(node.callee.property.name)
  ) {
    return true;
  }

  // .pipe() チェーン内の引数を探索
  if (
    node.type === "CallExpression" &&
    node.callee.type === "MemberExpression" &&
    node.callee.property.type === "Identifier" &&
    node.callee.property.name === "pipe"
  ) {
    for (const arg of node.arguments) {
      if (containsEffectErrorHandler(arg)) return true;
    }
    // .pipe() のレシーバも探索
    return containsEffectErrorHandler(node.callee.object);
  }

  // 通常の CallExpression の引数を探索
  if (node.type === "CallExpression") {
    for (const arg of node.arguments) {
      if (containsEffectErrorHandler(arg)) return true;
    }
    return containsEffectErrorHandler(node.callee);
  }

  return false;
}

/** node が try/catch ブロックの中にあるか */
function isInsideTryCatch(node) {
  let parent = node.parent;
  while (parent) {
    if (parent.type === "TryStatement") {
      return true;
    }
    if (
      parent.type === "ReturnStatement" ||
      parent.type === "ArrowFunctionExpression"
    ) {
      let funcParent = parent.parent;
      while (funcParent) {
        if (funcParent.type === "TryStatement") {
          return true;
        }
        funcParent = funcParent.parent;
      }
      break;
    }
    parent = parent.parent;
  }
  return false;
}
