import { defineConfig } from 'vite'

export default defineConfig(({ mode }) => ({
  base: mode === 'production' ? '/mitos-de-chiloe/' : '/',
  server: { port: 5173, strictPort: false },
  build: {
    rollupOptions: {
      input: {
        hub: 'index.html',
        caleuche: 'games/caleuche.html',
        pincoya: 'games/pincoya.html',
        trauco: 'games/trauco.html',
        camahueto: 'games/camahueto.html',
        sirena: 'games/sirena.html',
        invunche: 'games/invunche.html',
        basilisco: 'games/basilisco.html',
        tenten: 'games/tenten.html',
        brujo: 'games/brujo.html',
        cuchivilu: 'games/cuchivilu.html',
        fiura: 'games/fiura.html',
        quicavi: 'games/quicavi.html',
        piuchen: 'games/piuchen.html',
        cesares: 'games/cesares.html',
        recta: 'games/recta.html',
        viuda: 'games/viuda.html',
        animas: 'games/animas.html',
      },
    },
  },
}))
