import { useSyncExternalStore } from 'react';
import { leerBolsa, leerBolsaServidor, suscribir } from '../lib/bolsa';

export default function BagButton() {
  const items = useSyncExternalStore(suscribir, leerBolsa, leerBolsaServidor);
  const unidades = items.reduce((a, i) => a + i.cantidad, 0);
  return (
    <button
      type="button"
      className="icono-boton"
      style={{ position: 'relative' }}
      aria-label={unidades ? `Abrir bolsa, ${unidades} ${unidades === 1 ? 'pieza' : 'piezas'}` : 'Abrir bolsa'}
      onClick={() => window.dispatchEvent(new Event('midam:bolsa'))}
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M5 8h14l1 12H4L5 8Z" />
        <path d="M9 10V7a3 3 0 0 1 6 0v3" />
      </svg>
      {unidades > 0 && <span className="contador">{unidades}</span>}
    </button>
  );
}
