import noRunPromiseWithoutCatch from "./rules/no-runpromise-without-catch.mjs";
import noThrowInEffect from "./rules/no-throw-in-effect.mjs";
import preferEffectOverTrycatch from "./rules/prefer-effect-over-trycatch.mjs";

export default {
  meta: {
    name: "effect",
  },
  rules: {
    "no-runpromise-without-catch": noRunPromiseWithoutCatch,
    "no-throw-in-effect": noThrowInEffect,
    "prefer-effect-over-trycatch": preferEffectOverTrycatch,
  },
};
