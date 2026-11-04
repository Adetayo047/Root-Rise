// Shared by the build script (which bakes these into the static page) and
// the Worker (which charges the fee). Change a value here, then redeploy.
export const COHORT = '2026/2027';
export const RESUMPTION_DATE = '28th September 2026';
export const REGISTRATION_FEE_NAIRA = 20000;
export const REGISTRATION_FEE_KOBO = REGISTRATION_FEE_NAIRA * 100;

export const CRAFT_LABELS = {
  fashion: 'Fashion & Textile Design',
  leather: 'Leather & Product Craft',
  furniture: 'Furniture & Wood Craft',
  decorative: 'Bead, Wire & Decorative Craft',
  jewellery: 'Jewellery & Accessories Design',
  arts: 'Creative Arts, Photography & Ceramics',
  culinary: 'Culinary Arts & Hospitality',
  beauty: 'Beauty & Personal Care',
};
