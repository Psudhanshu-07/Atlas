const path = require("path");

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: [
    path.join(__dirname, "index.html"),
    path.join(__dirname, "src/**/*.{js,ts,jsx,tsx}"),
  ],
  theme: {
    extend: {
      colors: {
        "primary-container": "#ff544c",
        "on-secondary-container": "#f8f8ff",
        "on-secondary": "#002f68",
        "surface-tint": "#ffb4ac",
        "on-error": "#690005",
        "on-background": "#dfe2eb",
        "on-secondary-fixed": "#001a40",
        "secondary": "#acc7ff",
        "surface-container-high": "#262a31",
        "surface-container-lowest": "#0a0e14",
        "surface-container": "#1c2026",
        "on-tertiary-fixed-variant": "#004f54",
        "surface-dim": "#10141a",
        "inverse-primary": "#bb171c",
        "primary": "#ffb4ac",
        "outline-variant": "#5b403d",
        "on-error-container": "#ffdad6",
        "on-tertiary-fixed": "#002022",
        "on-primary-fixed-variant": "#93000d",
        "tertiary-container": "#00a0a9",
        "on-secondary-fixed-variant": "#004492",
        "on-tertiary-container": "#002f32",
        "surface-variant": "#31353c",
        "error-container": "#93000a",
        "surface-container-highest": "#31353c",
        "surface-container-low": "#181c22",
        "outline": "#ab8985",
        "secondary-fixed-dim": "#acc7ff",
        "tertiary-fixed-dim": "#53d8e2",
        "on-surface": "#dfe2eb",
        "error": "#ffb4ab",
        "on-tertiary": "#00363a",
        "secondary-fixed": "#d7e2ff",
        "on-primary-fixed": "#410002",
        "tertiary-fixed": "#76f5ff",
        "primary-fixed": "#ffdad6",
        "secondary-container": "#026ee4",
        "tertiary": "#53d8e2",
        "inverse-on-surface": "#2d3137",
        "inverse-surface": "#dfe2eb",
        "surface-bright": "#353940",
        "background": "#10141a",
        "on-primary": "#690006",
        "surface": "#10141a",
        "on-primary-container": "#5c0005",
        "primary-fixed-dim": "#ffb4ac",
        "on-surface-variant": "#e4beb9"
      },
      borderRadius: {
        "DEFAULT": "0.125rem",
        "lg": "0.25rem",
        "xl": "0.5rem",
        "full": "0.75rem"
      },
      spacing: {
        "space-xs": "0.25rem",
        "space-sm": "0.5rem",
        "gutter": "0.75rem",
        "gutter-mobile": "0.5rem",
        "space-lg": "1rem",
        "space-xl": "1.5rem",
        "margin-mobile": "0.75rem",
        "margin": "1rem",
        "space-md": "0.75rem"
      },
      fontFamily: {
        "mono-metric": ["JetBrains Mono", "monospace"],
        "body-bold": ["Inter", "sans-serif"],
        "micro-label": ["JetBrains Mono", "monospace"],
        "body-compact": ["Inter", "sans-serif"],
        "body-default": ["Inter", "sans-serif"],
        "code-default": ["JetBrains Mono", "monospace"],
        "headline-sm": ["Inter", "sans-serif"],
        "headline-lg": ["Inter", "sans-serif"],
        "code-compact": ["JetBrains Mono", "monospace"],
        "headline-xl": ["Inter", "sans-serif"]
      },
      fontSize: {
        "mono-metric": ["14px", { lineHeight: "18px", fontWeight: "600" }],
        "body-bold": ["13px", { lineHeight: "18px", fontWeight: "600" }],
        "micro-label": ["11px", { lineHeight: "14px", letterSpacing: "0.06em", fontWeight: "500" }],
        "body-compact": ["12px", { lineHeight: "16px", fontWeight: "400" }],
        "body-default": ["13px", { lineHeight: "18px", fontWeight: "400" }],
        "code-default": ["12px", { lineHeight: "18px", fontWeight: "400" }],
        "headline-sm": ["14px", { lineHeight: "20px", letterSpacing: "-0.01em", fontWeight: "600" }],
        "headline-lg": ["18px", { lineHeight: "24px", letterSpacing: "-0.015em", fontWeight: "600" }],
        "code-compact": ["11px", { lineHeight: "16px", fontWeight: "400" }],
        "headline-xl": ["24px", { lineHeight: "32px", letterSpacing: "-0.02em", fontWeight: "600" }]
      }
    }
  }
};
