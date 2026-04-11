import AvatarViewer from "@/components/scene/avatar-viewer";

export default function HomePage() {
  return (
    <main
      id="main-content"
      className="relative h-screen w-screen overflow-hidden bg-zinc-950"
    >
      {/* Fondo de Viñeta Suave para dar profundidad */}
      <div className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(circle_at_center,transparent_30%,rgba(9,9,11,0.8)_100%)]" />

      {/* Visor 3D a pantalla completa */}
      <div className="absolute inset-0 z-0">
        <AvatarViewer />
      </div>

      {/* Capa de Interfaz Minimalista */}
      <div className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-between p-6 sm:p-10">
        {/* Encabezado muy sutil */}
        <header className="flex justify-center sm:justify-start">
          <div className="flex items-center gap-3 opacity-40 transition-opacity hover:opacity-100">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/5 ring-1 ring-white/10 backdrop-blur-md">
              <span className="text-[10px] font-bold tracking-[0.3em] text-white">
                AV
              </span>
            </div>
            <span className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-400">
              Aura Voice
            </span>
          </div>
        </header>

        {/* Controles de Voz Centrales */}
        <div className="flex flex-col items-center justify-end gap-8 pb-4 sm:pb-8">
          {/* Indicador de Estado */}
          <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-white/5 bg-black/20 px-5 py-2 backdrop-blur-xl transition-all">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
            </span>
            <span className="text-xs font-medium tracking-wide text-zinc-300">
              Lista para escuchar
            </span>
          </div>

          {/* Botón de Micrófono Principal */}
          <button
            className="pointer-events-auto group relative flex h-20 w-20 items-center justify-center rounded-full bg-white/5 text-zinc-300 ring-1 ring-white/10 backdrop-blur-2xl transition-all hover:scale-105 hover:bg-white/10 hover:text-white hover:ring-white/20 active:scale-95"
            aria-label="Hablar"
          >
            {/* Brillo sutil de fondo */}
            <div className="absolute inset-0 rounded-full bg-white/5 opacity-0 blur-xl transition-opacity group-hover:opacity-100" />
            
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="relative z-10 transition-transform group-hover:scale-110"
            >
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" x2="12" y1="19" y2="22" />
            </svg>
          </button>
        </div>
      </div>
    </main>
  );
}