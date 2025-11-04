// Define herramientas que Anthropic puede invocar
export const toolSpecs = [
  {
    name: "get_order",
    description: "Obtener datos del pedido por referencia o email.",
    input_schema: {
      type: "object",
      properties: {
        reference: { type: "string" },
        email: { type: "string" }
      }
    }
  },
  {
    name: "get_cms",
    description: "Buscar pasajes de políticas/FAQ según tema y lenguaje.",
    input_schema: {
      type: "object",
      properties: {
        topic: { type: "string" },
        lang: { type: "string" },
        country: { type: "string" }
      },
      required: ["topic","lang"]
    }
  }
];

export const toolHandlers = {
  async get_order({ reference, email }){
    // Aquí conectarías con PS Webservice/DB: mock básico
    return {
      reference: reference || 'N/A',
      status: 'En preparación',
      carrier: 'Transportista personalizado',
      tracking: null,
      eta: null,
      total_paid: 119.90,
      currency: 'EUR'
    };
  },

  async get_cms({ topic, lang, country }){
    // Delega en el RAG con la consulta del tópico en el idioma
    const { retrievePolicySnippets } = await import('./rag.js');
    const top = await retrievePolicySnippets({ query: topic, lang, country, k: 3 });
    return top.map(t => ({ title: t.title, url: t.url, excerpt: t.text.slice(0,700) }));
  }
};
