export default {
  extends: "stylelint-config-recommended-scss",
  rules: {
    // Range media queries (width >= 768px) are deliberate.
    "media-feature-range-notation": "context",
  },
  overrides: [
    {
      // Hive components follow the library's convention: interaction state
      // comes from React Aria data attributes ([data-hovered],
      // [data-focus-visible]), never from pseudo-classes. global.scss keeps
      // its focus ring for raw elements, so the rule covers modules only.
      files: ["src/**/*.module.scss"],
      rules: {
        "selector-pseudo-class-disallowed-list": ["hover", "focus-visible"],
      },
    },
  ],
};
