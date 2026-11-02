import type * as React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { formatoPrecio, normalizar } from '../lib/catalogo';

type Entrada = { slug: string; nombre: string; descripcion: string; precio: number; foto: string; texto: string };

const SUGERENCIAS = ['Giratoria', 'Flor', 'Perla', 'Corazón', 'Argollas', 'Dorado'];

export default function SearchOverlay() {
  const [abierto, setAbierto] = useState(false);
  const [q, setQ] = useState('');
  const [indice, setIndice] = useState<Entrada[] | null>(null);
  const campo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const abrir = () => setAbierto(true);
    window.addEventListener('midam:buscar', abrir);
    return () => window.removeEventListener('midam:buscar', abrir);
  }, []);

  useEffect(() => {
    document.body.classList.toggle('sin-scroll', abierto);
    if (!abierto) return;
    campo.current?.focus();
    if (!indice) fetch('/indice.json').then((r) => r.json() as Promise<Entrada[]>).then(setIndice).catch(() => setIndice([]));
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && setAbierto(false);
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [abierto, indice]);

  const resultados = useMemo(() => {
    const terminos = normalizar(q).split(/\s+/).filter(Boolean);
    if (!terminos.length || !indice) return [];
    return indice.filter((p) => terminos.every((t) => p.texto.includes(t)));
  }, [q, indice]);

  const ir = (e: React.FormEvent) => {
    e.preventDefault();
    if (q.trim()) window.location.href = `/buscar?q=${encodeURIComponent(q.trim())}`;
  };

  return (
    <>
      <div className={`velo ${abierto ? 'velo--abierto' : ''}`} onClick={() => setAbierto(false)} />
      <div className={`buscador ${abierto ? 'buscador--abierto' : ''}`} role="dialog" aria-modal="true" aria-label="Buscar en la tienda">
        <div className="contenedor">
          <form className="buscador__fila" role="search" onSubmit={ir}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>
            <input ref={campo} type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="¿A quién buscás?" aria-label="Buscar" autoComplete="off" />
            <button type="button" className="icono-boton" aria-label="Cerrar buscador" onClick={() => setAbierto(false)}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </form>

          {!q.trim() && (
            <div className="buscador__sugerencias">
              {SUGERENCIAS.map((s) => (
                <button key={s} type="button" className="pildora" onClick={() => setQ(s)}>{s}</button>
              ))}
            </div>
          )}

          {q.trim() && indice && resultados.length === 0 && <p className="buscador__vacio">Esa no está en el elenco. Probá con otra palabra.</p>}

          {resultados.length > 0 && (
            <>
              <p className="buscador__titulo etiqueta" aria-live="polite">{resultados.length} {resultados.length === 1 ? 'pieza' : 'piezas'}</p>
              <ul className="buscador__resultados">
                {resultados.slice(0, 8).map((p) => (
                  <li key={p.slug}>
                    <a className="tarjeta" href={`/productos/${p.slug}`}>
                      <span className="tarjeta__foto"><img src={p.foto} alt="" width={420} height={525} loading="lazy" /></span>
                      <span className="tarjeta__meta">
                        <span className="tarjeta__nombre" style={{ fontFamily: 'var(--f-titulo)' }}>{p.nombre}</span>
                        <span className="tarjeta__descripcion">{p.descripcion}</span>
                        <span className="precio">{formatoPrecio(p.precio)}</span>
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
              {resultados.length > 8 && <a className="enlace buscador__todos" href={`/buscar?q=${encodeURIComponent(q.trim())}`}>Ver las {resultados.length}</a>}
            </>
          )}
        </div>
      </div>
    </>
  );
}

