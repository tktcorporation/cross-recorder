/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Prefer Effect.fail() over throw inside Effect.tryPromise try blocks",
    },
    messages: {
      noThrowInEffect:
        "Avoid throw inside Effect.tryPromise. Use Effect.fail() for typed errors, or let the catch handler handle it.",
    },
    schema: [],
  },
  create(context) {
    let insideEffectTry = false;

    return {
      CallExpression(node) {
        if (
          node.callee.type === "MemberExpression" &&
          node.callee.object.type === "Identifier" &&
          node.callee.object.name === "Effect" &&
          node.callee.property.type === "Identifier" &&
          node.callee.property.name === "tryPromise" &&
          node.arguments.length > 0 &&
          node.arguments[0].type === "ObjectExpression"
        ) {
          const tryProp = node.arguments[0].properties.find(
            (p) =>
              p.type === "Property" &&
              p.key.type === "Identifier" &&
              p.key.name === "try",
          );
          if (tryProp && tryProp.value) {
            insideEffectTry = true;
          }
        }
      },
      "CallExpression:exit"(node) {
        if (
          node.callee.type === "MemberExpression" &&
          node.callee.object.type === "Identifier" &&
          node.callee.object.name === "Effect" &&
          node.callee.property.type === "Identifier" &&
          node.callee.property.name === "tryPromise"
        ) {
          insideEffectTry = false;
        }
      },
      ThrowStatement(node) {
        if (insideEffectTry) {
          context.report({
            node,
            messageId: "noThrowInEffect",
          });
        }
      },
    };
  },
};
