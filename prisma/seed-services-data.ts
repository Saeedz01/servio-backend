import { PriceUnit, ServiceStatus } from '@prisma/client';

const weekdays = [
  { day: 'Mon', enabled: true, start: '09:00', end: '17:00' },
  { day: 'Tue', enabled: true, start: '09:00', end: '17:00' },
  { day: 'Wed', enabled: true, start: '09:00', end: '17:00' },
  { day: 'Thu', enabled: true, start: '09:00', end: '17:00' },
  { day: 'Fri', enabled: true, start: '09:00', end: '17:00' },
  { day: 'Sat', enabled: false, start: '10:00', end: '14:00' },
  { day: 'Sun', enabled: false, start: '10:00', end: '14:00' },
];

const weekend = [
  { day: 'Mon', enabled: true, start: '10:00', end: '18:00' },
  { day: 'Tue', enabled: true, start: '10:00', end: '18:00' },
  { day: 'Wed', enabled: true, start: '10:00', end: '18:00' },
  { day: 'Thu', enabled: true, start: '10:00', end: '18:00' },
  { day: 'Fri', enabled: true, start: '10:00', end: '18:00' },
  { day: 'Sat', enabled: true, start: '09:00', end: '15:00' },
  { day: 'Sun', enabled: true, start: '10:00', end: '14:00' },
];

export type SeedService = {
  /** Leaf ServiceCategory.slug */
  categorySlug: string;
  /** ServiceCity.slug */
  citySlug: string;
  title: string;
  description: string;
  imageUrl: string;
  address: string;
  lat: number;
  lng: number;
  radiusKm: number;
  priceAmount: number;
  priceUnit: PriceUnit;
  availability: typeof weekdays;
  status: ServiceStatus;
};

