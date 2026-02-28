/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
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
        // Match Effect.runPromise(...)
        if (
          node.callee.type === "MemberExpression" &&
          node.callee.object.type === "Identifier" &&
          node.callee.object.name === "Effect" &&
          node.callee.property.type === "Identifier" &&
          node.callee.property.name === "runPromise"
        ) {
          // Check if inside try block or async function with catch
          let parent = node.parent;
          let inTryCatch = false;
          while (parent) {
            if (parent.type === "TryStatement") {
              inTryCatch = true;
              break;
            }
            // If inside an arrow/function that returns (used in RPC handler context), allow
            if (
              parent.type === "ReturnStatement" ||
              parent.type === "ArrowFunctionExpression"
            ) {
              // Check if the function is inside a try
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
