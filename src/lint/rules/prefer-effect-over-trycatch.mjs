/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Suggest using Effect.tryPromise over try/catch in service files",
    },
    messages: {
      preferEffect:
        "Consider using Effect.tryPromise instead of try/catch in service files for consistent error handling.",
    },
    schema: [],
  },
  create(context) {
    const filename = context.filename ?? context.getFilename();
    if (!filename.includes("/services/")) {
      return {};
    }

    return {
      TryStatement(node) {
        const sourceCode = context.sourceCode ?? context.getSourceCode();
        const hasEffectImport = sourceCode.ast.body.some(
          (stmt) =>
            stmt.type === "ImportDeclaration" &&
            stmt.source.value === "effect",
        );
        if (hasEffectImport) {
          context.report({
            node,
            messageId: "preferEffect",
          });
        }
      },
    };
  },
};
