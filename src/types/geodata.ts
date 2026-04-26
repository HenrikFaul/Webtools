/* ------------------------------------------------------------------ */
/*  GeoData Module – shared type definitions                          */
/* ------------------------------------------------------------------ */

/** Countries supported with bounding boxes for Geoapify rect filter */
export interface CountryDef {
  code: string;       // ISO 3166-1 alpha-2
  name: string;
  bbox: [number, number, number, number]; // [lon1, lat1, lon2, lat2]
}

export const SUPPORTED_COUNTRIES: CountryDef[] = [
  { code: "HU", name: "Magyarország",  bbox: [16.11, 45.74, 22.90, 48.59] },
  { code: "AT", name: "Ausztria",      bbox: [9.53, 46.37, 17.16, 49.02] },
  { code: "SK", name: "Szlovákia",     bbox: [16.84, 47.73, 22.57, 49.61] },
  { code: "RO", name: "Románia",       bbox: [20.22, 43.62, 29.69, 48.27] },
  { code: "HR", name: "Horvátország",  bbox: [13.49, 42.39, 19.45, 46.55] },
  { code: "RS", name: "Szerbia",       bbox: [18.82, 42.23, 23.01, 46.19] },
  { code: "SI", name: "Szlovénia",     bbox: [13.38, 45.42, 16.60, 46.88] },
  { code: "CZ", name: "Csehország",    bbox: [12.09, 48.55, 18.86, 51.06] },
  { code: "UA", name: "Ukrajna",       bbox: [22.14, 44.39, 40.22, 52.38] },
  { code: "PL", name: "Lengyelország", bbox: [14.12, 49.00, 24.15, 54.84] },
];

/** Geoapify travel/tourism category groups */
export interface CategoryGroup {
  key: string;
  label: string;
  subcategories: { key: string; label: string }[];
}

export const GEOAPIFY_TOURISM_CATEGORIES: CategoryGroup[] = [
  {
    key: "accommodation",
    label: "Szállás",
    subcategories: [
      { key: "accommodation.hotel", label: "Hotel" },
      { key: "accommodation.hostel", label: "Hostel" },
      { key: "accommodation.motel", label: "Motel" },
      { key: "accommodation.guest_house", label: "Vendégház" },
      { key: "accommodation.apartment", label: "Apartman" },
      { key: "accommodation.chalet", label: "Faház" },
      { key: "accommodation.hut", label: "Kunyhó" },
    ]
  },
  {
    key: "catering",
    label: "Vendéglátás",
    subcategories: [
      { key: "catering.restaurant", label: "Étterem" },
      { key: "catering.cafe", label: "Kávézó" },
      { key: "catering.bar", label: "Bár" },
      { key: "catering.fast_food", label: "Gyorsétterem" },
      { key: "catering.biergarten", label: "Sörkert" },
      { key: "catering.pub", label: "Pub" },
    ]
  },
  {
    key: "tourism",
    label: "Turizmus",
    subcategories: [
      { key: "tourism.attraction", label: "Látnivaló" },
      { key: "tourism.sights", label: "Nevezetesség" },
      { key: "tourism.information", label: "Turista info" },
      { key: "tourism.attraction.castle", label: "Kastély/Vár" },
      { key: "tourism.attraction.gallery", label: "Galéria" },
      { key: "tourism.attraction.museum", label: "Múzeum" },
      { key: "tourism.attraction.viewpoint", label: "Kilátó" },
      { key: "tourism.attraction.zoo", label: "Állatkert" },
      { key: "tourism.attraction.aquarium", label: "Akvárium" },
      { key: "tourism.attraction.theme_park", label: "Vidámpark" },
    ]
  },
  {
    key: "entertainment",
    label: "Szórakozás",
    subcategories: [
      { key: "entertainment.cinema", label: "Mozi" },
      { key: "entertainment.theatre", label: "Színház" },
      { key: "entertainment.nightclub", label: "Éjszakai klub" },
      { key: "entertainment.casino", label: "Kaszinó" },
      { key: "entertainment.water_park", label: "Aquapark" },
    ]
  },
  {
    key: "leisure",
    label: "Szabadidő",
    subcategories: [
      { key: "leisure.park", label: "Park" },
      { key: "leisure.playground", label: "Játszótér" },
      { key: "leisure.spa", label: "Fürdő/Spa" },
      { key: "leisure.picnic", label: "Piknikterület" },
    ]
  },
  {
    key: "sport",
    label: "Sport",
    subcategories: [
      { key: "sport.swimming_pool", label: "Uszoda" },
      { key: "sport.stadium", label: "Stadion" },
      { key: "sport.fitness", label: "Fitnesz" },
      { key: "sport.golf", label: "Golf" },
      { key: "sport.tennis", label: "Tenisz" },
    ]
  },
  {
    key: "natural",
    label: "Természet",
    subcategories: [
      { key: "natural.beach", label: "Strand" },
      { key: "natural.cave_entrance", label: "Barlang" },
      { key: "natural.spring", label: "Forrás" },
      { key: "natural.water.lake", label: "Tó" },
      { key: "natural.forest", label: "Erdő" },
    ]
  },
];

