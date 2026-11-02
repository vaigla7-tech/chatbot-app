export function AuthFrame({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-lilac/60 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-stroke bg-white p-6 shadow-sm">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/lendermarket-logo-black.svg" alt="Lendermarket" className="mb-5 h-6 w-auto" />
        <h1 className="mb-5 text-lg font-semibold">{title}</h1>
        {children}
      </div>
    </div>
  );
}
