/**
 * Generic Tufts University brand. This is a *brand* object, not a deployable
 * instance — course/program instances (e.g. instances/tufts-en1.js) import
 * this and spread it, overriding only what differs (name, maybe a course
 * accent color), the same way instances/skolegpt-dk.js reuses the shared
 * brand.js and overrides `name`/`logoSrc`.
 *
 * TODO before shipping any Tufts instance:
 * - Colors below are rough placeholders, not verified Tufts brand-guideline
 *   hex values — swap in the real ones (Tufts Blue / Tufts Brown) from
 *   https://communications.tufts.edu (brand guidelines) or Tufts' brand
 *   toolkit.
 * - No logo file is committed here (same reason Purdue's PU-H-Full-RGB.svg
 *   isn't in this repo either — institutional logos are supplied per
 *   deployment, not checked into the shared codebase). Drop a Tufts logo
 *   under `public/` (e.g. `public/tufts-logo.svg`) and set `logoSrc` below
 *   to `/tufts-logo.svg`. Until then this renders text-only (no logo image),
 *   same as skolegpt-dk.
 */
const brand = {
  name: 'Tufts University',
  logoSrc: null,
  logoAlt: null,
  logoHeight: 40,

  fontFamily: 'system-ui, Avenir, Helvetica, Arial, sans-serif',
  fontUrl: null,

  colors: {
    primary: '#3E8EDE', // placeholder "Tufts Blue" — verify real hex
    primaryText: '#FFFFFF',
    secondary: '#62825D', // placeholder "Tufts Brown/Green" accent — verify real hex
    secondaryText: '#FFFFFF',
    accent: '#3E8EDE',
    accentHover: '#2C6BB0',
  },
};

export default brand;
