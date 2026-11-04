import { formatoPrecio, notaStock, numeroElenco, type Producto } from '../lib/catalogo';

export function IconoGiro({ tamano = 16 }: { tamano?: number }) {
  return (
    <svg width={tamano} height={tamano} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 12a8 8 0 1 1-2.6-5.9" />
      <path d="M20 3v4h-4" />
    </svg>
  );
}

type Props = { producto: Producto; ancho?: string; prioridad?: boolean };

export default function ProductCard({ producto: p, ancho = '(min-width: 1200px) 22vw, (min-width: 768px) 30vw, 48vw', prioridad = false }: Props) {
  const queda = notaStock(p.stock);
  const principal = p.fotos[0];
  const segunda = p.fotos[1];
  const alt = `${p.descripcion}: ${p.nombre}`;
  return (
    <a className="tarjeta" href={`/productos/${p.slug}`}>
      <span className="tarjeta__foto">
        <img
          src={principal.s}
          srcSet={`${principal.s} 420w, ${principal.m} 840w`}
          sizes={ancho}
          alt={alt}
          width={420}
          height={525}
          loading={prioridad ? 'eager' : 'lazy'}
          decoding="async"
        />
        {segunda && <img className="tarjeta__segunda" src={segunda.s} alt="" width={420} height={525} loading="lazy" decoding="async" />}
        <span className="tarjeta__numero">{numeroElenco(p.numero)}</span>
        {p.lineas.includes('giratoria') && (
          <span className="tarjeta__gira" title="Tiene una parte que gira">
            <IconoGiro />
            <span className="oculto">Pieza giratoria</span>
          </span>
        )}
      </span>
      <span className="tarjeta__meta">
        <span className="tarjeta__nombre" style={{ fontFamily: 'var(--f-titulo)' }}>{p.nombre}</span>
        <span className="tarjeta__descripcion">{p.descripcion}</span>
        <span className="tarjeta__pie">
          <span className="precio">{p.precioLista && <s className="precio-lista">{formatoPrecio(p.precioLista)}</s>}{formatoPrecio(p.precio)}</span>
          {queda && <span className="queda">{queda}</span>}
        </span>
      </span>
    </a>
  );
}
