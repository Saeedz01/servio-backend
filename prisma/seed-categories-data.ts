export type SeedCategory = {
  name: string;
  slug: string;
  description?: string;
};

/** Canonical marketplace categories. Slugs are lowercase hyphen-separated. */
export const SERVICE_CATEGORIES: SeedCategory[] = [
  { name: 'Home Repair & Maintenance', slug: 'home-repair-maintenance' },
  { name: 'Electrical & Solar Services', slug: 'electrical-solar-services' },
  { name: 'Plumbing & Water Services', slug: 'plumbing-water-services' },
  { name: 'AC & Appliance Repair', slug: 'ac-appliance-repair' },
  { name: 'Construction & Renovation', slug: 'construction-renovation' },
  { name: 'Cleaning & Pest Control', slug: 'cleaning-pest-control' },
  { name: 'Beauty & Personal Care', slug: 'beauty-personal-care' },
  { name: 'Domestic Help & Care', slug: 'domestic-help-care' },
  { name: 'Transport & Driver Services', slug: 'transport-driver-services' },
  { name: 'Vehicle Rental & Booking', slug: 'vehicle-rental-booking' },
  { name: 'Equipment & Machinery Rental', slug: 'equipment-machinery-rental' },
  { name: 'Property & Space Rental', slug: 'property-space-rental' },
  {
    name: 'Event Equipment & Furniture Rental',
    slug: 'event-equipment-furniture-rental',
  },
  { name: 'Events, Catering & Decorations', slug: 'events-catering-decorations' },
  {
    name: 'Automotive Repair & Maintenance',
    slug: 'automotive-repair-maintenance',
  },
  { name: 'Moving & Packers', slug: 'moving-packers' },
  { name: 'Education & Tutoring', slug: 'education-tutoring' },
  { name: 'IT & Digital Services', slug: 'it-digital-services' },
  {
    name: 'Business & Professional Services',
    slug: 'business-professional-services',
  },
  { name: 'Photography & Videography', slug: 'photography-videography' },
  { name: 'Gardening & Landscaping', slug: 'gardening-landscaping' },
  { name: 'Delivery & Courier Services', slug: 'delivery-courier-services' },
  { name: 'Health & Wellness', slug: 'health-wellness' },
  { name: 'Pet Care', slug: 'pet-care' },
  { name: 'Other Services', slug: 'other-services' },
];

/**
 * Maps legacy free-text service.category_id values to canonical slugs
 * so existing demo rows keep a valid FK after migration.
 */
export const LEGACY_CATEGORY_SLUGS: Record<string, string> = {
  assembly: 'home-repair-maintenance',
  cleaning: 'cleaning-pest-control',
  moving: 'moving-packers',
  outdoor: 'gardening-landscaping',
  painting: 'construction-renovation',
  repairs: 'plumbing-water-services',
  trending: 'events-catering-decorations',
};
