import { defineConfig } from 'vite'

export default defineConfig({
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
      },
    },
  },
})
