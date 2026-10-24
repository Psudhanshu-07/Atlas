// PostCSS pipeline for the frontend build.
//
// The Tailwind plugin is given the config path explicitly: by default it
// searches for `tailwind.config.js` in the *current working directory*, which
// is the repository root on Vercel (`npm run build`) and not `frontend/`. It
// then silently builds with an empty default config and generates no utility
// classes. Resolving the path here makes the build cwd-independent.
const path = require("path");

module.exports = {
  plugins: {
    tailwindcss: { config: path.join(__dirname, "tailwind.config.js") },
    autoprefixer: {},
  },
};
