import Game from "../components/slowko/Game";

const Index = () => {
  return (
    <div className="min-h-screen relative">
      <div className="pointer-glow" aria-hidden="true" />
      <header className="sticky top-0 z-10 backdrop-blur supports-[backdrop-filter]:bg-background/70 border-b">
        <div className="container py-4 flex items-center justify-between">
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">Słówko — Wordle po polsku</h1>
          <nav aria-label="Nawigacja">
            <a className="story-link text-sm md:text-base" href="/">Zagraj</a>
          </nav>
        </div>
      </header>
      <main className="container max-w-3xl mx-auto px-4 py-8 md:py-12">
        <section aria-labelledby="gra-slowko" className="animate-fade-in">
          <h2 id="gra-slowko" className="sr-only">Gra Słówko</h2>
          <Game />
        </section>
      </main>
    </div>
  );
};

export default Index;
