/* ------------------------------------------------------------------ */
/*  GeoData Module – shared type definitions  (v2)                    */
/* ------------------------------------------------------------------ */

export interface CountryDef {
  code: string;
  name: string;
  bbox: [number, number, number, number];
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

export interface CategoryItem { key: string; label: string; }
export interface CategoryGroup { groupKey: string; groupLabel: string; items: CategoryItem[]; }

export const GEOAPIFY_CATEGORY_GROUPS: CategoryGroup[] = [
  { groupKey: "accommodation", groupLabel: "Szállás", items: [
    { key: "accommodation.hotel", label: "Hotel" },
    { key: "accommodation.hostel", label: "Hostel" },
    { key: "accommodation.motel", label: "Motel" },
    { key: "accommodation.guest_house", label: "Vendégház" },
    { key: "accommodation.apartment", label: "Apartman" },
    { key: "accommodation.chalet", label: "Faház" },
    { key: "accommodation.hut", label: "Kunyhó" },
  ]},
  { groupKey: "catering", groupLabel: "Vendéglátás", items: [
    { key: "catering.restaurant", label: "Étterem" },
    { key: "catering.cafe", label: "Kávézó" },
    { key: "catering.bar", label: "Bár" },
    { key: "catering.fast_food", label: "Gyorsétterem" },
    { key: "catering.biergarten", label: "Sörkert" },
    { key: "catering.pub", label: "Pub" },
  ]},
  { groupKey: "tourism", groupLabel: "Turizmus", items: [
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
  ]},
  { groupKey: "entertainment", groupLabel: "Szórakozás", items: [
    { key: "entertainment.cinema", label: "Mozi" },
    { key: "entertainment.theatre", label: "Színház" },
    { key: "entertainment.nightclub", label: "Éjszakai klub" },
    { key: "entertainment.casino", label: "Kaszinó" },
    { key: "entertainment.water_park", label: "Aquapark" },
  ]},
  { groupKey: "leisure", groupLabel: "Szabadidő", items: [
    { key: "leisure.park", label: "Park" },
    { key: "leisure.playground", label: "Játszótér" },
    { key: "leisure.spa", label: "Fürdő/Spa" },
    { key: "leisure.picnic", label: "Piknikterület" },
  ]},
  { groupKey: "sport", groupLabel: "Sport", items: [
    { key: "sport.swimming_pool", label: "Uszoda" },
    { key: "sport.stadium", label: "Stadion" },
    { key: "sport.fitness", label: "Fitnesz" },
    { key: "sport.golf", label: "Golf" },
    { key: "sport.tennis", label: "Tenisz" },
  ]},
  { groupKey: "natural", groupLabel: "Természet", items: [
    { key: "natural.beach", label: "Strand" },
    { key: "natural.cave_entrance", label: "Barlang" },
    { key: "natural.spring", label: "Forrás" },
    { key: "natural.water.lake", label: "Tó" },
    { key: "natural.forest", label: "Erdő" },
  ]},
];

export const TOMTOM_CATEGORY_GROUPS: CategoryGroup[] = [
  { groupKey: "accommodation", groupLabel: "Szállás", items: [
    { key: "hotel/motel", label: "Hotel/Motel" },
    { key: "bed breakfast guest houses", label: "Panzió/Vendégház" },
    { key: "hostel", label: "Hostel" },
    { key: "holiday rental", label: "Nyaralóház" },
    { key: "camping ground", label: "Kemping" },
    { key: "cabins lodges", label: "Faház" },
    { key: "resort", label: "Resort" },
  ]},
  { groupKey: "catering", groupLabel: "Vendéglátás", items: [
    { key: "restaurant", label: "Étterem" },
    { key: "café", label: "Kávézó" },
    { key: "bar", label: "Bár" },
    { key: "fast food", label: "Gyorsétterem" },
    { key: "microbrewery/beer garden", label: "Sörkert/Sörfőzde" },
    { key: "pub", label: "Pub" },
    { key: "winery", label: "Borászat" },
    { key: "vineyard", label: "Szőlőbirtok" },
  ]},
  { groupKey: "tourism", groupLabel: "Turizmus", items: [
    { key: "important tourist attraction", label: "Fontos látnivaló" },
    { key: "museum", label: "Múzeum" },
    { key: "castle", label: "Kastély/Vár" },
    { key: "monument", label: "Emlékmű" },
    { key: "historic site", label: "Történelmi hely" },
    { key: "natural attraction", label: "Természeti látnivaló" },
  ]},
  { groupKey: "entertainment", groupLabel: "Szórakozás", items: [
    { key: "theater", label: "Színház" },
    { key: "cinema", label: "Mozi" },
    { key: "casino", label: "Kaszinó" },
    { key: "amusement park", label: "Vidámpark" },
    { key: "zoo", label: "Állatkert" },
    { key: "nightlife", label: "Éjszakai élet" },
  ]},
  { groupKey: "leisure", groupLabel: "Szabadidő / Wellness", items: [
    { key: "park recreation area", label: "Park/rekreáció" },
    { key: "spa", label: "Fürdő/Spa" },
    { key: "mineral/hot springs", label: "Gyógyfürdő" },
    { key: "beach", label: "Strand" },
    { key: "beach club", label: "Strandklub" },
  ]},
  { groupKey: "sport", groupLabel: "Sport", items: [
    { key: "swimming pool", label: "Uszoda" },
    { key: "golf course", label: "Golfpálya" },
    { key: "stadium", label: "Stadion" },
    { key: "water sport", label: "Vízi sport" },
    { key: "athletic field", label: "Sportpálya" },
    { key: "ice skating rink", label: "Jégpálya" },
  ]},
];

export type GeoProvider = "geoapify" | "tomtom";

export interface GeoFetchRequest { provider: GeoProvider; countryCode: string; category: string; }
export interface GeoFetchResponse { provider: GeoProvider; countryCode: string; category: string; inserted: number; skipped: number; total: number; errors: string[]; }
export interface GeoStatsResponse { geoapify_count: number; tomtom_count: number; unified_count: number; geoapify_by_country: Record<string, number>; tomtom_by_country: Record<string, number>; unified_by_country: Record<string, number>; }
export interface GeoMergeRequest { provider: GeoProvider; countryCode?: string; }
export interface GeoMergeResponse { inserted: number; updated: number; skipped: number; errors: string[]; }

export function getCategoryGroups(provider: GeoProvider): CategoryGroup[] {
  return provider === "geoapify" ? GEOAPIFY_CATEGORY_GROUPS : TOMTOM_CATEGORY_GROUPS;
}
export function getAllCategoryKeys(groups: CategoryGroup[]): string[] {
  return groups.flatMap((g) => g.items.map((i) => i.key));
}
