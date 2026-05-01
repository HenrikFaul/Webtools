import { NewsScoutLab } from "@/features/news-scout/components/NewsScoutLab";

export const metadata = {
  title: "Hírfelderítő Motor – Webtools",
};

export default function NewsScoutPage() {
  return (
    <main className="shell">
      <NewsScoutLab />
    </main>
  );
}
