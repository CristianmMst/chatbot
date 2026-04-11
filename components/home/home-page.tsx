import AvatarExperience from "@/components/home/avatar-experience";

export default function HomePage() {
  return (
    <main
      id="main-content"
      className="relative h-screen w-screen overflow-hidden bg-zinc-950"
    >
      {/* Fondo de Viñeta Suave para dar profundidad */}
      <div className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(circle_at_center,transparent_30%,rgba(9,9,11,0.8)_100%)]" />

      <AvatarExperience />
    </main>
  );
}
