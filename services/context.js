// services/context.js
export async function buildContext({ message, email, lang, shop_id, thread_id }) {
  // Puedes enriquecer con datos reales del cliente/pedido
  return {
    customer: { id: null, name: null, lang: lang || 'es', country: 'ES', segments: [] },
    order: null,
    shop: { id: shop_id, languages: ['es','en'], countries: ['ES','FR'] },
    thread: { id: thread_id, messages: [] }
  };
}

export function buildSystemPrompt({ brand, limitEUR, limitUSD }) {
  return [
    `Eres un agente de soporte para ${brand}.`,
    `Responde en el idioma del cliente con tono cercano y profesional.`,
    `Usa herramientas para pedidos/políticas. Si falta info, pide lo mínimo en una sola respuesta.`,
    `Cita la política y enlace cuando toque.`,
    `Riesgo legal/RGPD/amenaza/fraude o pedido > ${limitEUR} EUR / ${limitUSD} USD => handoff.`,
    `Devuelve SIEMPRE JSON: reply, confidence [0..1], action ["auto","draft","handoff"], tags, metadata.`
  ].join(' ');
}