/** TomTom tourism-relevant categories */
export const TOMTOM_TOURISM_CATEGORIES: { key: string; label: string }[] = [
  { key: "hotel/motel", label: "Hotel/Motel" },
  { key: "bed breakfast guest houses", label: "Panzió/Vendégház" },
  { key: "hostel", label: "Hostel" },
  { key: "holiday rental", label: "Nyaralóház" },
  { key: "camping ground", label: "Kemping" },
  { key: "cabins lodges", label: "Faház" },
  { key: "resort", label: "Resort" },
  { key: "restaurant", label: "Étterem" },
  { key: "café", label: "Kávézó" },
  { key: "bar", label: "Bár" },
  { key: "fast food", label: "Gyorsétterem" },
  { key: "important tourist attraction", label: "Fontos látnivaló" },
  { key: "museum", label: "Múzeum" },
  { key: "castle", label: "Kastély/Vár" },
  { key: "monument", label: "Emlékmű" },
  { key: "theater", label: "Színház" },
  { key: "cinema", label: "Mozi" },
  { key: "casino", label: "Kaszinó" },
  { key: "amusement park", label: "Vidámpark" },
  { key: "zoo", label: "Állatkert" },
  { key: "beach", label: "Strand" },
  { key: "beach club", label: "Strandklub" },
  { key: "water sport", label: "Vízi sport" },
  { key: "swimming pool", label: "Uszoda" },
  { key: "golf course", label: "Golfpálya" },
  { key: "stadium", label: "Stadion" },
  { key: "spa", label: "Fürdő/Spa" },
  { key: "mineral/hot springs", label: "Gyógyfürdő" },
  { key: "park recreation area", label: "Park/rekreáció" },
  { key: "winery", label: "Borászat" },
  { key: "vineyard", label: "Szőlőbirtok" },
];

/** Provider enum */
export type GeoProvider = "geoapify" | "tomtom";

/** Shape of a POI row in the UI */
export interface PoiRow {
  id: string;
  name: string | null;
  categories: string[];
  country_code: string;
  formatted_address: string | null;
  lat: number;
  lon: number;
  phone: string | null;
  website: string | null;
  fetched_at: string;
  fetch_category: string | null;
}

/** Fetch request */
export interface GeoFetchRequest {
  provider: GeoProvider;
  countryCode: string;
  category: string;
}

/** Fetch response */
export interface GeoFetchResponse {
  provider: GeoProvider;
  countryCode: string;
  category: string;
  inserted: number;
  skipped: number;
  errors: string[];
}

/** Stats response */
export interface GeoStatsResponse {
  geoapify_count: number;
  tomtom_count: number;
  unified_count: number;
  geoapify_by_country: Record<string, number>;
  tomtom_by_country: Record<string, number>;
  unified_by_country: Record<string, number>;
}

/** Merge request */
export interface GeoMergeRequest {
  provider: GeoProvider;
  countryCode?: string;
}

/** Merge response */
export interface GeoMergeResponse {
  inserted: number;
  updated: number;
  skipped: number;
  errors: string[];
}
