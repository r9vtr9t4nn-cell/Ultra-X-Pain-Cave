// Smoothie / fuelling recipes seeded for every new athlete.
export function seedRecipes() {
  return [
    {
      name: 'Tartan Berry Recovery Smoothie',
      category: 'smoothie',
      calories: 520,
      protein: 34,
      carbs: 62,
      fat: 14,
      ingredients: [
        '300ml whole milk',
        '1 scoop whey or plant protein',
        '150g frozen mixed berries',
        '1 banana',
        '30g oats',
        '1 tsp honey',
      ],
      method: 'Blend everything for 45 seconds. Drink within 30 minutes of a long run.',
      tags: ['recovery', 'post-run'],
      seeded: true,
    },
    {
      name: 'Purple Peak Beetroot Endurance',
      category: 'smoothie',
      calories: 410,
      protein: 18,
      carbs: 68,
      fat: 6,
      ingredients: [
        '250ml beetroot juice',
        '1 banana',
        '100g Greek yoghurt',
        '40g frozen blueberries',
        '1 tbsp chia seeds',
      ],
      method: 'Blend until smooth. Best 2–3 hours before a quality session.',
      tags: ['pre-run', 'nitrates'],
      seeded: true,
    },
    {
      name: 'Cairngorm Peanut Banana Fuel',
      category: 'smoothie',
      calories: 640,
      protein: 28,
      carbs: 74,
      fat: 26,
      ingredients: [
        '350ml milk',
        '2 bananas',
        '2 tbsp peanut butter',
        '30g oats',
        '1 tbsp cocoa powder',
        'Pinch of salt',
      ],
      method: 'Blend thick. Ideal the night before a big weekend long run.',
      tags: ['high-carb', 'long-run'],
      seeded: true,
    },
    {
      name: 'Tart Cherry Sleep & Repair',
      category: 'smoothie',
      calories: 330,
      protein: 24,
      carbs: 44,
      fat: 5,
      ingredients: [
        '200ml tart cherry juice',
        '150g 0% Greek yoghurt',
        '1 scoop casein or plant protein',
        '100g frozen cherries',
      ],
      method: 'Blend and drink 60–90 minutes before bed on hard days.',
      tags: ['recovery', 'sleep'],
      seeded: true,
    },
    {
      name: 'Race-Day Carb Bottle (750ml)',
      category: 'fuelling',
      calories: 300,
      protein: 0,
      carbs: 75,
      fat: 0,
      ingredients: ['750ml water', '75g maltodextrin', '1 electrolyte tab', 'Squeeze of lemon'],
      method: 'Mix the night before. Sip through the first 2 hours of the race.',
      tags: ['race-day', 'drink'],
      seeded: true,
    },
    {
      name: 'Checkpoint Rice Cakes (batch of 6)',
      category: 'fuelling',
      calories: 190,
      protein: 5,
      carbs: 34,
      fat: 4,
      ingredients: ['300g cooked sushi rice', '2 tbsp cream cheese', '1 tsp honey', 'Pinch of salt'],
      method: 'Press into a tray, chill, cut into 6. Wrap in foil for the vest.',
      tags: ['race-day', 'solid-food'],
      seeded: true,
    },
  ];
}

/** Fuelling strategy derived from the target finish time. */
export function raceFuellingPlan(targetHours = 13) {
  const hours = Number(targetHours) > 0 ? Number(targetHours) : 13;
  const carbsPerHour = hours > 11 ? 80 : 70;
  const gelsPerHour = Math.round((carbsPerHour * 0.6) / 22 * 10) / 10;
  return {
    targetHours: hours,
    carbsPerHour,
    totalCarbs: Math.round(carbsPerHour * hours),
    gelsPerHour,
    fluidMlPerHour: 500,
    sodiumMgPerHour: 500,
    checkpoints: Math.max(4, Math.round(hours / 2.5)),
    timeline: [
      { at: '0:00–0:45', action: 'Settle in easy. Sip 250ml carb drink, no solids yet.' },
      { at: '0:45–2:00', action: 'First gel at 45 min, then every 30–35 min. Start electrolytes.' },
      { at: '2:00–4:00', action: 'Alternate gel and solid food (rice cake / banana) every 30 min.' },
      { at: '4:00–7:00', action: 'Aim for 80g carbs/hour. Real food at checkpoints, keep moving.' },
      { at: '7:00–10:00', action: 'Switch to softer fuel if appetite drops. Caffeine gel at ~8h.' },
      { at: '10:00–finish', action: 'Coke and gels every 25–30 min. Focus on the next checkpoint only.' },
    ],
  };
}
