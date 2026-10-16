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
  categoryId: string;
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

/** Former localStorage demo + catalog services for the verified demo provider. */
export const DEMO_PROVIDER_SERVICES: SeedService[] = [
  {
    categoryId: 'assembly',
    title: 'Premium Furniture Assembly',
    description:
      'Professional assembly for beds, desks, wardrobes, and shelving units.',
    imageUrl:
      'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=800&q=80',
    address: 'Downtown District, City Center',
    lat: 40.7128,
    lng: -74.006,
    radiusKm: 12,
    priceAmount: 49,
    priceUnit: PriceUnit.PROJECT,
    availability: weekdays,
    status: ServiceStatus.PUBLISHED,
  },
  {
    categoryId: 'moving',
    title: 'Same-Day Moving Help',
    description: 'Two-person crew for apartments and small homes.',
    imageUrl:
      'https://images.unsplash.com/photo-1600518464441-9154a4dea21b?auto=format&fit=crop&w=800&q=80',
    address: 'Westside, Harbor Ave',
    lat: 40.735,
    lng: -74.02,
    radiusKm: 20,
    priceAmount: 67,
    priceUnit: PriceUnit.PROJECT,
    availability: weekdays,
    status: ServiceStatus.PUBLISHED,
  },
  {
    categoryId: 'cleaning',
    title: 'Evening Home Cleaning',
    description: 'Kitchen, bathrooms, and living areas after work hours.',
    imageUrl:
      'https://images.unsplash.com/photo-1581578731548-c64695cc6952?auto=format&fit=crop&w=800&q=80',
    address: 'North Park Residences',
    lat: 40.75,
    lng: -73.99,
    radiusKm: 8,
    priceAmount: 45,
    priceUnit: PriceUnit.HOUR,
    availability: weekdays,
    status: ServiceStatus.DRAFT,
  },
  {
    categoryId: 'outdoor',
    title: 'Weekend Lawn Care',
    description: 'Mowing, edging, and basic yard cleanup.',
    imageUrl:
      'https://images.unsplash.com/photo-1558904541-efa843a96f01?auto=format&fit=crop&w=800&q=80',
    address: 'Garden Hills',
    lat: 40.7,
    lng: -74.01,
    radiusKm: 15,
    priceAmount: 139,
    priceUnit: PriceUnit.FLAT,
    availability: weekdays,
    status: ServiceStatus.SUSPENDED,
  },
  {
    categoryId: 'assembly',
    title: 'Furniture Assembly',
    description: 'Book trusted help for furniture assembly.',
    imageUrl:
      'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=800&q=80',
    address: '14 Mercer St, SoHo, New York',
    lat: 40.7215,
    lng: -74.0012,
    radiusKm: 12,
    priceAmount: 49,
    priceUnit: PriceUnit.PROJECT,
    availability: weekdays,
    status: ServiceStatus.PUBLISHED,
  },
  {
    categoryId: 'assembly',
    title: 'IKEA Assembly',
    description: 'Book trusted help for ikea assembly.',
    imageUrl: '/services/ikea-assembly.jpg',
    address: '120 Market St, Downtown',
    lat: 40.7128,
    lng: -74.006,
    radiusKm: 12,
    priceAmount: 55,
    priceUnit: PriceUnit.PROJECT,
    availability: weekend,
    status: ServiceStatus.PUBLISHED,
  },
  {
    categoryId: 'assembly',
    title: 'Desk Assembly',
    description: 'Book trusted help for desk assembly.',
    imageUrl:
      'https://images.unsplash.com/photo-1518455027359-f3f8164ba6bd?auto=format&fit=crop&w=800&q=80',
    address: '88 Harbor Ave, Westside',
    lat: 40.735,
    lng: -74.02,
    radiusKm: 12,
    priceAmount: 45,
    priceUnit: PriceUnit.PROJECT,
    availability: weekdays,
    status: ServiceStatus.PUBLISHED,
  },
  {
    categoryId: 'assembly',
    title: 'Bookshelf Assembly',
    description: 'Book trusted help for bookshelf assembly.',
    imageUrl:
      'https://images.unsplash.com/photo-1594620302200-9a762244a156?auto=format&fit=crop&w=800&q=80',
    address: '210 North Park Ave',
    lat: 40.75,
    lng: -73.99,
    radiusKm: 12,
    priceAmount: 49,
    priceUnit: PriceUnit.PROJECT,
    availability: weekend,
    status: ServiceStatus.PUBLISHED,
  },
  {
    categoryId: 'moving',
    title: 'Help Moving',
    description: 'Book trusted help for help moving.',
    imageUrl:
      'https://images.unsplash.com/photo-1600518464441-9154a4dea21b?auto=format&fit=crop&w=800&q=80',
    address: '45 Garden Hills Rd',
    lat: 40.7,
    lng: -74.01,
    radiusKm: 12,
    priceAmount: 67,
    priceUnit: PriceUnit.PROJECT,
    availability: weekdays,
    status: ServiceStatus.PUBLISHED,
  },
  {
    categoryId: 'cleaning',
    title: 'Home & Apartment Cleaning',
    description: 'Book trusted help for home & apartment cleaning.',
    imageUrl:
      'https://images.unsplash.com/photo-1581578731548-c64695cc6952?auto=format&fit=crop&w=800&q=80',
    address: '9 Riverside Dr, Midtown West',
    lat: 40.775,
    lng: -73.985,
    radiusKm: 12,
    priceAmount: 49,
    priceUnit: PriceUnit.PROJECT,
    availability: weekend,
    status: ServiceStatus.PUBLISHED,
  },
  {
    categoryId: 'outdoor',
    title: 'Lawn Care',
    description: 'Book trusted help for lawn care.',
    imageUrl:
      'https://images.unsplash.com/photo-1558904541-efa843a96f01?auto=format&fit=crop&w=800&q=80',
    address: '330 Brooklyn Heights Blvd',
    lat: 40.696,
    lng: -73.993,
    radiusKm: 12,
    priceAmount: 49,
    priceUnit: PriceUnit.PROJECT,
    availability: weekdays,
    status: ServiceStatus.PUBLISHED,
  },
  {
    categoryId: 'repairs',
    title: 'Minor Plumbing Repairs',
    description: 'Book trusted help for minor plumbing repairs.',
    imageUrl:
      'https://images.unsplash.com/photo-1607472586893-edb57bdc0e39?auto=format&fit=crop&w=800&q=80',
    address: '18 Queens Plaza, Long Island City',
    lat: 40.75,
    lng: -73.94,
    radiusKm: 12,
    priceAmount: 74,
    priceUnit: PriceUnit.PROJECT,
    availability: weekend,
    status: ServiceStatus.PUBLISHED,
  },
  {
    categoryId: 'painting',
    title: 'Interior Painting',
    description: 'Book trusted help for interior painting.',
    imageUrl:
      'https://images.unsplash.com/photo-1562259949-e8e7689d7828?auto=format&fit=crop&w=800&q=80',
    address: '14 Mercer St, SoHo, New York',
    lat: 40.7215,
    lng: -74.0012,
    radiusKm: 12,
    priceAmount: 99,
    priceUnit: PriceUnit.PROJECT,
    availability: weekdays,
    status: ServiceStatus.PUBLISHED,
  },
  {
    categoryId: 'trending',
    title: 'Event Catering',
    description:
      'Buffet and plated catering for small gatherings, parties, and office events.',
    imageUrl:
      'https://images.unsplash.com/photo-1555244162-803834f70033?auto=format&fit=crop&w=800&q=80',
    address: 'Citywide catering kitchen',
    lat: 40.7128,
    lng: -74.006,
    radiusKm: 12,
    priceAmount: 199,
    priceUnit: PriceUnit.PROJECT,
    availability: weekend,
    status: ServiceStatus.PUBLISHED,
  },
];
