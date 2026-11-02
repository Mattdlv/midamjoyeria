# Design System: Midam Joyería

**Estado:** propuesta implementada en este prototipo, para aprobación.
**Fuentes:** informe de auditoría, `PLAN_DESARROLLO_ECOMMERCE.md` (sección 5) y el material real del catálogo de Treinta (67 productos publicados, 106 fotos y logo, leídos el 2/11/2026).

## 1. Concepto: "El elenco"

Cada joya de Midam tiene nombre de personaje. La tienda se plantea como el **programa de mano de una obra**: un reparto numerado (Nº 14), una cartelera de categorías, entradas para regalar. Lo elegí por tres razones:

- **Sale del negocio real:** el informe propone la "colección de personajes" y todo el catálogo ya usa esos nombres.
- **Es difícil de confundir con una plantilla:** ninguna tienda comparada tiene una estructura así.
- **Sobrevive a un cambio de nombres:** si el cliente cambia los nombres de terceros, el número, la cartelera y las entradas siguen funcionando, y las URLs ya no los usan.

**Tono visual:** "el Instagram de Midam, pero ordenado". El papel crema y la tipografía aportan "la belleza de lo esencial". Las fotos azules, los garabatos y las frases del feed aportan el humor.

## 2. Lo que encontré en el material real

| Hallazgo | Decisión de diseño |
| --- | --- |
| Las fotos tienen fondos azul saturado, tornasol y lila | Son la firma visual. La interfaz queda sobria (crema y tinta) para que ellas pongan el color |
| El logo mide `#ABE0E5`, más saturado que el `#CFE8EE` estimado en el plan | Se adopta el valor medido |
| 30 productos tienen texto o arroba sobre la foto | Recorte temporal para quitarlos, marcado por producto; la solución real es fotografiarlos de nuevo |
| Solo hay logo en PNG de 486 px, con efecto 3D | Se usa como sello a tamaño chico; falta el vector |
| Algunas fotos adicionales muestran otro color o modelo (Ravenna, Silenus, Goneril, Enigma, Gothel, Soraya, Narkissa) | El selector de variante cambia la foto |
| Casi todas las piezas tienen stock 1 o 2 | No se usa etiqueta de "últimas unidades", que aparecería en casi toda la grilla; va como texto discreto ("Queda 1") |
| Hay tres piezas de la línea giratoria, no dos: Soraya, Narkissa y Lilith (anillo "antiestrés", $6.000, stock 15) | Según la regla del plan (menos de 6), "Giratorias" es una página editorial |

## 3. Estructura

```text
Inicio
├── Tienda              /tienda
│   ├── Anillos (18)    /tienda/anillos
│   ├── Aros (26)       /tienda/aros
│   ├── Collares (16)   /tienda/collares
│   └── Pulseras (7)    /tienda/pulseras
├── Giratorias          /giratorias          editorial, 3 piezas
├── Para regalar        /para-regalar        por rango de precio
├── Guía de talles      /guia-de-talles
├── Nosotros            /nosotros
├── Ayuda               /ayuda
├── Producto            /productos/[slug]
├── Búsqueda            /buscar  + buscador superpuesto
└── Bolsa               panel lateral (sin checkout en esta fase)
```

"Sets y packs" no aparece porque la categoría SET del catálogo no tiene productos. "Novedades" queda oculta hasta la primera tanda nueva, como indica el plan.

## 4. Tokens

Definidos en `src/styles/tokens.css`. Contraste medido según WCAG 2.

| Token | Valor | Uso | Contraste |
| --- | --- | --- | --- |
| `--papel` | `#FAF6EE` | Fondo | — |
| `--blanco` | `#FFFFFF` | Campos | — |
| `--agua` | `#ABE0E5` | Marca, medido en el logo | — |
| `--agua-suave` | `#DDF1F3` | Bloques suaves | — |
| `--tinta` | `#1E3A5F` | Texto y botón principal | 10,67:1 sobre papel; 7,26:1 sobre agua |
| `--tinta-suave` | `#4F6074` | Texto secundario | 5,98:1 sobre papel |
| `--linea` | `#7A8A9B` | Borde de campos | 3,28:1 sobre papel |
| `--oro` | `#C8A15A` | Solo decorativo | 2,24:1: nunca en texto |
| `--oro-texto` | `#7D5F26` | Texto dorado | 5,51:1 sobre papel |
| `--rojo` | `#C23B3B` | Detalles y errores | 4,89:1 sobre papel; no en texto chico sobre agua |
| `--exito` | `#2E6B4F` | Confirmaciones | 5,85:1 sobre papel |
| `--mar` | `#177FE3` | Rayas decorativas, medido en las fotos | Solo decorativo |