/** Demo + catalog services for the verified demo provider (Punjab cities). */
export const DEMO_PROVIDER_SERVICES: SeedService[] = [
  {
    categorySlug: 'furniture-assembly',
    citySlug: 'lahore',
    title: 'Premium Furniture Assembly',
    description:
      'Professional assembly for beds, desks, wardrobes, and shelving units.',
    imageUrl:
      'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=800&q=80',
    address: 'Gulberg III, Lahore',
    lat: 31.5102,
    lng: 74.3442,
    radiusKm: 12,
    priceAmount: 49,
    priceUnit: PriceUnit.PROJECT,
    availability: weekdays,
    status: ServiceStatus.PUBLISHED,
  },
  {
    categorySlug: 'house-shifting',
    citySlug: 'lahore',
    title: 'Same-Day Moving Help',
    description: 'Two-person crew for apartments and small homes.',
    imageUrl:
      'https://images.unsplash.com/photo-1600518464441-9154a4dea21b?auto=format&fit=crop&w=800&q=80',
    address: 'Johar Town, Lahore',
    lat: 31.4697,
    lng: 74.2728,
    radiusKm: 20,
    priceAmount: 67,
    priceUnit: PriceUnit.PROJECT,
    availability: weekdays,
    status: ServiceStatus.PUBLISHED,
  },
  {
    categorySlug: 'home-deep-cleaning',
    citySlug: 'okara',
    title: 'Evening Home Cleaning',
    description: 'Kitchen, bathrooms, and living areas after work hours.',
    imageUrl:
      'https://images.unsplash.com/photo-1581578731548-c64695cc6952?auto=format&fit=crop&w=800&q=80',
    address: 'Benazir Road, Okara',
    lat: 30.8081,
    lng: 73.4458,
    radiusKm: 8,
    priceAmount: 45,
    priceUnit: PriceUnit.HOUR,
    availability: weekdays,
    status: ServiceStatus.DRAFT,
  },
  {
    categorySlug: 'lawn-mowing',
    citySlug: 'depalpur',
    title: 'Weekend Lawn Care',
    description: 'Mowing, edging, and basic yard cleanup.',
    imageUrl:
      'https://images.unsplash.com/photo-1558904541-efa843a96f01?auto=format&fit=crop&w=800&q=80',
    address: 'Depalpur City Center',
    lat: 30.6709,
    lng: 73.6534,
    radiusKm: 15,
    priceAmount: 139,
    priceUnit: PriceUnit.FLAT,
    availability: weekdays,
    status: ServiceStatus.SUSPENDED,
  },
  {
    categorySlug: 'furniture-assembly',
    citySlug: 'lahore',
    title: 'Furniture Assembly',
    description: 'Book trusted help for furniture assembly.',
    imageUrl:
      'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=800&q=80',
    address: 'DHA Phase 5, Lahore',
    lat: 31.4697,
    lng: 74.4081,
    radiusKm: 12,
    priceAmount: 49,
    priceUnit: PriceUnit.PROJECT,
    availability: weekdays,
    status: ServiceStatus.PUBLISHED,
  },
  {
    categorySlug: 'furniture-assembly',
    citySlug: 'okara',
    title: 'IKEA Assembly',
    description: 'Book trusted help for ikea assembly.',
    imageUrl: '/services/ikea-assembly.jpg',
    address: 'Church Road, Okara',
    lat: 30.8138,
    lng: 73.4534,
    radiusKm: 12,
    priceAmount: 55,
    priceUnit: PriceUnit.PROJECT,
    availability: weekend,
    status: ServiceStatus.PUBLISHED,
  },
  {
    categorySlug: 'furniture-assembly',
    citySlug: 'hujra-shah-muqeem',
    title: 'Desk Assembly',
    description: 'Book trusted help for desk assembly.',
    imageUrl:
      'https://images.unsplash.com/photo-1518455027359-f3f8164ba6bd?auto=format&fit=crop&w=800&q=80',
    address: 'Main Bazaar, Hujra Shah Muqeem',
    lat: 30.7417,
    lng: 73.8244,
    radiusKm: 12,
    priceAmount: 45,
    priceUnit: PriceUnit.PROJECT,
    availability: weekdays,
    status: ServiceStatus.PUBLISHED,
  },
  {
    categorySlug: 'furniture-assembly',
    citySlug: 'lahore',
    title: 'Bookshelf Assembly',
    description: 'Book trusted help for bookshelf assembly.',
    imageUrl:
      'https://images.unsplash.com/photo-1594620302200-9a762244a156?auto=format&fit=crop&w=800&q=80',
    address: 'Model Town, Lahore',
    lat: 31.4826,
    lng: 74.3162,
    radiusKm: 12,
    priceAmount: 49,
    priceUnit: PriceUnit.PROJECT,
    availability: weekend,
    status: ServiceStatus.PUBLISHED,
  },
  {
    categorySlug: 'house-shifting',
    citySlug: 'depalpur',
    title: 'Help Moving',
    description: 'Book trusted help for help moving.',
    imageUrl:
      'https://images.unsplash.com/photo-1600518464441-9154a4dea21b?auto=format&fit=crop&w=800&q=80',
    address: 'Railway Road, Depalpur',
    lat: 30.668,
    lng: 73.65,
    radiusKm: 12,
    priceAmount: 67,
    priceUnit: PriceUnit.PROJECT,
    availability: weekdays,
    status: ServiceStatus.PUBLISHED,
  },
  {
    categorySlug: 'home-deep-cleaning',
    citySlug: 'lahore',
    title: 'Home & Apartment Cleaning',
    description: 'Book trusted help for home & apartment cleaning.',
    imageUrl:
      'https://images.unsplash.com/photo-1581578731548-c64695cc6952?auto=format&fit=crop&w=800&q=80',
    address: 'Bahria Town, Lahore',
    lat: 31.3675,
    lng: 74.2214,
    radiusKm: 12,
    priceAmount: 49,
    priceUnit: PriceUnit.PROJECT,
    availability: weekend,
    status: ServiceStatus.PUBLISHED,
  },
  {
    categorySlug: 'lawn-mowing',
    citySlug: 'lahore',
    title: 'Lawn Care',
    description: 'Book trusted help for lawn care.',
    imageUrl:
      'https://images.unsplash.com/photo-1558904541-efa843a96f01?auto=format&fit=crop&w=800&q=80',
    address: 'Cantt, Lahore',
    lat: 31.5204,
    lng: 74.3587,
    radiusKm: 12,
    priceAmount: 49,
    priceUnit: PriceUnit.PROJECT,
    availability: weekdays,
    status: ServiceStatus.PUBLISHED,
  },
  {
    categorySlug: 'tap-pipe-repair',
    citySlug: 'okara',
    title: 'Minor Plumbing Repairs',
    description: 'Book trusted help for minor plumbing repairs.',
    imageUrl:
      'https://images.unsplash.com/photo-1607472586893-edb57bdc0e39?auto=format&fit=crop&w=800&q=80',
    address: 'Tehsil Road, Okara',
    lat: 30.81,
    lng: 73.45,
    radiusKm: 12,
    priceAmount: 74,
    priceUnit: PriceUnit.PROJECT,
    availability: weekend,
    status: ServiceStatus.PUBLISHED,
  },
  {
    categorySlug: 'interior-painting-service',
    citySlug: 'lahore',
    title: 'Interior Painting',
    description: 'Book trusted help for interior painting.',
    imageUrl:
      'https://images.unsplash.com/photo-1562259949-e8e7689d7828?auto=format&fit=crop&w=800&q=80',
    address: 'Faisal Town, Lahore',
    lat: 31.4842,
    lng: 74.3015,
    radiusKm: 12,
    priceAmount: 99,
    priceUnit: PriceUnit.PROJECT,
    availability: weekdays,
    status: ServiceStatus.PUBLISHED,
  },
  {
    categorySlug: 'event-catering-service',
    citySlug: 'lahore',
    title: 'Event Catering',
    description:
      'Buffet and plated catering for small gatherings, parties, and office events.',
    imageUrl:
      'https://images.unsplash.com/photo-1555244162-803834f70033?auto=format&fit=crop&w=800&q=80',
    address: 'Township, Lahore',
    lat: 31.451,
    lng: 74.305,
    radiusKm: 12,
    priceAmount: 199,
    priceUnit: PriceUnit.PROJECT,
    availability: weekend,
    status: ServiceStatus.PUBLISHED,
  },
  {
    categorySlug: 'ac-repair',
    citySlug: 'lahore',
    title: 'Split AC Repair & Gas Refill',
    description: 'Diagnosis, gas refill, and repair for split and window ACs.',
    imageUrl:
      'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?auto=format&fit=crop&w=800&q=80',
    address: 'Allama Iqbal Town, Lahore',
    lat: 31.5111,
    lng: 74.2833,
    radiusKm: 15,
    priceAmount: 80,
    priceUnit: PriceUnit.PROJECT,
    availability: weekdays,
    status: ServiceStatus.PUBLISHED,
  },
  {
    categorySlug: 'washing-machine-repair',
    citySlug: 'lahore',
    title: 'Washing Machine Repair',
    description: 'On-site repair for automatic and semi-automatic washers.',
    imageUrl:
      'https://images.unsplash.com/photo-1626806787461-74beaa1a0c3b?auto=format&fit=crop&w=800&q=80',
    address: 'Wapda Town, Lahore',
    lat: 31.431,
    lng: 74.266,
    radiusKm: 12,
    priceAmount: 60,
    priceUnit: PriceUnit.PROJECT,
    availability: weekdays,
    status: ServiceStatus.PUBLISHED,
  },
  {
    categorySlug: 'fridge-repair',
    citySlug: 'okara',
    title: 'Fridge & Freezer Repair',
    description: 'Compressor, thermostat, and cooling issues for home fridges.',
    imageUrl:
      'https://images.unsplash.com/photo-1571175443880-49e1d25b2bc5?auto=format&fit=crop&w=800&q=80',
    address: 'M.A. Jinnah Road, Okara',
    lat: 30.8085,
    lng: 73.448,
    radiusKm: 10,
    priceAmount: 70,
    priceUnit: PriceUnit.PROJECT,
    availability: weekend,
    status: ServiceStatus.PUBLISHED,
  },
  {
    categorySlug: 'ac-repair',
    citySlug: 'depalpur',
    title: 'AC Service Depalpur',
    description: 'Seasonal AC cleaning and repair across Depalpur.',
    imageUrl:
      'https://images.unsplash.com/photo-1631545806609-85c0c8b5c0c0?auto=format&fit=crop&w=800&q=80',
    address: 'Kasur Road, Depalpur',
    lat: 30.672,
    lng: 73.655,
    radiusKm: 10,
    priceAmount: 55,
    priceUnit: PriceUnit.PROJECT,
    availability: weekdays,
    status: ServiceStatus.PUBLISHED,
  },
];
