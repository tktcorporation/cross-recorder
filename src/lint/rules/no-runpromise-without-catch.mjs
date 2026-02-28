/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Warn when Effect.runPromise() is used without error handling",
    },
    messages: {
      noRunPromiseWithoutCatch:
        "Effect.runPromise() can throw. Wrap in try/catch, use runPromiseExit, or use runRpcEffect helper.",
    },
    schema: [],
  },
  create(context) {
    return {
      CallExpression(node) {
        if (
          node.callee.type === "MemberExpression" &&
          node.callee.object.type === "Identifier" &&
          node.callee.object.name === "Effect" &&
          node.callee.property.type === "Identifier" &&
          node.callee.property.name === "runPromise"
        ) {
          let parent = node.parent;
          let inTryCatch = false;
          while (parent) {
            if (parent.type === "TryStatement") {
              inTryCatch = true;
              break;
            }
            if (
              parent.type === "ReturnStatement" ||
              parent.type === "ArrowFunctionExpression"
            ) {
              let funcParent = parent.parent;
              while (funcParent) {
                if (funcParent.type === "TryStatement") {
                  inTryCatch = true;
                  break;
                }
                funcParent = funcParent.parent;
              }
              break;
            }
            parent = parent.parent;
          }
          if (!inTryCatch) {
            context.report({
              node,
              messageId: "noRunPromiseWithoutCatch",
            });
          }
        }
      },
    };
  },
};
