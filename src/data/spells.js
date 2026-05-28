export const SPELLS = {
  brisa_molhada: {
    id: 'brisa_molhada',
    name: 'Brisa Molhada',
    plants: ['ventoinha', 'gotateia'],
    effect: 'repel',
    targetCreature: 'farfalha_criatura',
    description: 'Cria uma corrente de ar húmido que afasta criaturas leves.',
    color: 0x4fc3f7,
    textureKey: 'spell_brisa',
    unlockZone: 1,
  },
  raiz_ardente: {
    id: 'raiz_ardente',
    name: 'Raiz Ardente',
    plants: ['faisca_mato', 'espinhosa_doce'],
    effect: 'stun',
    targetCreature: 'bocarra_criatura',
    description: 'Uma raiz de fogo prende criaturas ao chão por instantes.',
    color: 0xff7043,
    textureKey: 'spell_raiz',
    unlockZone: 3,
  },
  passo_invisivel: {
    id: 'passo_invisivel',
    name: 'Passo Invisível',
    plants: ['sombravinha', 'lunaria_negra'],
    effect: 'invisible',
    targetCreature: 'eco',
    description: 'A menina fica invisível por alguns segundos.',
    color: 0xce93d8,
    textureKey: 'spell_passo',
    unlockZone: 3,
  },
  canto_jardim: {
    id: 'canto_jardim',
    name: 'Canto do Jardim',
    plants: null, // any 4 plants
    minPlants: 4,
    effect: 'reveal',
    targetCreature: null,
    description: 'Todas as plantas ainda não apanhadas ficam visíveis brevemente.',
    color: 0x66bb6a,
    textureKey: 'spell_canto',
    unlockZone: 1,
  },
};

export const SPELL_ORDER = ['brisa_molhada', 'raiz_ardente', 'passo_invisivel', 'canto_jardim'];
