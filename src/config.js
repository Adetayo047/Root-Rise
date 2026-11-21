// Shared by the build script (which bakes these into the static page) and
// the Worker (which charges the fee). Change a value here, then redeploy.
export const COHORT = '2026/2027';
export const RESUMPTION_DATE = '28th September 2026';
export const REGISTRATION_FEE_NAIRA = 20000;
export const REGISTRATION_FEE_KOBO = REGISTRATION_FEE_NAIRA * 100;

// The schools shown on the landing page and offered in the application form.
// `key` is what's stored on each application — don't change an existing key,
// or older applications will lose their label.
export const SCHOOLS = [
  { key: 'fashion', icon: 'styler', title: 'Fashion, Textiles & Creative Craft', programmes: [
    'Fashion Designing', 'Textile Design & Fabric Decoration', 'Footwear, Leather, Textiles & Accessories',
    'Knitting, Crocheting & Fabric Craft', 'Creative Art Product Development', 'Beading & Wire Works',
    'Bag Making', 'Jewellery Making', 'Fascinator Making', 'Umbrella Making'] },
  { key: 'beauty', icon: 'spa', title: 'Beauty & Personal Care', programmes: [
    'Hairdressing', 'Makeup Artistry', 'Gele Styling', 'Beauty Craft', 'Personal Grooming & Beauty Enterprise'] },
  { key: 'arts', icon: 'palette', title: 'Fine Arts, Visual Arts & Creative Design', programmes: [
    'Painting & Drawing', 'Sculpture & Three-Dimensional Art', 'Graphic & Communication Design',
    'Decorative & Applied Arts', 'Resin Creative Art', 'Photography & Visual Imaging', 'Creative Art Product Development',
    'Art & Ceramics', 'Mixed-Media Art'] },
  { key: 'culinary', icon: 'restaurant', title: 'Culinary Arts, Food Production, Events & Hospitality', programmes: [
    'Culinary Arts & Professional Cooking', 'Baking & Pastry Arts', 'Beverage & Service Arts',
    'Catering & Event Food Services', 'Food Processing & Product Development', 'Hospitality & Guest Services',
    'Event Planning & Management', 'Food Presentation'] },
  { key: 'technology', icon: 'computer', title: 'Technology, Digital Skills & Innovation', programmes: [
    'Computer & Digital Literacy', 'Information Technology & Computer Maintenance', 'Software & Web Development',
    'Digital Business & Technology', 'Digital Marketing & Social Media', 'Creative Digital Media',
    'Emerging Technologies', 'Technology Repairs & Specialized Services'] },
  { key: 'business', icon: 'business_center', title: 'Business, Enterprise & Professional Development', programmes: [
    'Entrepreneurship & Business Development', 'Accounting, Finance & Business Administration',
    'Marketing, Sales & Customer Relations', 'Office Administration & Executive Support',
    'Human Resources & Workforce Development', 'Cooperative & Community Enterprise',
    'Business Law & Professional Ethics', 'Procurement, Logistics & Supply Chain'] },
  { key: 'performing', icon: 'theater_comedy', title: 'Performing Arts, Film & Entertainment', programmes: [
    'Creative Writing & Storytelling', 'Acting & Theatre Arts', 'Music & Vocal Arts', 'Dance & Choreography',
    'Film & Video Production', 'Broadcasting & Media Presentation', 'Photography & Visual Imaging',
    'Talent & Entertainment Management'] },
  { key: 'sports', icon: 'sports_soccer', title: 'Sports, Fitness & Recreation', programmes: [
    'Sports & Athletics', 'Fitness & Physical Conditioning', 'Sports Coaching & Management',
    'Recreational & Outdoor Activities'] },
  { key: 'lifestyle', icon: 'home', title: 'Creative Lifestyle, Home & Community Skills', programmes: [
    'Home Management & Domestic Services', 'Event Planning & Decoration', 'Floral Art & Creative Landscaping',
    'Craft & Creative Product Development', 'Lifestyle & Personal Development'] },
  { key: 'agriculture', icon: 'agriculture', title: 'Agriculture, Agribusiness & Environmental Production', programmes: [
    'Crop Production & Horticulture', 'Animal Husbandry & Livestock Production', 'Aquaculture & Fisheries',
    'Agricultural Processing & Food Preservation', 'Agribusiness & Farm Enterprise',
    'Environmental Management & Green Enterprise'] },
  { key: 'automotive', icon: 'car_repair', title: 'Automotive, Mechanical & Equipment Technology', programmes: [
    'Automobile Mechanics', 'Auto Electrical & Electronics', 'Auto Body, Panel Beating & Painting',
    'Motorcycle & Tricycle Mechanics', 'Mechanical Equipment Maintenance', 'Refrigeration & Air Conditioning',
    'Automotive Enterprise & Service Management'] },
  { key: 'construction', icon: 'construction', title: 'Construction, Building & Technical Trades', programmes: [
    'Carpentry & Woodwork', 'Furniture Design & Production', 'Building Construction & Masonry',
    'Plumbing & Water Systems', 'Electrical Installation & Maintenance', 'Welding, Metalwork & Fabrication',
    'Painting, Decoration & Interior Finishes', 'Interior Design & Space Development',
    'Building Design & Technical Drawing', 'Wood Décor & Finishing'] },
  { key: 'engineering', icon: 'solar_power', title: 'Practical Engineering, Energy & Innovation', programmes: [
    'Solar & Renewable Energy', 'Fabrication & Product Engineering', 'Innovation & Product Design',
    'Electrical & Electronic Craft'] },
  { key: 'education', icon: 'child_care', title: 'Child Development, Education & Youth Development', programmes: [
    'Child Development & Care', 'Creative Learning & Talent Development', 'Educational Support & Learning Skills',
    'Youth Leadership & Character Development'] },
  { key: 'advanced', icon: 'school', title: 'Expanded Advanced Professional & Technical Programmes', programmes: [
    'Academic Foundation', 'Critical Thinking & Intellectual Development', 'Social & Human Development',
    'Civic, Leadership & Citizenship Education', 'Digital & Information Literacy',
    'Personal & Professional Development'] },
];

// What new applicants can choose from.
export const SCHOOL_LABELS = Object.fromEntries(SCHOOLS.map((s) => [s.key, s.title]));

// Every label an application might carry, including disciplines from before
// the schools were introduced, so older records still display and filter.
export const CRAFT_LABELS = {
  ...SCHOOL_LABELS,
  leather: 'Leather & Product Craft (legacy)',
  furniture: 'Furniture & Wood Craft (legacy)',
  decorative: 'Bead, Wire & Decorative Craft (legacy)',
  jewellery: 'Jewellery & Accessories Design (legacy)',
};

// Where a paid candidate is in the admissions process. Set by the admin
// team from the dashboard; every new paid application starts at "new".
export const ADMISSION_STAGES = {
  new: 'New',
  contacted: 'Contacted',
  interview: 'Interview Scheduled',
  admitted: 'Admitted',
  waitlisted: 'Waitlisted',
  declined: 'Declined',
};
