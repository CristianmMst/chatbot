import AvatarViewer from "@/components/avatar-viewer";

export default function Home() {
  return (
    <main className="min-h-screen px-6 py-12 sm:px-10 sm:py-16">
      <section className="mx-auto grid w-full max-w-6xl gap-10 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)] lg:items-center">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-zinc-500">
            Avatar 3D
          </p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-zinc-950 sm:text-5xl">
            Visualizador base del avatar.
          </h1>
          <p className="mt-4 max-w-md text-base leading-7 text-zinc-600">
            El modelo `avatar.glb` se carga desde `public/models` usando
            Three.js, React Three Fiber y Drei, con renderizado solo del lado
            cliente.
          </p>
        </div>
        <AvatarViewer />
      </section>
    </main>
  );
}
