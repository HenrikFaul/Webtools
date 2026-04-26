import { GeoDataLab } from "@/features/geodata/components/GeoDataLab";

export default function GeoDataPage() {
  return (
    <main className="shell">
      <h1>GeoData – POI Címadatbázis</h1>
      <p className="muted">
        Turisztikai POI-k (szállás, étterem, látnivaló, szórakozás, sport, természet) beszerzése
        Geoapify és TomTom szolgáltatóktól, ellenőrzése, majd egyesített címtáblába töltése.
      </p>
      <GeoDataLab />
    </main>
  );
}
