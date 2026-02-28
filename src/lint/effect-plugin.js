const noRunPromiseWithoutCatch = require("./rules/no-runpromise-without-catch.js");
const noThrowInEffect = require("./rules/no-throw-in-effect.js");
const preferEffectOverTrycatch = require("./rules/prefer-effect-over-trycatch.js");

module.exports = {
  rules: {
    "no-runpromise-without-catch": noRunPromiseWithoutCatch,
    "no-throw-in-effect": noThrowInEffect,
    "prefer-effect-over-trycatch": preferEffectOverTrycatch,
  },
};
