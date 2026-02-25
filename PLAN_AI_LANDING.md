# 🚀 Plan de Implementación Maestro: Woox AI Landing Builder

Un constructor de páginas web impulsado por IA, diseñado para convertir visitantes en clientes a través de WhatsApp/Telegram usando el motor de agentes IA de Woox. Integración nativa con documentos del cliente, plantillas por industria y estéticas premium.

---

## �️ Arquitectura de Plantillas por Industria (Industry-Specific Layouts)

Cuando la IA procesa el documento o recibe el nombre de la empresa, su **primera decisión** será clasificar la industria (`industry_type`). Basado en eso, seleccionará automáticamente una de nuestras plantillas base, cambiando el orden de los bloques y la interfaz para maximizar la conversión según el modelo de negocio.

### 1. Restaurantes / Gastronomía 🍔
* **Vibra:** Apetitoso, dinámico, colores cálidos.
* **Estructura del Layout:**
    * **Hero:** Imagen de plato estrella a pantalla completa + Botón "Ver Menú / Pedir ahora".
    * **Menú Destacado (Catálogo Woox):** Grid visual con los Top 6 productos y precios inyectados desde la BD.
    * **Ofertas / Combos:** Banner temporal generado por IA.
    * **Ubicación y Horarios:** Mapa y horarios de atención claros.

### 2. Hoteles / Turismo / AirBnb 🏨
* **Vibra:** Lujo, descanso, inmersivo, espacios en blanco, tipografías elegantes.
* **Estructura del Layout:**
    * **Hero:** Carrusel o video de fondo del lugar + Botón "Reservar Fechas".
    * **Amenidades (Features):** Iconos de Wifi, Piscina, Desayuno incluido.
    * **Tipos de Habitaciones:** Grid de fotos grandes (Conectado al catálogo de Woox como "habitaciones").
    * **Testimonios:** Pruebas sociales ("El mejor descanso de mi vida" simulado).
    * **Galería inmersiva:** Mosaico de fotos del lugar (obtenidas del PDF o Unsplash).

### 3. Servicios Profesionales / Consultorías / Agencias 💼
* **Vibra:** Confianza, corporativo, minimalista, colores fríos (azules/grises).
* **Estructura del Layout:**
    * **Hero:** Título prometiendo resultados concretos + Botón "Agendar Asesoría" (Lleva al Chatbot).
    * **Nosotros (Trust):** Por qué elegirnos + Logos de aliados.
    * **Nuestros Servicios:** 3 cajas descriptivas claras.
    * **Perfil del Experto:** Foto del consultor/dueño con una frase de impacto.
    * **Calendario/Lead Magnet:** Botón secundario para "Descargar guía gratuita".

### 4. Tiendas E-commerce (Retail / Moda) 🛍️
* **Vibra:** Muy visual, enfocado en el producto, minimalista (que la ropa/producto brille).
* **Estructura del Layout:**
    * **Hero:** "Nueva Colección" + Botón "Comprar Ahora".
    * **Categorías Principales:** Círculos o rectángulos (ej: "Zapatos", "Accesorios").
    * **Catálogo (Woox):** Grid de productos con etiqueta de "Agotado" o "Disponible".
    * **Promesa de Marca:** "Envíos nacionales", "Pagos seguros".

### 5. Salud y Bienestar (Spa / Odontólogos / Gimnasios) 🧘‍♀️
* **Vibra:** Limpio, pacífico o energético (según el caso), colores pastel o vibrantes.
* **Estructura del Layout:**
    * **Hero:** Imagen humana (sonrisa, relajación, ejercicio).
    * **Nuestros Tratamientos/Clases:** Listado visual.
    * **Antes y Después / Instalaciones:** Carrusel de contraste.
    * **Cita Rápida:** Botón directo al chatbot para separar agenda.

---

## �🏗️ Fase 1: Arquitectura de Base de Datos y Backend

**Objetivo:** Crear la estructura de datos dinámica capaz de soportar múltiples plantillas, bloques flexibles y configuración de URLs (subrutas).

**Tareas:**
1. **Crear tabla `ai_landing_pages` en Supabase:**
   * `id` (UUID, PK)
   * `merchant_id` (UUID, FK a merchants)
   * `slug` (TEXT, UNIQUE) -> Ejemplo: `burgerking` (Generará la URL `woox.ai/p/burgerking`).
   * `industry_type` (TEXT) -> Ej: `restaurant`, `hotel`, `services`, `ecommerce`, `health`.
   * `template_id` (TEXT) -> ID de la plantilla estructural asignada.
   * `theme_palette` (JSONB) -> Colores (`primary`, `secondary`, `background`, `text`, `accent`).
   * `typography` (TEXT) -> Familia de fuentes premium (ej. 'Inter', 'Outfit', 'Playfair Display').
   * `blocks_order` (JSONB) -> Array definiendo el orden de los componentes dictado por la plantilla (ej. `["hero_food", "catalog_grid", "offers", "location"]`).
   * `content_blocks` (JSONB) -> Contenido redactado por IA para cada bloque específico.
   * `logo_url` (TEXT)
   * `is_published` (BOOLEAN)
   * `custom_domain` (TEXT, nullable) -> Para futura expansión premium.