**Tornasol:** degradé `#B1CBD7 → #E6D9E8 → #C9E4DC`, medido en los fondos de foto. Se usa solo en un bloque por pantalla.

### Tipografía

| Rol | Fuente | Uso |
| --- | --- | --- |
| Títulos y nombres | Fraunces variable | Cursiva para el énfasis |
| Texto y precios | DM Sans variable | Cifras tabulares en precios |
| Acento | Caveat | Notas breves; nunca en precios, botones ni datos |

Las fuentes se alojan en el sitio. Escala fluida: `--t-display` (44–112 px), `--t-h1` (34–64), `--t-h2` (28–44), `--t-h3` (20–24), cuerpo 16, detalle 14. Ningún texto baja de 14 px, salvo las etiquetas en mayúsculas (13 px) y el número de elenco.

### Espacio y forma

- **Escala:** `4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 · 96`.
- **Márgenes:** 16 px en celular, 24 en tablet, 32 en escritorio. Ancho máximo: 1320 px.
- **Radios:** 8 px en tarjetas y campos. Píldora solo en filtros. Arco solo en la foto principal.
- **Fotos:** siempre 4:5.
- **Grilla:** 2 / 3 / 4 columnas.

## 5. Componentes

| Componente | Archivo | Notas |
| --- | --- | --- |
| Base de página | `layouts/Base.astro` | Metadatos, fuentes, islas globales |
| Encabezado y menú | `components/Header.astro` | Menú a pantalla completa en celular |
| Pie | `components/Footer.astro` | |
| Tarjeta de producto | `components/ProductCard.tsx` | Número, foto con cambio al pasar, stock discreto |
| Explorador de catálogo | `components/CatalogBrowser.tsx` | Filtros, orden, estados vacíos, URL compartible |
| Buscador | `components/SearchOverlay.tsx` | Superpuesto, con carga diferida del índice |
| Bolsa | `components/Bag.tsx`, `BagButton.tsx` | Guarda en el navegador |
| Agregar a la bolsa | `components/AddToBag.tsx` | Variantes y barra fija en celular |
| Galería | `components/Gallery.astro` | Deslizable en celular, miniaturas en escritorio |
| Garabatos | `components/Doodle.astro` | Corazón, destello, espiral, estrella y flecha, como en el feed |
| Encabezado de sección | `components/SectionHead.astro` | |
| Entrada | `components/Ticket.astro` | Rango de precio con muescas |
| Franja de rayas | `components/Stripes.astro` | Rayas azules con un detalle rojo, como en el feed |
| Sello giratorio | `components/SpinBadge.astro` | Texto circular que gira |
| WhatsApp flotante | `components/WhatsAppFloat.astro` | Mensaje con el contexto de la página |
| Contenido pendiente | `components/Pending.astro` | Lo que falta del cliente queda a la vista |

## 6. Estados y microinteracciones

| Estado | Comportamiento |
| --- | --- |
| Pasar el cursor | La tarjeta muestra la segunda foto; el título se subraya |
| Foco | Contorno de 2 px en tinta con 2 px de separación |
| Presionado | Botón se hunde 1 px, sin mover el diseño |
| Sin resultados | Mensaje con la voz de la marca y salida a limpiar filtros |
| Bolsa vacía | "Salir sin accesorios, jamás." |
| Agregar | Aviso: "Goneril ya está en tu bolsa" |
| Tope de stock | Botón "+" inhabilitado y texto explícito |

- **Duración:** 200–300 ms, solo `opacity` y `transform`.
- **Reducir movimiento:** se quitan el giro del sello y las transiciones.
- **Sin** carruseles automáticos, parallax ni animaciones de entrada.

## 7. Reglas de contenido

Estas reglas salen del informe y están aplicadas en el código:

- **Material:** no se escribe "acero quirúrgico", "hipoalergénico" ni "no se oxida". Solo aparece "acero" en las 8 piezas donde el catálogo lo declara. Por eso el filtro es por **tono** (lo que se ve en la foto), no por material.
- **Línea giratoria:** "para manos inquietas". Nunca "antiestrés" ni "antiansiedad" como beneficio.
- **Reseñas, envíos gratis y garantías:** no aparecen porque no hay datos reales.
- **Frases de marca:** las que se presentan como dichas por Midam (carteles y notas de grilla) salen del feed. El resto de los textos de interfaz son borradores míos con esa voz, para aprobar.
- **Descripciones:** escritas mirando cada foto. Son borradores para que el cliente corrija.
