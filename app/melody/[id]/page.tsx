import { redirect } from "next/navigation";
export default async function LegacyMelody({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/m/${encodeURIComponent(id)}`);
}
