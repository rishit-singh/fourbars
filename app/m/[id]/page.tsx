import { Melody } from "@/components/Melody";
export default async function MelodyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Melody id={id} />;
}