2. **Preparar APIs (Supabase Edge Functions / RPC):**
   * Endpoint `generate_landing_content`: Recibe texto/archivo y devuelve JSON estructurado con copies.
   * Endpoint `validate_slug`: Revisa disponibilidad de URL.
   * Endpoint `get_landing_data(slug)`: Devuelve todo el JSON público para renderizar la plantilla correcta.

---

## 🧠 Fase 2: Motor de Inteligencia Artificial (El Cerebro)

**Objetivo:** Desarrollar el sistema que lee el documento de la empresa, clasifica la industria, extrae conocimiento y genera todo el contenido segmentado por bloques de la plantilla seleccionada.

**Tareas:**
1. **Pipelines de Ingesta Documental:** 
   * Lógica para procesar PDF/Word/TXT o texto libre desde el Wizard.
2. **Prompts Nivel 1 (Clasificación Estratégica):**
   * Usar Gemini/OpenAI para analizar el documento y determinar exactamente en cuál de las 5 plantillas encaja el negocio.
   * Extraer Propuesta de Valor, Tono de Marca y Servicios Clave para llenar las variables de esa plantilla.
3. **Prompts Nivel 2 (Generador de Copies por Plantilla):**
   * Redactar los textos de acuerdo a la estética de la industria. (Ej: Lenguaje apetitoso para restaurantes, formal para consultorías).
4. **Alimentación Cruzada (Bonus):** 
   * Guardar automáticamente los datos extraídos en `merchant_context_blocks` para que el Chatbot de Woox también se entrene al mismo tiempo.

---

## ✨ Fase 3: Experiencia de Creación "Woox Wizard" (Frontend Admin)

**Objetivo:** Interfaz donde el dueño del comercio genera su página en 3 simples pasos sin fricción técnica.

**Tareas:**
1. **Paso 1: Sube tu ADN:** 
   * Drag & Drop para subir su archivo (brochure, carta) o campo de texto libre.
2. **Paso 2: Identidad & Plantilla Inteligente:**
   * **Subida de Logo:** Extracción automática de colores primarios vía JS (`color-thief`).
   * **Sugerencia de Inteligencia:** La IA pre-selecciona la plantilla (ej. "¡Vemos que eres un restaurante! Usaremos la estructura Gastronómica") permitiendo al usuario cambiarla si lo desea.
   * **Tarjetas de Mood (Paletas):** Selector visual (Dark Premium, Minimalista, Neón Dinámico, Clínico) + Selector personalizado.
3. **Paso 3: Pantalla "Creando Magia":** 
   * Animación en tiempo real ("Clasificando industria...", "Afinando paleta...").
4. **Paso 4: ¡Tu Enlace!:**
   * Mostrar el slug generado (`woox.ai/p/tiendita`).

---

## 🎨 Fase 4: Motor de Renderizado Cliente (La Landing Page)

**Objetivo:** Un "Block Engine" reactivo que ensambla la página renderizada basándose en el JSON de la plantilla seleccionada por la IA.

**Tareas:**
1. **Sistema Temático Global (CSS Variables):** 
   * Integrar `--primary`, `--bg`, `--font-heading` manejados desde la BD para inyectar automáticamente la personalidad del negocio.
2. **Librería de "Super Bloques" React/Angular (Componentes Modulares):**
   * `<DynamicHero />`: Variaciones para producto único (Retail), video de fondo (Hoteles) o servicio (Consultoría).
   * `<FeatureGrid />`: Iconos de alto nivel con ventajas competitivas (Ideal para servicios y hoteles).
   * `<WooxCatalog />`: Integración directa a la tabla `products`. Muestra grid dinámico (Menú para restaurantes, Catálogo para eCommerce, Habitaciones para hoteles).
   * `<TestimonialsWall />`: Pruebas sociales renderizadas en tarjetas o carrusel.
   * `<Booking/Contact />`: Formulario o botón conectado al flujo del Agente IA.
3. **Estrategia Multi-Plantilla:**
   * El renderer solo hace un `.map()` sobre el `blocks_order` del JSON. Si es un restaurante, pintará `[Hero, Menú, Mapa]`. Si es un hotel, pintará `[Hero Video, Amenidades, Galería]`.
4. **Botón Flotante IA:** Integración automática del Chatbot Woox en la esquina inferior.

---

## 🛠️ Fase 5: El Micro-Editor (Afinar Detalles)

**Objetivo:** Dar control total pero seguro al usuario, previniendo que arruine el diseño de la plantilla seleccionada.

**Tareas:**
1. **Dashboard de Edición en Vivo:** Panel dividido (Sidebar de configuración + Previsualización Iframe).
2. **Editor In-line Restringido:** Poder hacer clic en un título y cambiar el texto, garantizando que el diseño responsive no se rompa.
3. **Varita Mágica ✨:** Botón flotante al lado de cada párrafo para "Reescribir con IA".
4. **Gestor de Bloques:** Reordenar secciones, ocultarlas o inyectar bloques extras de nuestra galería de componentes modulares.
5. **Selector Global en Vivo:** Cambiar tipografía o paleta de colores y ver cómo la plantilla se actualiza dinámicamente.

---

## 🌐 Resumen de Estrategia de URLs
* **MVP Inicial:** Uso de subrutas dinámicas `woox.ai/p/nombre-del-negocio` (Ej: `/p/burgerkingpro`). Fáciles de implementar, seguras y rápidas.
* **Fase Premium (Futura):** Integración de dominios personalizados completos (`www.minegocio.com`) mediante proxy reverso (Configuración de DNS CNAME).
